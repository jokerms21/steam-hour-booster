import { z } from "zod";
import { convertRelativePath } from "./path";

export const configSchema = z.array(
	z.object({
		username: z
			.string()
			.min(1)
			.regex(/^[a-zA-Z0-9_.@]+$/),
		password: z.string().optional(),
		games: z.array(z.number().int().positive()).min(1).max(32),
		online: z.boolean().default(false),
		loginMethod: z.enum(["credentials", "qrcode"]).default("credentials"),
	}),
);

export type Config = z.infer<typeof configSchema>;
export type ConfigEntry = z.infer<(typeof configSchema)["element"]>;

export const loadConfig = async (path: string): Promise<Config> => {
	try {
		const resolvedPath = convertRelativePath(path);

		const json = (await Bun.file(resolvedPath).json()) as unknown;

		const result = await configSchema.safeParseAsync(json);

		if (!result.success) {
			throw result.error;
		}

		return result.data;
	} catch (e) {
		console.error("Can not read/parse config file.");
		throw e;
	}
};

export class ConfigManager {
	#path: string;
	#config: Config;

	constructor(path: string, config: Config) {
		this.#path = convertRelativePath(path);
		this.#config = config;
	}

	getAll(): Config {
		return this.#config;
	}

	getByUsername(username: string): ConfigEntry | undefined {
		return this.#config.find(
			(e) => e.username.toLowerCase() === username.toLowerCase(),
		);
	}

	add(entry: ConfigEntry): void {
		const exists = this.getByUsername(entry.username);
		if (exists) {
			throw new Error(`Account '${entry.username}' already exists`);
		}
		this.#config.push(entry);
		this.#save();
	}

	update(username: string, entry: Record<string, unknown>): void {
		const idx = this.#config.findIndex(
			(e) => e.username.toLowerCase() === username.toLowerCase(),
		);
		if (idx === -1) {
			throw new Error(`Account '${username}' not found`);
		}
		const current: ConfigEntry = this.#config[idx] as ConfigEntry;
		const updated: ConfigEntry = {
			username: current.username,
			password: current.password,
			games: current.games,
			online: current.online,
			loginMethod: current.loginMethod,
		};
		if (typeof entry["username"] === "string")
			updated.username = entry["username"];
		if (
			typeof entry["password"] === "string" ||
			entry["password"] === undefined
		)
			updated.password = entry["password"];
		if (Array.isArray(entry["games"]))
			updated.games = entry["games"] as number[];
		if (typeof entry["online"] === "boolean") updated.online = entry["online"];
		if (
			entry["loginMethod"] === "credentials" ||
			entry["loginMethod"] === "qrcode"
		)
			updated.loginMethod = entry["loginMethod"];
		this.#config[idx] = updated;
		this.#save();
	}

	delete(username: string): void {
		const idx = this.#config.findIndex(
			(e) => e.username.toLowerCase() === username.toLowerCase(),
		);
		if (idx === -1) {
			throw new Error(`Account '${username}' not found`);
		}
		this.#config.splice(idx, 1);
		this.#save();
	}

	#save(): void {
		Bun.write(this.#path, JSON.stringify(this.#config, null, 4));
	}
}
