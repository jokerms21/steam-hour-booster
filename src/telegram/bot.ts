import { Bot } from "grammy";
import type { Bot as SteamBot } from "../bot";

interface TelegramBotOptions {
	token: string;
	chatId?: string | null;
}

let telegramBot: Bot | null = null;
let allowedChatId: string | null = null;
let steamBots: SteamBot[] = [];

export function initTelegramBot(
	options: TelegramBotOptions,
	bots: SteamBot[],
): void {
	if (!options.token) return;

	steamBots = bots;
	allowedChatId = options.chatId ?? null;
	telegramBot = new Bot(options.token);

	telegramBot.command("start", (ctx) => {
		const chatId = String(ctx.chat.id);

		if (allowedChatId && chatId !== allowedChatId) {
			return ctx.reply("Access denied.");
		}

		if (!allowedChatId) {
			allowedChatId = chatId;
		}

		return ctx.reply(
			"Steam Hour Booster Bot\n\n" +
				"Commands:\n" +
				"/status — All accounts status\n" +
				"/accounts — List accounts\n" +
				"/pause <username> — Pause account\n" +
				"/resume <username> — Resume account\n" +
				"/pause_all — Pause all accounts\n" +
				"/resume_all — Resume all accounts\n" +
				"/log — Last 10 log entries",
		);
	});

	telegramBot.command("status", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		const statuses = steamBots.map((b) => {
			const info = b.info;
			const statusIcon =
				info.status === "Playing"
					? "🟢"
					: info.status === "Expired"
						? "🟠"
						: info.paused
							? "🟡"
							: "🔴";
			return `${statusIcon} ${info.username} — ${info.status}${info.paused ? ` (${info.pauseReason})` : ""} | ${info.uptime} | ${info.games.length} games`;
		});

		return ctx.reply(
			`Accounts (${steamBots.length}):\n\n${statuses.join("\n")}`,
		);
	});

	telegramBot.command("accounts", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		const list = steamBots.map((b) => {
			const info = b.info;
			return `• ${info.username} (${info.loginMethod}) — ${info.games.length} games`;
		});

		return ctx.reply(`Accounts:\n\n${list.join("\n")}`);
	});

	telegramBot.command("pause", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		const username = ctx.match;
		if (!username) {
			return ctx.reply("Usage: /pause <username>");
		}

		const bot = steamBots.find(
			(b) => b.info.username === username.toLowerCase(),
		);
		if (!bot) {
			return ctx.reply(`Account "${username}" not found.`);
		}

		if (bot.info.status !== "Playing") {
			return ctx.reply(
				`${username} is not playing (status: ${bot.info.status}).`,
			);
		}

		bot.pause("Paused via Telegram");
		return ctx.reply(`${username} paused.`);
	});

	telegramBot.command("resume", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		const username = ctx.match;
		if (!username) {
			return ctx.reply("Usage: /resume <username>");
		}

		const bot = steamBots.find(
			(b) => b.info.username === username.toLowerCase(),
		);
		if (!bot) {
			return ctx.reply(`Account "${username}" not found.`);
		}

		if (!bot.info.paused) {
			return ctx.reply(`${username} is not paused.`);
		}

		bot.resume();
		return ctx.reply(`${username} resumed.`);
	});

	telegramBot.command("pause_all", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		let paused = 0;
		for (const bot of steamBots) {
			if (bot.info.status === "Playing" && !bot.info.paused) {
				bot.pause("Paused all via Telegram");
				paused++;
			}
		}

		return ctx.reply(`Paused ${paused} account(s).`);
	});

	telegramBot.command("resume_all", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		let resumed = 0;
		for (const bot of steamBots) {
			if (bot.info.paused) {
				bot.resume();
				resumed++;
			}
		}

		return ctx.reply(`Resumed ${resumed} account(s).`);
	});

	telegramBot.command("log", async (ctx) => {
		if (!isAllowed(ctx.chat.id)) return;

		const { logBuffer } = await import("../log-buffer");
		const logs = logBuffer.getFiltered().slice(-10);

		if (logs.length === 0) {
			return ctx.reply("No logs yet.");
		}

		const text = logs
			.map((l) => `[${l.time}] [${l.user}] [${l.level.toUpperCase()}] ${l.msg}`)
			.join("\n");

		return ctx.reply(`<pre>${text}</pre>`, { parse_mode: "HTML" });
	});

	telegramBot.catch((err) => {
		console.error("[Telegram] Bot error:", err);
	});

	telegramBot.start();
	console.info(`[Telegram] Bot started. Admin chat: ${allowedChatId ?? "any"}`);
}

function isAllowed(chatId: number): boolean {
	if (!allowedChatId) return true;
	return String(chatId) === allowedChatId;
}

export async function sendNotification(msg: string): Promise<void> {
	if (!telegramBot || !allowedChatId) return;

	try {
		await telegramBot.api.sendMessage(allowedChatId, msg, {
			parse_mode: "HTML",
		});
	} catch (err) {
		console.error("[Telegram] Failed to send notification:", err);
	}
}

export function notifyError(username: string, errorMsg: string): void {
	sendNotification(`🔴 <b>Error</b> — ${username}\n<code>${errorMsg}</code>`);
}

export function notifyExpired(username: string): void {
	sendNotification(
		`🟠 <b>Session Expired</b> — ${username}\nToken expired. Use GUI to re-login.`,
	);
}

export function notifyReconnected(username: string): void {
	sendNotification(`🟢 <b>Reconnected</b> — ${username}`);
}
