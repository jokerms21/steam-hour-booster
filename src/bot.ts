import { createInterface } from "node:readline";
import pRetry from "p-retry";
import Steam, { EConnectionProtocol } from "steam-user";
import { logBuffer } from "./log-buffer";
import { convertRelativePath } from "./path";
import {
	notifyError,
	notifyExpired,
	notifyReconnected,
	sendNotification,
} from "./telegram/bot";
import type { TokenStorage } from "./token-storage";

type LoginDetails = Parameters<Steam["logOn"]>[0];

// To mitigate the following issue: https://github.com/DrWarpMan/steam-hour-booster/issues/9
const LOGIN_TIMEOUT = 10 * 60 * 1000;

export type BotStatus =
	| "Idle"
	| "Playing"
	| "Blocked"
	| "Logged Out"
	| "Expired"
	| "Kicked";

export interface BotInfo {
	username: string;
	status: BotStatus;
	uptime: string;
	games: { appid: string; name: string }[];
	paused: boolean;
	pauseReason: string | null;
	loginMethod: "credentials" | "qrcode";
}

const gameNameCache = new Map<number, string>();

export const MAX_BOOSTED_GAMES = 32;

async function resolveGameName(appId: number): Promise<string> {
	const cached = gameNameCache.get(appId);
	if (cached) return cached;

	try {
		const res = await fetch(
			`https://store.steampowered.com/api/appdetails?appids=${appId}`,
		);
		const data = (await res.json()) as Record<
			string,
			{ success: boolean; data?: { name?: string } }
		>;
		const name = data[String(appId)]?.data?.name;
		if (name) {
			gameNameCache.set(appId, name);
			return name;
		}
	} catch {}

	gameNameCache.set(appId, String(appId));
	return String(appId);
}

export class Bot {
	#username: string;
	#password: string | undefined;
	#games: number[];
	#online: boolean;
	#loginMethod: "credentials" | "qrcode";
	#steam: Steam;
	#tokenStorage: TokenStorage | null;
	#pauseErrors = false;
	#blocked = false;
	#paused = false;
	#pauseReason: string | null = null;
	#status: BotStatus = "Logged Out";
	#startedAt = 0;
	#pausedAt = 0;
	#gameNames: { appid: string; name: string }[] = [];
	#steamGuardRequester: ((username: string) => Promise<string>) | null = null;
	#kickedTimer: ReturnType<typeof setTimeout> | null = null;
	#kickedSafetyTimer: ReturnType<typeof setTimeout> | null = null;
	#safetyDelayActive = false;
	#serviceUnavailableTimer: ReturnType<typeof setTimeout> | null = null;
	#serviceUnavailableRetries = 0;

