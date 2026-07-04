import QRCode from "qrcode";
import { EAuthTokenPlatformType, LoginSession } from "steam-session";

export interface QRLoginResult {
	success: boolean;
	refreshToken?: string;
	error?: string;
}

export async function loginWithQRCode(
	username: string,
): Promise<QRLoginResult> {
	const log = (msg: string) => console.info(`[${username}] ${msg}`);

	try {
		let authenticated = false;
		let resultToken = "";

		const startSession = (): Promise<boolean> => {
			return new Promise((resolve) => {
				const session = new LoginSession(EAuthTokenPlatformType.MobileApp);

				session.startWithQR().then((startResult) => {
					if (startResult.actionRequired) {
						const qrUrl = startResult.qrChallengeUrl;

						if (!qrUrl) {
							log("No QR challenge URL received");
							resolve(false);
							return;
						}

						const qrString = QRCode.toString(qrUrl, { type: "terminal" });
						log("Scan the following QR Code using your Steam Mobile App:");
						console.log(qrString);
						log("QR code expires in 30 seconds...");
					}

					const refreshTimer = setTimeout(() => {
						if (authenticated) return;
						log("QR code expired, generating new one...");
						session.removeAllListeners();
						startSession().then(resolve);
					}, QR_REFRESH_INTERVAL);

					session.on("authenticated", () => {
						clearTimeout(refreshTimer);
						if (authenticated) return;
						authenticated = true;
						resultToken = session.refreshToken;
						resolve(true);
					});

					session.on("timeout", () => {
						clearTimeout(refreshTimer);
						if (authenticated) return;
						log("QR code expired, generating new one...");
						session.removeAllListeners();
						startSession().then(resolve);
					});

					session.on("error", (err) => {
						clearTimeout(refreshTimer);
						if (authenticated) return;
						log(`QR login error: ${err.message}`);
						resolve(false);
					});
				});
			});
		};

		const result = await startSession();

		if (!result) {
			return { success: false, error: "Authentication failed or timed out" };
		}

		log("QR login successful!");

		return { success: true, refreshToken: resultToken };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		log(`QR login failed: ${errorMsg}`);
		return { success: false, error: errorMsg };
	}
}

export type QRStreamEvent =
	| { type: "qr_url"; url: string }
	| { type: "authenticated"; refreshToken: string }
	| { type: "error"; error: string }
	| { type: "timeout" }
	| { type: "stopped" };

const QR_REFRESH_INTERVAL = 30_000;

export function loginWithQRCodeStream(
	username: string,
	onEvent: (event: QRStreamEvent) => void,
): { stop: () => void } {
	const log = (msg: string) => console.info(`[${username}] ${msg}`);

	let active = true;

	const stop = () => {
		active = false;
	};

	const startSession = async (): Promise<void> => {
		try {
			const session = new LoginSession(EAuthTokenPlatformType.MobileApp);
			const startResult = await session.startWithQR();

			if (!active) return;

			if (startResult.actionRequired) {
				const qrUrl = startResult.qrChallengeUrl;

				if (!qrUrl) {
					onEvent({ type: "error", error: "No QR challenge URL received" });
					return;
				}

				onEvent({ type: "qr_url", url: qrUrl });
				log("QR code generated, waiting for scan...");
			}

			const refreshTimer = setTimeout(() => {
				if (!active) return;
				log("QR code expired, generating new one...");
				session.removeAllListeners();
				startSession();
			}, QR_REFRESH_INTERVAL);

			session.on("authenticated", () => {
				clearTimeout(refreshTimer);
				if (!active) return;
				const refreshToken = session.refreshToken;
				log("QR login successful via GUI!");
				onEvent({ type: "authenticated", refreshToken });
			});

			session.on("timeout", () => {
				clearTimeout(refreshTimer);
				if (!active) return;
				log("QR code expired, generating new one...");
				startSession();
			});

			session.on("error", (err) => {
				clearTimeout(refreshTimer);
				if (!active) return;
				const msg = err instanceof Error ? err.message : String(err);
				log(`QR login error via GUI: ${msg}`);
				onEvent({ type: "error", error: msg });
			});
		} catch (err) {
			if (!active) return;
			const errorMsg = err instanceof Error ? err.message : String(err);
			log(`QR login failed via GUI: ${errorMsg}`);
			onEvent({ type: "error", error: errorMsg });
		}
	};

	startSession();

	return { stop };
}
