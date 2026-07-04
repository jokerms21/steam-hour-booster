import { Bot } from "./bot";
import { ConfigManager, loadConfig } from "./config";
import { startGuiServer } from "./gui/server";
import { DefaultTokenStorage } from "./token-storage";

// Global error handlers — prevent crashes from unhandled exceptions
process.on("uncaughtException", (err) => {
	console.error("[FATAL] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
	console.error("[FATAL] Unhandled rejection:", reason);
});

console.info("Starting Steam Hour Booster");

const configPath = Bun.env["CONFIG_PATH"] ?? "./config.json";
const tokenStorageDir = Bun.env["TOKEN_STORAGE_DIRECTORY"] ?? "./tokens";
const steamDataDirectory = Bun.env["STEAM_DATA_DIRECTORY"] ?? "./steam-data";
const guiPort = Number(Bun.env["MONITOR_PORT"] ?? "3000");
const guiDomain = Bun.env["GUI_DOMAIN"];
const guiCertFile = Bun.env["GUI_CERT_FILE"];
const guiKeyFile = Bun.env["GUI_KEY_FILE"];
const guiUsername = Bun.env["GUI_USERNAME"];
const guiPassword = Bun.env["GUI_PASSWORD"];

const config = await loadConfig(configPath);
const configManager = new ConfigManager(configPath, config);
const ts = new DefaultTokenStorage(tokenStorageDir);

const bots: Bot[] = [];

for (const entry of config) {
	const bot = new Bot(
		entry.username,
		entry.password,
		entry.games,
		steamDataDirectory,
		ts,
		entry.online,
		entry.loginMethod,
	);

	bots.push(bot);
}

// Start GUI server first so it's available during login
startGuiServer(
	bots,
	{
		port: guiPort,
		domain: guiDomain,
		certFile: guiCertFile,
		keyFile: guiKeyFile,
		username: guiUsername,
		password: guiPassword,
	},
	configManager,
);

// Login bots (non-blocking - Steam Guard prompts won't block the server)
for (const bot of bots) {
	bot.login();
}
