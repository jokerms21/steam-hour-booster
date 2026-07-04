export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
	time: string;
	timestamp: number;
	level: LogLevel;
	user: string;
	msg: string;
}

const MAX_LOGS = 500;

class LogBuffer {
	#logs: LogEntry[] = [];
	#broadcast: ((data: unknown) => void) | null = null;

	setBroadcast(fn: (data: unknown) => void): void {
		this.#broadcast = fn;
	}

	add(level: LogLevel, user: string, msg: string): void {
		const now = new Date();
		const entry: LogEntry = {
			time: now.toLocaleString(),
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
