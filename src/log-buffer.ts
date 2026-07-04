export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
	time: string;
	timestamp: number;
	level: LogLevel;
	user: string;
	msg: string;
}

const MAX_LOGS = 500;

function formatTime(date: Date): string {
	const y = date.getFullYear();
	const mo = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const mi = String(date.getMinutes()).padStart(2, "0");
	const s = String(date.getSeconds()).padStart(2, "0");
	return `${y}/${mo}/${d}, ${h}:${mi}:${s}`;
}

class LogBuffer {
	#logs: LogEntry[] = [];
	#broadcast: ((data: unknown) => void) | null = null;

	setBroadcast(fn: (data: unknown) => void): void {
		this.#broadcast = fn;
	}

	add(level: LogLevel, user: string, msg: string): void {
		const now = new Date();
		const entry: LogEntry = {
			time: formatTime(now),
			timestamp: now.getTime(),
			level,
			user,
			msg,
		};

		this.#logs.push(entry);
		if (this.#logs.length > MAX_LOGS) {
			this.#logs.shift();
		}

		this.#broadcast?.({ type: "log", data: entry });
	}

	getAll(): LogEntry[] {
		return [...this.#logs];
	}

	getFiltered(
		filter: { level?: LogLevel; user?: string; since?: number } = {},
	): LogEntry[] {
		return this.#logs.filter((l) => {
			if (filter.level !== undefined && l.level !== filter.level) return false;
			if (filter.user !== undefined && l.user !== filter.user) return false;
			if (filter.since !== undefined && l.timestamp < filter.since)
				return false;
			return true;
		});
	}
}

export const logBuffer = new LogBuffer();
