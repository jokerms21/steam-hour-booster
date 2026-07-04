import { Bot, InlineKeyboard } from "grammy";
import type { Bot as SteamBot } from "../bot";

interface TelegramBotOptions {
	token: string;
	chatId?: string | null;
}

let telegramBot: Bot | null = null;
let allowedChatId: string | null = null;
let steamBots: SteamBot[] = [];

function mainMenu(): InlineKeyboard {
	return new InlineKeyboard()
		.text("📊 Status", "menu:status")
		.text("📋 Accounts", "menu:accounts")
		.row()
		.text("⏸ Pause All", "menu:pause_all")
		.text("▶ Resume All", "menu:resume_all")
		.row()
		.text("📝 Logs", "menu:logs");
}

function backBtn(): InlineKeyboard {
	return new InlineKeyboard().text("◀ Back", "menu:main");
}

function isAllowed(chatId: number): boolean {
	if (!allowedChatId) return true;
	return String(chatId) === allowedChatId;
}

function findBot(username: string): SteamBot | undefined {
	return steamBots.find((b) => b.info.username === username.toLowerCase());
}

function statusIcon(status: string, paused: boolean): string {
	if (status === "Playing") return "🟢";
	if (status === "Expired") return "🟠";
	if (paused) return "🟡";
	return "🔴";
}

