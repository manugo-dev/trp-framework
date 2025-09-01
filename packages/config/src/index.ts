// config-loader.single-json5.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { parse as parseJSON5 } from "json5";
import { TRPConfig } from "@trp/types";

/* ---------------------------------- Tipos --------------------------------- */
export type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface LoadOptions {
	/** Carpeta de config. Por defecto TRP_CONFIG_DIR o ./config */
	configDir?: string;
	/** Desactivar carga de config/modules/*.json5 */
	loadPerModuleFiles?: boolean;
	/** Desactivar mezcla de secrets.json5 */
	loadSecrets?: boolean;
}

/* ------------------------------- Utilidades -------------------------------- */
function isObject(x: unknown): x is Record<string, unknown> {
	return !!x && typeof x === "object" && !Array.isArray(x);
}
function deepMerge<T>(base: T, override: DeepPartial<T>): T {
	if (!isObject(base) || !isObject(override)) return (override as T) ?? base;
	const out: any = { ...base };
	for (const [k, v] of Object.entries(override)) {
		const bv = (out as any)[k];
		(out as any)[k] = isObject(bv) && isObject(v) ? deepMerge(bv, v as any) : v;
	}
	return out;
}

function tryRead(file: string): unknown | undefined {
	try {
		// Acepta .json5 y .json (JSON es válido en JSON5)
		if (!/\.(json5|json)$/i.test(file)) return undefined;
		if (!fs.existsSync(file)) return undefined;
		const raw = fs.readFileSync(file, "utf8");
		if (!raw.trim()) return undefined;
		return parseJSON5(raw);
	} catch {
		return undefined;
	}
}

function findConfigDir(start: string): string | undefined {
	let cur = path.resolve(start);
	for (let i = 0; i < 6; i++) {
		const candidate = path.join(cur, "config");
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())
			return candidate;
		const parent = path.dirname(cur);
		if (parent === cur) break;
		cur = parent;
	}
	return undefined;
}

/* --------------------------------- Carga ----------------------------------- */
let cachedConfig: TRPConfig | null = null;

export function loadConfig(opts: LoadOptions = {}): TRPConfig {
	if (cachedConfig) return cachedConfig;

	const configDir =
		opts.configDir ??
		process.env.TRP_CONFIG_DIR ??
		findConfigDir(process.cwd()) ??
		path.join(process.cwd(), "config");

	// Único archivo requerido
	const baseCandidates = [
		path.join(configDir, "config.json5"),
		path.join(configDir, "config.json"), // fallback
	];
	const baseData =
		(tryRead(
			baseCandidates.find(fs.existsSync) ?? "",
		) as DeepPartial<TRPConfig>) ?? {};

	// Base mínima
	let cfg: TRPConfig = deepMerge(
		{
			env: "single",
			node: os.hostname().toLowerCase(),
			modules: {},
		} as TRPConfig,
		baseData,
	);

	// Opcional: mezclar config/modules/*.json5|.json en cfg.modules[name]
	if (opts.loadPerModuleFiles !== false) {
		const modulesDir = path.join(configDir, "modules");
		if (fs.existsSync(modulesDir)) {
			for (const entry of fs.readdirSync(modulesDir)) {
				if (!/\.(json5|json)$/i.test(entry)) continue;
				const modName = entry.replace(/\.(json5|json)$/i, "");
				const data = tryRead(path.join(modulesDir, entry));
				if (data) {
					const prev = (cfg.modules ?? {})[modName] ?? {};
					cfg.modules = {
						...(cfg.modules ?? {}),
						[modName]: deepMerge(prev, data as Record<string, unknown>),
					};
				}
			}
		}
	}

	// Opcional: mezclar secrets.json5|.json (gitignored)
	if (opts.loadSecrets !== false) {
		const secretsCandidates = [
			path.join(configDir, "secrets.json5"),
			path.join(configDir, "secrets.json"),
		];
		const secrets = tryRead(secretsCandidates.find(fs.existsSync) ?? "");
		if (secrets) cfg = deepMerge(cfg, secrets as DeepPartial<TRPConfig>);
	}

	cachedConfig = cfg;
	return cfg;
}

/* ---------------------------- Helpers de módulos --------------------------- */
export function configFor<T extends z.ZodTypeAny>(
	moduleName: string,
	schema: T,
	defaults?: z.input<T>,
): z.infer<T> {
	const cfg = loadConfig();
	const raw = ((cfg.modules ?? {})[moduleName] ?? {}) as unknown;
	const merged = defaults
		? deepMerge(defaults, (raw as any) ?? {})
		: (raw ?? {});
	return schema.parse(merged);
}

/* ----------------------------- DB: ejemplo MySQL --------------------------- */
export const DbConfigSchema = z.object({
	host: z.string(),
	port: z.number().default(3306),
	database: z.string(),
	user: z.string(),
	password: z.string(),
	poolLimit: z.number().default(30),
});
export type DbConfig = z.infer<typeof DbConfigSchema>;

export function getMySqlConfig(): DbConfig {
	const cfg = loadConfig({});
	const mysql = DbConfigSchema.parse(cfg.db?.mysql ?? {});
	return mysql;
}