	constructor(
		username: string,
		password: string | undefined,
		games: number[],
		dataDirectory: string,
		tokenStorage: TokenStorage | null = null,
		online = false,
		loginMethod: "credentials" | "qrcode" = "credentials",
	) {
		this.#username = username.toLowerCase();
		this.#password = password;
		this.#games = games.slice(0, MAX_BOOSTED_GAMES);
		this.#online = online;
		this.#loginMethod = loginMethod;
		this.#tokenStorage = tokenStorage;

		this.#steam = new Steam({
			autoRelogin: false,
			dataDirectory: convertRelativePath(dataDirectory),
			protocol: EConnectionProtocol.TCP,
		});

		this.#setup();
	}

	get info(): BotInfo {
		let uptimeMs = 0;
		if (this.#startedAt > 0) {
			uptimeMs = Date.now() - this.#startedAt;
			if (this.#paused && this.#pausedAt > 0) {
				uptimeMs -= Date.now() - this.#pausedAt;
			}
		}
		const uptime = this.#startedAt > 0 ? formatUptime(uptimeMs) : "-";

		return {
			username: this.#username,
			status: this.#status,
			uptime,
			games: this.#gameNames,
			paused: this.#paused,
			pauseReason: this.#pauseReason,
			loginMethod: this.#loginMethod,
		};
	}

	setSteamGuardRequester(
		requester: (username: string) => Promise<string>,
	): void {
		this.#steamGuardRequester = requester;
	}

	updateConfig(entry: {
		password?: string;
		games?: number[];
		online?: boolean;
		loginMethod?: "credentials" | "qrcode";
	}): void {
		if (entry.password !== undefined) this.#password = entry.password;
		if (entry.games !== undefined) this.#games = entry.games;
		if (entry.loginMethod !== undefined) this.#loginMethod = entry.loginMethod;

		if (entry.online !== undefined) {
			this.#online = entry.online;
			if (this.#status === "Playing") {
				this.#steam.setPersona(
					this.#online
						? Steam.EPersonaState.Online
						: Steam.EPersonaState.Offline,
				);
			}
		}

		if (this.#status === "Playing" || this.#status === "Blocked") {
			this.#play();
		}

		this.#log("Config updated.");
	}

	#log(msg: string): void {
		console.info(`[${this.#username}] ${msg}`);
		logBuffer.add("info", this.#username, msg);
	}

	#setup(): void {
		this.#steam.on("loggedOn", async () => {
			this.#log("Logged in.");
			if (this.#startedAt === 0) {
				notifyReconnected(this.#username);
			}
			this.#startedAt = Date.now();

			if (this.#safetyDelayActive) {
				this.#log("Safety delay active — skipping auto-play on login.");
				await this.#resolveGameNames();
				return;
			}

			this.#status = "Playing";
			await this.#resolveGameNames();
		});

		this.#steam.on("disconnected", (eresult, msg) => {
			console.log("[DEBUG] event: disconnected", eresult, msg);
			if (this.#status !== "Expired") {
				this.#status = "Logged Out";
			}
			this.#startedAt = 0;
		});

		this.#steam.on("error", (err) => {
			if (this.#pauseErrors) {
				return;
			}

			this.#log(`Error: ${err.message}`);

			// eresult 27 = Expired — handle immediately, don't retry
			if ((err as Error & { eresult?: number }).eresult === 27) {
				this.#handleTokenExpired();
				return;
			}

			// eresult 6 = LoggedInElsewhere — kicked by user, auto-resume in 3 min
			if ((err as Error & { eresult?: number }).eresult === 6) {
				this.#handleKicked();
				return;
			}

			// eresult 20 = ServiceUnavailable — Steam server issue, retry with backoff
			if ((err as Error & { eresult?: number }).eresult === 20) {
				this.#handleServiceUnavailable();
				return;
			}

			// eresult 3 = NoConnection — connection lost, retry
			if ((err as Error & { eresult?: number }).eresult === 3) {
				this.#handleServiceUnavailable();
				return;
			}

			notifyError(this.#username, err.message);
			this.#handleError(err);
		});

		this.#steam.on("playingState", (blocked, playingApp) => {
			this.#blocked = blocked;

			if (!blocked && playingApp !== 0) {
				return;
			}

			this.#log(`Playing state changed: ${blocked} (App ID: ${playingApp})`);

			this.#play();
		});

		this.#steam.on("steamGuard", async (_, callback) => {
			if (this.#loginMethod === "qrcode") {
				this.#log(
					"Steam Guard required but login method is QR code. Use GUI to re-login.",
				);
				callback("");
				return;
			}

			this.#log("Steam Guard code required...");

			let code = "";

			if (this.#steamGuardRequester) {
				try {
					code = await this.#steamGuardRequester(this.#username);
				} catch {
					code = "";
				}
			}

			if (!code) {
				code = await new Promise<string>((resolve) => {
					const rl = createInterface({
						input: process.stdin,
						output: process.stdout,
					});
					rl.question(`[${this.#username}] Steam Guard code: `, (answer) => {
						rl.close();
						resolve(answer);
					});
				});
			}

			if (!code) {
				console.error("No Steam Guard code provided, exiting.");
				process.exit(0);
			}

			callback(code);
		});

		this.#steam.on("refreshToken", (refreshToken) => {
			this.#log("New refresh token received.");
			this.#tokenStorage?.setToken(this.#username, refreshToken);
		});
	}

	async login(): Promise<void> {
		this.#log("Logging in...");

		const token = await this.#tokenStorage?.getToken(this.#username);

		if (!token && this.#loginMethod === "qrcode") {
			this.#log("No token. Use GUI QR Login to authenticate.");
			this.#status = "Logged Out";
			return;
		}

		if (!token && this.#loginMethod === "credentials" && !this.#password) {
			this.#log("No password provided. Edit account to set a password.");
			this.#status = "Logged Out";
			return;
		}

		const details = await this.#createLoginDetails();

		this.#log("Prepared login credentials.");

		const { promise, resolve, reject } = Promise.withResolvers();

		const loggedOnCallback = () => resolve();
		const errorCallback = (err: unknown) => reject(err);
		const loginTimeout = setTimeout(
			() => reject(new Error("Login timed out.")),
			LOGIN_TIMEOUT,
		);

		const cleanup = () => {
			clearTimeout(loginTimeout);
			this.#steam.removeListener("loggedOn", loggedOnCallback);
			this.#steam.removeListener("error", errorCallback);
			this.#pauseErrors = false;
		};

		this.#pauseErrors = true;

		this.#steam.once("loggedOn", loggedOnCallback);
		this.#steam.once("error", errorCallback);

		try {
			this.#steam.logOn(details);

			await promise;
		} finally {
			cleanup();
		}

		if (this.#online) {
			this.#steam.setPersona(Steam.EPersonaState.Online);
		}
	}

	async loginWithQR(
		onEvent: (event: {
			type: string;
			url?: string;
			refreshToken?: string;
			error?: string;
		}) => void,
	): Promise<{ stop: () => void }> {
		const { loginWithQRCodeStream } = await import("./qr-login");

		const qr = loginWithQRCodeStream(this.#username, async (event) => {
			onEvent(event);

			if (event.type === "authenticated" && event.refreshToken) {
				await this.#tokenStorage?.setToken(this.#username, event.refreshToken);
				this.#log("QR login successful via GUI, token saved.");
				await this.login();
			}
		});

		return qr;
	}

	async logout(): Promise<void> {
		this.#log("Logging out...");

		const { promise, resolve } = Promise.withResolvers();

		this.#steam.once("disconnected", () => resolve());

		this.#steam.logOff();

		await promise;
	}

	pause(reason?: string): void {
		if (this.#paused || this.#status !== "Playing") return;
		this.#paused = true;
		this.#pausedAt = Date.now();
		this.#pauseReason = reason ?? "Paused by user";
		this.#steam.gamesPlayed([]);
		this.#steam.setPersona(Steam.EPersonaState.Offline);
		this.#status = "Idle";
		this.#log(`Boosting paused: ${this.#pauseReason}`);
	}

	resume(): void {
		if (!this.#paused) return;
		this.#paused = false;
		this.#pauseReason = null;
		this.#startedAt += Date.now() - this.#pausedAt;
		this.#pausedAt = 0;
		this.#steam.setPersona(
			this.#online ? Steam.EPersonaState.Online : Steam.EPersonaState.Offline,
		);
		this.#play();
		this.#log("Boosting resumed.");
	}

	async #resolveGameNames(): Promise<void> {
		this.#gameNames = await Promise.all(
			this.#games.map(async (appId) => ({
				appid: String(appId),
				name: await resolveGameName(appId),
			})),
		);
	}

	async #createLoginDetails(): Promise<LoginDetails> {
		const details = {
			renewRefreshTokens: true,
		};

		const token = await this.#tokenStorage?.getToken(this.#username);

		if (token) {
			return {
				refreshToken: token,
				...details,
			};
		}

		if (!this.#password) {
			throw new Error("No password provided and no token available");
		}

		return {
			accountName: this.#username,
			password: this.#password,
			...details,
		};
	}

	#play() {
		if (this.#safetyDelayActive) {
			return;
		}

		if (this.#paused) {
			this.#steam.gamesPlayed([]);
			this.#status = "Idle";
			return;
		}

		if (this.#blocked) {
			this.#steam.gamesPlayed([]);
			this.#status = "Blocked";
			this.#log("Stopped playing.");
		} else {
			this.#steam.gamesPlayed(this.#games);
			this.#status = "Playing";
			this.#log(`Playing ${this.#games.length} games.`);
		}
	}

	async #handleError(err: Error & { eresult?: Steam.EResult }): Promise<void> {
		console.error(err);

		// eresult 27 = Expired — refresh token is dead, must re-authenticate
		if (err.eresult === 27) {
			await this.#handleTokenExpired();
			return;
		}

		// eresult 3 = NoConnection, eresult 20 = ServiceUnavailable — retry
		if (err.eresult === 3 || err.eresult === 20) {
			this.#handleServiceUnavailable();
			return;
		}

		try {
			await this.logout();

			await pRetry(() => this.login(), {
				retries: 10,
				factor: 2,
				minTimeout: 10 * 1000,
			});

			this.#log("Re-login successful.");
		} catch (err) {
			console.error(err);

			this.#log("Could not re-login after multiple attempts, logging off.");
			this.#steam.logOff();
		}
	}

	async #handleTokenExpired(): Promise<void> {
		this.#log("Session expired (eresult: 27). Token is no longer valid.");
		this.#status = "Expired";
		this.#startedAt = 0;
		this.#steam.logOff();
		notifyExpired(this.#username);

		// Delete expired token so next login uses credentials or prompts QR
		try {
			await this.#tokenStorage?.deleteToken(this.#username);
			this.#log("Expired token deleted. Use GUI to re-login.");
		} catch {}
	}

	#handleKicked(): void {
		if (this.#kickedTimer) return;

		// Cancel safety timer if user kicks again during confirmation window
		if (this.#kickedSafetyTimer) {
			clearTimeout(this.#kickedSafetyTimer);
			this.#kickedSafetyTimer = null;
			this.#log("Safety timer cancelled — user kicked again.");
		}

		this.#log("Logged in elsewhere (eresult: 6). Will retry every 3 minutes.");
		this.#status = "Kicked";
		this.#startedAt = 0;
		this.#steam.logOff();

		sendNotification(
			`🟡 <b>Kicked</b> — ${this.#username}\nLogged in elsewhere. Will retry every 3 minutes.`,
		);

		this.#scheduleKickedRetry();
	}

	#scheduleKickedRetry(): void {
		this.#kickedTimer = setTimeout(
			async () => {
				this.#kickedTimer = null;
				this.#log("Attempting to resume after kick...");

				this.#safetyDelayActive = true;

				try {
					await this.login();

					if (this.#online) {
						this.#steam.setPersona(Steam.EPersonaState.Online);
					}

					// Safety delay: wait before boosting to make sure user is truly done
					const safetyDelaySec = Number(Bun.env["KICKED_SAFETY_DELAY"] ?? "180");
					const SAFETY_DELAY_MS = safetyDelaySec * 1000;
					this.#log(`Account free. Waiting ${SAFETY_DELAY_MS / 1000}s safety delay before boosting...`);
					this.#status = "Idle";

					sendNotification(
						`🟡 <b>Account free</b> — ${this.#username}\nWaiting ${SAFETY_DELAY_MS / 1000}s safety delay before boosting...`,
					);

					this.#kickedSafetyTimer = setTimeout(() => {
						this.#kickedSafetyTimer = null;
						this.#safetyDelayActive = false;

						// Check if user kicked again during safety delay
						if (this.#status === "Kicked") {
							this.#log("Safety delay: user kicked again, skipping boost.");
							return;
						}

						this.#play();
						this.#log("Auto-resume successful after kick (safety delay passed).");
						sendNotification(`🟢 <b>Auto-resumed</b> — ${this.#username}`);
					}, SAFETY_DELAY_MS);
				} catch (err) {
					this.#safetyDelayActive = false;
					const msg = err instanceof Error ? err.message : String(err);

					// Still logged in elsewhere — schedule another retry
					if (msg.includes("LoggedInElsewhere") || msg.includes("eresult: 6")) {
						this.#log("Still logged in elsewhere. Retrying in 3 minutes...");
						this.#status = "Kicked";
						this.#scheduleKickedRetry();
						return;
					}

					console.error(err);
					this.#log("Auto-resume failed after kick.");
					notifyError(this.#username, `Auto-resume failed: ${msg}`);
				}
			},
			3 * 60 * 1000,
		);
	}

	#handleServiceUnavailable(): void {
		if (this.#serviceUnavailableTimer) return;

		this.#serviceUnavailableRetries++;
		const delaySec = Math.min(30 * this.#serviceUnavailableRetries, 300);
		const delayMs = delaySec * 1000;

		this.#log(`ServiceUnavailable (eresult: 20). Retry #${this.#serviceUnavailableRetries} in ${delaySec}s.`);
		this.#status = "Logged Out";
		this.#startedAt = 0;
		this.#steam.logOff();

		if (this.#serviceUnavailableRetries === 1) {
			sendNotification(
				`⚠️ <b>Service Unavailable</b> — ${this.#username}\nSteam server issue. Retrying with backoff.`,
			);
		}

		this.#serviceUnavailableTimer = setTimeout(
			async () => {
				this.#serviceUnavailableTimer = null;
				this.#log(`Retrying after ServiceUnavailable (#${this.#serviceUnavailableRetries})...`);

				try {
					await this.login();

					this.#serviceUnavailableRetries = 0;

					if (this.#online) {
						this.#steam.setPersona(Steam.EPersonaState.Online);
					}

					this.#play();
					this.#log("Reconnected after ServiceUnavailable.");

					sendNotification(`🟢 <b>Reconnected</b> — ${this.#username}`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);

					if (msg.includes("ServiceUnavailable") || msg.includes("eresult: 20")) {
						this.#handleServiceUnavailable();
						return;
					}

					console.error(err);
					this.#log("Retry failed after ServiceUnavailable.");
					this.#serviceUnavailableRetries = 0;
					notifyError(this.#username, `ServiceUnavailable retry failed: ${msg}`);
				}
			},
			delayMs,
		);
	}
}

function formatUptime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}
