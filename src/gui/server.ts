import { resolve } from "node:path";
import type { Bot } from "../bot";
import type { ConfigEntry, ConfigManager } from "../config";
import { logBuffer } from "../log-buffer";

const PUBLIC_DIR = resolve(import.meta.dir, "./public");

// Game search cache
const searchCache = new Map<
	string,
	{ games: { appid: number; name: string }[]; ts: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function searchApps(
	query: string,
): Promise<{ games: { appid: number; name: string }[]; cached: boolean }> {
	const key = query.toLowerCase().trim();
	const cached = searchCache.get(key);
	if (cached && Date.now() - cached.ts < CACHE_TTL) {
		return { games: cached.games, cached: true };
	}

	try {
		const resp = await fetch(
			`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(key)}&l=english&cc=US`,
		);
		if (!resp.ok) return { games: [], cached: false };
		const data = (await resp.json()) as {
			items?: { id: number; name: string }[];
		};
		const games = (data.items || []).slice(0, 15).map((g) => ({
			appid: g.id,
			name: g.name,
		}));
		searchCache.set(key, { games, ts: Date.now() });
		return { games, cached: false };
	} catch (err) {
		console.error("[GUI] searchApps error:", err);
		return { games: [], cached: false };
	}
}

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
};

function getMimeType(path: string): string {
	const ext = path.substring(path.lastIndexOf("."));
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

type WsClient = { send(msg: string): void };

const guiState = {
	broadcast: null as ((data: unknown) => void) | null,
	clients: null as Set<WsClient> | null,
};

const activeQRSessions = new Map<string, { stop: () => void }>();
const steamGuardPending = new Map<
	string,
	{ resolve: (code: string) => void; reject: (err: Error) => void }
>();

export function requestSteamGuardCode(
	username: string,
	broadcast: (data: unknown) => void,
): Promise<string> {
	return new Promise((resolve, reject) => {
		steamGuardPending.set(username, {
			resolve: (code) => {
				steamGuardPending.delete(username);
				resolve(code);
			},
			reject: (err) => {
				steamGuardPending.delete(username);
				reject(err);
			},
		});
		broadcast({ type: "steamGuard", username });
	});
}

export function submitSteamGuardCode(username: string, code: string): boolean {
	const pending = steamGuardPending.get(username);
	if (!pending) return false;
	steamGuardPending.delete(username);
	pending.resolve(code);
	return true;
}

export interface GuiServerOptions {
	port: number;
	domain?: string | undefined;
	certFile?: string | undefined;
	keyFile?: string | undefined;
	username?: string | undefined;
	password?: string | undefined;
}

export function startGuiServer(
	bots: Bot[],
	options: GuiServerOptions,
	configManager: ConfigManager,
	createBot: (entry: ConfigEntry) => Bot,
): void {
	const clients = new Set<WsClient>();

	const broadcast = (data: unknown) => {
		const msg = JSON.stringify(data);
		for (const ws of clients) {
			ws.send(msg);
		}
	};

	guiState.broadcast = broadcast;
	guiState.clients = clients;
	logBuffer.setBroadcast(broadcast);

	for (const bot of bots) {
		bot.setSteamGuardRequester((username) =>
			requestSteamGuardCode(username, broadcast),
		);
	}

	const getStatus = () => bots.map((bot) => bot.info);

	const tlsOptions =
		options.certFile && options.keyFile
			? {
					cert: Bun.file(options.certFile),
					key: Bun.file(options.keyFile),
				}
			: undefined;

	const authRequired = options.username && options.password;

	const checkAuth = (req: Request): Response | null => {
		if (!authRequired) return null;

		const authHeader = req.headers.get("Authorization");
		if (!authHeader?.startsWith("Basic ")) {
			return new Response("Authentication required", {
				status: 401,
				headers: { "WWW-Authenticate": 'Basic realm="Steam Hour Booster"' },
			});
		}

		const decoded = atob(authHeader.slice(6));
		const [user, pass] = decoded.split(":");

		if (user === options.username && pass === options.password) {
			return null;
		}

		return new Response("Invalid credentials", {
			status: 401,
			headers: { "WWW-Authenticate": 'Basic realm="Steam Hour Booster"' },
		});
	};

	// Scheduler: check schedules every minute
	const getLocalTime = (tz: string): { hour: number; minute: number } => {
		const now = new Date();
		const str = now.toLocaleString("en-US", {
			hour: "numeric",
			hour12: false,
			minute: "numeric",
			timeZone: tz,
		});
		const parts = str.split(":");
		const h = Number(parts[0]) || 0;
		const m = Number(parts[1]) || 0;
		return { hour: h, minute: m };
	};

	const isInSchedule = (schedule: {
		enabled: boolean;
		startHour: number;
		startMinute: number;
		endHour: number;
		endMinute: number;
		timezone: string;
	}): boolean => {
		if (!schedule.enabled) return false;
		const { hour, minute } = getLocalTime(schedule.timezone);
		const now = hour * 60 + minute;
		const start = schedule.startHour * 60 + schedule.startMinute;
		const end = schedule.endHour * 60 + schedule.endMinute;

		if (start <= end) {
			return now >= start && now < end;
		}
		return now >= start || now < end;
	};

	setInterval(() => {
		const entries = configManager.getAll();
		for (const bot of bots) {
			const entry = entries.find(
				(e) => e.username.toLowerCase() === bot.info.username.toLowerCase(),
			);
			if (!entry?.schedule?.enabled) continue;

			const shouldRun = isInSchedule(entry.schedule);
			if (shouldRun && bot.info.paused) {
				bot.resume();
				logBuffer.add("info", bot.info.username, "Schedule: auto-resumed");
				broadcast({ type: "status", data: getStatus() });
			} else if (
				!shouldRun &&
				!bot.info.paused &&
				bot.info.status === "Playing"
			) {
				bot.pause("Schedule: auto-paused");
				logBuffer.add("info", bot.info.username, "Schedule: auto-paused");
				broadcast({ type: "status", data: getStatus() });
			}
		}
	}, 60_000);

	Bun.serve({
		port: options.port,
		...(tlsOptions ? { tls: tlsOptions } : {}),
		async fetch(req, server) {
			try {
				const authError = checkAuth(req);
				if (authError) return authError;

				const url = new URL(req.url);

				// API: search games
				if (url.pathname === "/api/games/search" && req.method === "GET") {
					try {
						const query = url.searchParams.get("q") || "";
						if (query.length < 2) {
							return Response.json({ games: [], cached: false });
						}
						const result = await searchApps(query);
						return Response.json(result);
					} catch (err) {
						console.error("[GUI] /api/games/search error:", err);
						return Response.json(
							{ games: [], cached: false, error: String(err) },
							{ status: 500 },
						);
					}
				}

				// WebSocket upgrade
				if (url.pathname === "/ws") {
					const upgraded = server.upgrade(req);
					if (!upgraded) {
						return new Response("WebSocket upgrade failed", { status: 400 });
					}
					return undefined;
				}

				// API: project info for bug reports
				if (url.pathname === "/api/info" && req.method === "GET") {
					let version = "unknown";
					let dependencies: Record<string, string> = {};
					try {
						const pkg = (await Bun.file(
							resolve(import.meta.dir, "../../package.json"),
						).json()) as {
							version?: string;
							dependencies?: Record<string, string>;
						};
						version = pkg.version || "unknown";
						dependencies = pkg.dependencies || {};
					} catch {
						// package.json not found or invalid
					}
					const uptimeSec = Math.floor(process.uptime());
					const h = Math.floor(uptimeSec / 3600);
					const m = Math.floor((uptimeSec % 3600) / 60);
					const s = uptimeSec % 60;
					return Response.json({
						version,
						dependencies,
						accounts: bots.length,
						uptime: `${h}h ${m}m ${s}s`,
						bunVersion: Bun.version,
						platform: process.platform,
						arch: process.arch,
					});
				}

				// API: current status
				if (url.pathname === "/api/status") {
					return Response.json(getStatus());
				}

				// API: logs
				if (url.pathname === "/api/logs") {
					const level = url.searchParams.get("level");
					const user = url.searchParams.get("user");
					const filter: { level?: "info" | "warn" | "error"; user?: string } =
						{};
					if (level === "info" || level === "warn" || level === "error") {
						filter.level = level;
					}
					if (user) {
						filter.user = user;
					}
					return Response.json(logBuffer.getFiltered(filter));
				}

				// API: list accounts
				if (url.pathname === "/api/accounts" && req.method === "GET") {
					const accounts = configManager.getAll().map((acc) => ({
						...acc,
						password: acc.password ? "••••••••" : undefined,
					}));
					return Response.json(accounts);
				}

				// API: add account
				if (url.pathname === "/api/accounts" && req.method === "POST") {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const entry = {
							username: body["username"] as string,
							password: body["password"] as string | undefined,
							games: body["games"] as number[],
							online: (body["online"] as boolean) ?? false,
							loginMethod:
								(body["loginMethod"] as "credentials" | "qrcode") ??
								"credentials",
							schedule: body["schedule"] as ConfigEntry["schedule"],
						};
						
						// Check if account already exists
						const usernameLower = entry.username.toLowerCase();
						if (bots.find(b => b.info.username === usernameLower)) {
							return Response.json({ 
								ok: false, 
								error: "Account already exists" 
							}, { status: 400 });
						}
						
						configManager.add(entry);
						
						// Create and start the bot
						const bot = createBot(entry);
						bot.setSteamGuardRequester((username) =>
							requestSteamGuardCode(username, broadcast),
						);
						bots.push(bot);
						bot.login();
						
						broadcast({ type: "status", data: getStatus() });
						return Response.json({ ok: true });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: QR login
				if (url.pathname === "/api/qr-login" && req.method === "POST") {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const username = body["username"] as string;

						if (!username) {
							return Response.json(
								{ ok: false, error: "Username required" },
								{ status: 400 },
							);
						}

						const bot = bots.find(
							(b) => b.info.username === username.toLowerCase(),
						);

						if (!bot) {
							return Response.json(
								{ ok: false, error: "Account not found" },
								{ status: 404 },
							);
						}

						const existing = activeQRSessions.get(username);
						if (existing) {
							existing.stop();
							activeQRSessions.delete(username);
						}

						const qr = await bot.loginWithQR((event) => {
							broadcast({ ...event, username, qr: true });
						});

						activeQRSessions.set(username, qr);

						return Response.json({ ok: true });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: stop QR login
				if (url.pathname === "/api/qr-stop" && req.method === "POST") {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const username = body["username"] as string;

						const session = activeQRSessions.get(username);
						if (session) {
							session.stop();
							activeQRSessions.delete(username);
						}

						return Response.json({ ok: true });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: submit Steam Guard code
				if (url.pathname === "/api/steam-guard" && req.method === "POST") {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const username = body["username"] as string;
						const code = body["code"] as string;

						if (!username || !code) {
							return Response.json(
								{ ok: false, error: "Username and code required" },
								{ status: 400 },
							);
						}

						const accepted = submitSteamGuardCode(username, code);
						return Response.json({ ok: accepted });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: cancel Steam Guard (use console instead)
				if (
					url.pathname === "/api/steam-guard-cancel" &&
					req.method === "POST"
				) {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const username = body["username"] as string;

						const pending = steamGuardPending.get(username);
						if (pending) {
							steamGuardPending.delete(username);
							pending.reject(new Error("Cancelled"));
						}

						return Response.json({ ok: true });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: pause bot
				if (url.pathname === "/api/bot/pause" && req.method === "POST") {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const username = body["username"] as string;

						const bot = bots.find(
							(b) => b.info.username === username.toLowerCase(),
						);

						if (!bot) {
							return Response.json(
								{ ok: false, error: "Account not found" },
								{ status: 404 },
							);
						}

						bot.pause("Paused by user");
						broadcast({ type: "status", data: getStatus() });
						return Response.json({ ok: true });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: resume bot
				if (url.pathname === "/api/bot/resume" && req.method === "POST") {
					try {
						const body = (await req.json()) as Record<string, unknown>;
						const username = body["username"] as string;

						const bot = bots.find(
							(b) => b.info.username === username.toLowerCase(),
						);

						if (!bot) {
							return Response.json(
								{ ok: false, error: "Account not found" },
								{ status: 404 },
							);
						}

						bot.resume();
						broadcast({ type: "status", data: getStatus() });
						return Response.json({ ok: true });
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						return Response.json({ ok: false, error: msg }, { status: 400 });
					}
				}

				// API: pause all bots
				if (url.pathname === "/api/bot/pause-all" && req.method === "POST") {
					for (const bot of bots) {
						bot.pause("Paused by user (all)");
					}
					broadcast({ type: "status", data: getStatus() });
					return Response.json({ ok: true });
				}

				// API: resume all bots
				if (url.pathname === "/api/bot/resume-all" && req.method === "POST") {
					for (const bot of bots) {
						bot.resume();
					}
					broadcast({ type: "status", data: getStatus() });
					return Response.json({ ok: true });
				}

				// API: update/delete account
				const accountMatch = url.pathname.match(/^\/api\/accounts\/(.+)$/);
				if (accountMatch?.[1]) {
					const username = decodeURIComponent(accountMatch[1]);

					if (req.method === "PUT") {
						try {
							const body = (await req.json()) as Record<string, unknown>;
							configManager.update(username, body);

							const bot = bots.find(
								(b) => b.info.username === username.toLowerCase(),
							);

							if (bot) {
								const update: {
									password?: string;
									games?: number[];
									online?: boolean;
									loginMethod?: "credentials" | "qrcode";
								} = {};

								if (typeof body["password"] === "string")
									update.password = body["password"];
								if (Array.isArray(body["games"]))
									update.games = body["games"] as number[];
								if (typeof body["online"] === "boolean")
									update.online = body["online"];
								if (
									body["loginMethod"] === "credentials" ||
									body["loginMethod"] === "qrcode"
								)
									update.loginMethod = body["loginMethod"];

								bot.updateConfig(update);
							}

							broadcast({ type: "status", data: getStatus() });
							return Response.json({ ok: true });
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							return Response.json({ ok: false, error: msg }, { status: 400 });
						}
					}

					if (req.method === "DELETE") {
						try {
							configManager.delete(username);
							return Response.json({ ok: true });
						} catch (err) {
							const msg = err instanceof Error ? err.message : String(err);
							return Response.json({ ok: false, error: msg }, { status: 400 });
						}
					}
				}

				// Static files
				let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
				if (filePath === "/favicon.ico") {
					return Response.redirect("/favicon.svg", 302);
				}
				filePath = resolve(PUBLIC_DIR, `.${filePath}`);

				const file = Bun.file(filePath);
				if (await file.exists()) {
					return new Response(file, {
						headers: { "Content-Type": getMimeType(filePath) },
					});
				}

				return new Response("Not Found", { status: 404 });
			} catch (err) {
				console.error("[GUI] Unhandled fetch error:", err);
				return new Response("Internal Server Error", { status: 500 });
			}
		},
		websocket: {
			open(ws) {
				clients.add(ws);
				ws.send(JSON.stringify({ type: "init", data: getStatus() }));
				ws.send(
					JSON.stringify({
						type: "logs_init",
						data: logBuffer.getAll().slice(-50),
					}),
				);

				for (const username of steamGuardPending.keys()) {
					ws.send(JSON.stringify({ type: "steamGuard", username }));
				}
			},
			message() {},
			close(ws) {
				clients.delete(ws);
			},
		},
	});

	setInterval(() => {
		broadcast({ type: "status", data: getStatus() });
	}, 2000);

	const protocol = tlsOptions ? "https" : "http";
	const host = options.domain ?? `localhost:${options.port}`;
	const authInfo = authRequired ? " (auth enabled)" : "";
	console.info(`GUI panel running at ${protocol}://${host}/${authInfo}`);
}

export function guiBroadcast(data: unknown): void {
	guiState.broadcast?.(data);
}
