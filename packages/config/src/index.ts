import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYAML } from 'yaml';
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface LoadOptions {
  /** Config directory. Defaults to TRP_CONFIG_DIR or nearest "config" found upward from CWD. */
  configDir?: string;
  /** Environment name: dev|staging|prod. Defaults to TRP_ENV or "dev". */
  env?: string;
  /** Node/instance id (e.g., sv-1). Defaults to TRP_NODE or hostname. */
  node?: string;
  /** Environment variable prefix for overrides, defaults to "TRP__". */
  envPrefix?: string;
}

export type TRPConfig = {
  env: string;
  node: string;
  // Extend as you grow. Safe, minimal baseline:
  db?: {
    mysql?: {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      poolLimit?: number;
    };
  };
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  logger?: {
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    pretty?: boolean;
  };
  modules?: Record<string, unknown>;
};

/* -------------------------------------------------------------------------- */
/*                              Helper: deep-merge                             */
/* -------------------------------------------------------------------------- */

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
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

/* -------------------------------------------------------------------------- */
/*                             Helper: file loading                            */
/* -------------------------------------------------------------------------- */

function tryReadFile(file: string): unknown | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return undefined;
    if (file.endsWith('.json')) return JSON.parse(raw);
    return parseYAML(raw);
  } catch {
    return undefined;
  }
}

function findConfigDir(start: string): string | undefined {
  let cur = path.resolve(start);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cur, 'config');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())
      return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*                       Env overrides: TRP__a__b__c=value                     */
/* -------------------------------------------------------------------------- */

function applyEnvOverrides<T>(cfg: T, prefix = 'TRP__'): T {
  const entries = Object.entries(process.env)
    .filter(([k]) => k.startsWith(prefix))
    .map<[string[], string | undefined]>(([k, v]) => [
      k.slice(prefix.length).split('__'),
      v
    ]);

  if (!entries.length) return cfg;

  const out: any = { ...cfg };
  for (const [pathParts, val] of entries) {
    let cursor = out;
    for (let i = 0; i < pathParts.length; i++) {
      const key = pathParts[i].replace(/_/g, '').trim(); // allow TRP__db__mysql__host vs TRP__db__mysql__HOST
      const last = i === pathParts.length - 1;
      if (last) {
        // naive coercion: number/bool if matches
        if (val === 'true') cursor[key] = true;
        else if (val === 'false') cursor[key] = false;
        else if (!Number.isNaN(Number(val))) cursor[key] = Number(val);
        else cursor[key] = val;
      } else {
        cursor[key] = cursor[key] && isObject(cursor[key]) ? cursor[key] : {};
        cursor = cursor[key];
      }
    }
  }
  return out as T;
}

/* -------------------------------------------------------------------------- */
/*                                Load/compose                                */
/* -------------------------------------------------------------------------- */

let cachedConfig: TRPConfig | null = null;

export function loadConfig(opts: LoadOptions = {}): TRPConfig {
  if (cachedConfig) return cachedConfig;

  const env = (opts.env ?? process.env.TRP_ENV ?? 'dev').toLowerCase();
  const node = (
    opts.node ??
    process.env.TRP_NODE ??
    os.hostname()
  ).toLowerCase();
  const configDir =
    opts.configDir ??
    process.env.TRP_CONFIG_DIR ??
    findConfigDir(process.cwd()) ??
    path.join(process.cwd(), 'config');

  // Layered files (earlier → base, later → override)
  const files = [
    path.join(configDir, 'base.yaml'),
    path.join(configDir, 'env', `${env}.yaml`),
    path.join(configDir, 'nodes', `${node}.yaml`),
    path.join(configDir, 'modules.yaml') // optional shared modules config
  ];

  const base: TRPConfig = { env, node, modules: {} };

  // Compose base/env/node/global-modules
  let cfg = files.reduce((acc, f) => {
    const data = tryReadFile(f);
    return data ? deepMerge(acc, data as DeepPartial<TRPConfig>) : acc;
  }, base);

  // Merge per-module YAMLs (config/modules/*.yaml) into cfg.modules[name]
  const modulesDir = path.join(configDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    for (const entry of fs.readdirSync(modulesDir)) {
      if (
        !entry.endsWith('.yaml') &&
        !entry.endsWith('.yml') &&
        !entry.endsWith('.json')
      )
        continue;
      const modName = entry.replace(/\.(yaml|yml|json)$/i, '');
      const data = tryReadFile(path.join(modulesDir, entry));
      if (data) {
        const prev = (cfg.modules ?? {})[modName] ?? {};
        cfg.modules = {
          ...(cfg.modules ?? {}),
          [modName]: deepMerge(prev, data as Record<string, unknown>)
        };
      }
    }
  }

  // Merge secrets (gitignored) if present
  const secrets = tryReadFile(path.join(configDir, 'secrets.yaml'));
  if (secrets) cfg = deepMerge(cfg, secrets as DeepPartial<TRPConfig>);

  // Apply env var overrides
  cfg = applyEnvOverrides(cfg, opts.envPrefix ?? 'TRP__');

  cachedConfig = cfg;
  return cfg;
}

/**
 * Returns strongly-typed configuration for a given module using a Zod schema.
 * - Pulls from cfg.modules[moduleName]
 * - Applies defaults from the provided `defaults` object
 * - Validates and returns the parsed type
 */
export function configFor<T extends z.ZodTypeAny>(
  moduleName: string,
  schema: T,
  defaults?: z.input<T>
): z.infer<T> {
  const cfg = loadConfig();
  const raw = ((cfg.modules ?? {})[moduleName] ?? {}) as unknown;
  const merged = defaults
    ? deepMerge(defaults, (raw as any) ?? {})
    : (raw ?? {});
  return schema.parse(merged);
}

/**
 * Convenience helper to read DB config in a consistent shape.
 */
export const DbConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(3306),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  poolLimit: z.number().default(30)
});
export type DbConfig = z.infer<typeof DbConfigSchema>;

export function getMySqlConfig(): DbConfig {
  const cfg = loadConfig({
    configDir: path.join(__dirname, '../../../config')
  });
  const mysql = DbConfigSchema.parse(cfg.db?.mysql ?? {});
  return mysql;
}