export function initTelegramBot(
	options: TelegramBotOptions,
	bots: SteamBot[],
): void {
	if (!options.token) return;

	steamBots = bots;
	allowedChatId = options.chatId ?? null;
	telegramBot = new Bot(options.token);

	telegramBot.command("start", (ctx) => {
		if (!ctx.chat) return;
		if (!isAllowed(ctx.chat.id)) {
			return ctx.reply("Access denied.");
		}
		if (!allowedChatId) {
			allowedChatId = String(ctx.chat.id);
		}
		return ctx.reply("Steam Hour Booster Bot", { reply_markup: mainMenu() });
	});

	telegramBot.callbackQuery("menu:main", async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;
		await ctx.answerCallbackQuery();
		await ctx.editMessageText("Steam Hour Booster Bot", {
			reply_markup: mainMenu(),
		});
	});

	telegramBot.callbackQuery("menu:status", async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;
		await ctx.answerCallbackQuery();

		const lines = steamBots.map((b) => {
			const i = b.info;
			const icon = statusIcon(i.status, i.paused);
			const pauseInfo = i.paused ? ` (${i.pauseReason})` : "";
			const gameList =
				i.games.length > 0
					? i.games.map((g) => g.name || g.appid).join(", ")
					: "no games";
			return `${icon} <b>${i.username}</b> — ${i.status}${pauseInfo}\n    ⏱ ${i.uptime} | 🎮 ${gameList}`;
		});

		const kb = new InlineKeyboard();
		for (const b of steamBots) {
			const i = b.info;
			if (i.status === "Playing" && !i.paused) {
				kb.text(`⏸ ${i.username}`, `acc:pause:${i.username}`);
			} else if (i.paused) {
				kb.text(`▶ ${i.username}`, `acc:resume:${i.username}`);
			}
		}
		kb.row();
		kb.text("◀ Back", "menu:main");

		await ctx.editMessageText(
			`<b>Accounts (${steamBots.length})</b>\n\n${lines.join("\n\n")}`,
			{ parse_mode: "HTML", reply_markup: kb },
		);
	});

	telegramBot.callbackQuery("menu:accounts", async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;
		await ctx.answerCallbackQuery();

		const lines = steamBots.map((b) => {
			const i = b.info;
			const gameList =
				i.games.length > 0
					? i.games.map((g) => g.name || g.appid).join(", ")
					: "no games";
			return `• <b>${i.username}</b> (${i.loginMethod})\n    🎮 ${gameList}`;
		});

		await ctx.editMessageText(`<b>Accounts:</b>\n\n${lines.join("\n")}`, {
			parse_mode: "HTML",
			reply_markup: backBtn(),
		});
	});

	telegramBot.callbackQuery("menu:pause_all", async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;

		let paused = 0;
		for (const bot of steamBots) {
			if (bot.info.status === "Playing" && !bot.info.paused) {
				bot.pause("Paused via Telegram");
				paused++;
			}
		}

		await ctx.answerCallbackQuery({ text: `⏸ Paused ${paused} account(s)` });
		await ctx.editMessageText(`⏸ Paused ${paused} account(s).`, {
			reply_markup: new InlineKeyboard()
				.text("📊 Status", "menu:status")
				.text("◀ Back", "menu:main"),
		});
	});

	telegramBot.callbackQuery("menu:resume_all", async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;

		let resumed = 0;
		for (const bot of steamBots) {
			if (bot.info.paused) {
				bot.resume();
				resumed++;
			}
		}

		await ctx.answerCallbackQuery({ text: `▶ Resumed ${resumed} account(s)` });
		await ctx.editMessageText(`▶ Resumed ${resumed} account(s).`, {
			reply_markup: new InlineKeyboard()
				.text("📊 Status", "menu:status")
				.text("◀ Back", "menu:main"),
		});
	});

	telegramBot.callbackQuery("menu:logs", async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;
		await ctx.answerCallbackQuery({ text: "📂 Logs" });

		await ctx.editMessageText("<b>Logs — select time range:</b>", {
			parse_mode: "HTML",
			reply_markup: new InlineKeyboard()
				.text("Last hour", "logs:1h")
				.text("Last 6 hours", "logs:6h")
				.row()
				.text("Last 24 hours", "logs:24h")
				.text("Last 7 days", "logs:7d")
				.row()
				.text("All", "logs:all")
				.text("◀ Back", "menu:main"),
		});
	});

	telegramBot.callbackQuery(/^logs:(.+)$/, async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;

		const range = ctx.match?.[1];
		if (!range) return;

		const rangeLabel =
			range === "1h" ? "Last hour"
			: range === "6h" ? "Last 6 hours"
			: range === "24h" ? "Last 24 hours"
			: range === "7d" ? "Last 7 days"
			: "All";

		await ctx.answerCallbackQuery({ text: `📂 ${rangeLabel}` });

		const { logBuffer } = await import("../log-buffer");

		let since: number | undefined;
		const now = Date.now();
		if (range === "1h") since = now - 60 * 60 * 1000;
		else if (range === "6h") since = now - 6 * 60 * 60 * 1000;
		else if (range === "24h") since = now - 24 * 60 * 60 * 1000;
		else if (range === "7d") since = now - 7 * 24 * 60 * 60 * 1000;

		const filter = since !== undefined ? { since } : {};
		const logs = logBuffer.getFiltered(filter).slice(-20);

		if (logs.length === 0) {
			await ctx.editMessageText(`No logs for ${rangeLabel}.`, {
				reply_markup: new InlineKeyboard().text("◀ Back", "menu:logs"),
			});
			return;
		}

		const errors = logs.filter((l) => l.level === "error").length;
		const warns = logs.filter((l) => l.level === "warn").length;

		const text = logs
			.map((l) => `[${l.time}] [${l.user}] [${l.level.toUpperCase()}] ${l.msg}`)
			.join("\n");

		const header = `<b>${rangeLabel}</b> — ${logs.length} entries`;
		const stats =
			errors > 0 || warns > 0
				? `\n🔴 ${errors} errors | 🟡 ${warns} warnings`
				: "";

		try {
			await ctx.editMessageText(`<pre>${header}${stats}\n\n${text}</pre>`, {
				parse_mode: "HTML",
				reply_markup: new InlineKeyboard()
					.text("◀ Back", "menu:logs")
					.text("🔄 Refresh", `logs:${range}`),
			});
		} catch (err) {
			// Ignore "message is not modified" on refresh
			if (err instanceof Error && err.message.includes("message is not modified")) {
				await ctx.answerCallbackQuery({ text: "No changes" });
				return;
			}
			throw err;
		}
	});

	telegramBot.callbackQuery(/^acc:pause:(.+)$/, async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;

		const username = ctx.match?.[1];
		if (!username) return;

		const bot = findBot(username);
		if (!bot) {
			await ctx.answerCallbackQuery({ text: `Account "${username}" not found` });
			return;
		}
		if (bot.info.status !== "Playing") {
			await ctx.answerCallbackQuery({ text: `${username} is not playing` });
			return;
		}

		bot.pause("Paused via Telegram");
		await ctx.answerCallbackQuery({ text: `⏸ ${username} paused` });
		await ctx.editMessageText(`⏸ ${username} paused.`, {
			reply_markup: new InlineKeyboard()
				.text(`▶ Resume ${username}`, `acc:resume:${username}`)
				.row()
				.text("◀ Back", "menu:main"),
		});
	});

	telegramBot.callbackQuery(/^acc:resume:(.+)$/, async (ctx) => {
		if (!ctx.chat || !isAllowed(ctx.chat.id)) return;

		const username = ctx.match?.[1];
		if (!username) return;

		const bot = findBot(username);
		if (!bot) {
			await ctx.answerCallbackQuery({ text: `Account "${username}" not found` });
			return;
		}
		if (!bot.info.paused) {
			await ctx.answerCallbackQuery({ text: `${username} is not paused` });
			return;
		}

		bot.resume();
		await ctx.answerCallbackQuery({ text: `▶ ${username} resumed` });
		await ctx.editMessageText(`▶ ${username} resumed.`, {
			reply_markup: new InlineKeyboard()
				.text(`⏸ Pause ${username}`, `acc:pause:${username}`)
				.row()
				.text("◀ Back", "menu:main"),
		});
	});

	telegramBot.catch((err) => {
		if (err instanceof Error && err.message.includes("message is not modified")) {
			return; // ignore — content hasn't changed on refresh
		}
		console.error("[Telegram] Bot error:", err);
	});

	telegramBot.start();
	console.info(`[Telegram] Bot started. Admin chat: ${allowedChatId ?? "any"}`);
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
	const { logBuffer } = require("../log-buffer");
	const recent = logBuffer.getFiltered({ user: username }).slice(-5);
	const logLines = recent
		.map(
			(l: { time: string; level: string; msg: string }) =>
				`  [${l.level.toUpperCase()}] ${l.msg}`,
		)
		.join("\n");

	const logSection = logLines
		? `\n\n<b>Recent log:</b>\n<pre>${logLines}</pre>`
		: "";
	sendNotification(
		`🔴 <b>Error</b> — ${username}\n<code>${errorMsg}</code>${logSection}`,
	);
}

export function notifyExpired(username: string): void {
	sendNotification(
		`🟠 <b>Session Expired</b> — ${username}\nToken expired. Use GUI to re-login.`,
	);
}

export function notifyReconnected(username: string): void {
	sendNotification(`🟢 <b>Reconnected</b> — ${username}`);
}
