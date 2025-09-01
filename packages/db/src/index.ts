/**
 * @trp/db-mysql (MariaDB/MySQL)
 *
 * What it provides:
 * - A single shared Pool (mysql2/promise) per process (hot-reload friendly).
 * - Drizzle database instances scoped to a module schema: dbFor(schema).
 * - Transaction helper scoped to a module schema: txFor(schema, fn).
 * - Raw query helper: query(sql, params?) → T[].
 * - Connection helper: withConn(conn => ...) → T.
 * - Healthcheck and graceful shutdown.
 *
 * Usage in a module (server-side only):
 *   import { dbFor, txFor, query, withConn, ping, close } from "@trp/db-mysql";
 *   import * as schema from "../shared/schema";
 *   const db = dbFor(schema);
 *   const rows = await db.select().from(schema.myTable);
 */

import {
  createPool,
  type Pool,
  type PoolOptions,
  type PoolConnection
} from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export type DrizzleDB<TSchema extends Record<string, unknown>> =
  MySql2Database<TSchema>;
export type QueryParams = ReadonlyArray<any> | any[];

/**
 * Environment/runtime configuration accepted by this package.
 * You can pass these via process.env or as an argument to getPool()/dbFor()/txFor().
 */
const MySqlEnvSchema = z.object({
  /** Full DSN: mysql://user:pass@host:3306/dbname */
  MYSQL_URL: z.string().url().optional(),

  /** Connection parts (used when MYSQL_URL is not provided) */
  MYSQL_HOST: z.string().optional(),
  MYSQL_PORT: z.coerce.number().optional(),
  MYSQL_DATABASE: z.string().optional(),
  MYSQL_USER: z.string().optional(),
  MYSQL_PASSWORD: z.string().optional(),

  /** Pooling */
  MYSQL_POOL_LIMIT: z.coerce.number().optional().default(30),
  MYSQL_WAIT_FOR_CONNECTIONS: z.coerce.boolean().optional().default(true),
  MYSQL_QUEUE_LIMIT: z.coerce.number().optional().default(0),

  /**
   * Parsing / compatibility options.
   * TIP: Keeping BIGINT as string is safer for money/IDs; convert explicitly in app code.
   */
  MYSQL_DECIMAL_NUMBERS: z.coerce.boolean().optional().default(false), // DECIMAL parsed as number (beware precision)
  MYSQL_SUPPORT_BIG_NUMBERS: z.coerce.boolean().optional().default(true),
  MYSQL_BIG_NUMBER_STRINGS: z.coerce.boolean().optional().default(true),
  MYSQL_DATE_STRINGS: z.coerce.boolean().optional().default(true) // dates as strings to avoid TZ surprises
});

export type MySqlRuntimeConfig = Partial<z.infer<typeof MySqlEnvSchema>>;

/* -------------------------------------------------------------------------- */
/*                           Global (hot-reload safe)                          */
/* -------------------------------------------------------------------------- */

const GLOBAL_STATE_KEY = Symbol.for('__TRP_DB_MYSQL_SINGLETON__');

type GlobalState = {
  pool?: Pool;
  drizzleBySchema?: WeakMap<object, MySql2Database<any>>;
};

const globalState: GlobalState =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[GLOBAL_STATE_KEY] as GlobalState) ?? {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any)[GLOBAL_STATE_KEY] = globalState;

/* -------------------------------------------------------------------------- */
/*                                 Internals                                  */
/* -------------------------------------------------------------------------- */

/**
 * Creates a new mysql2 Pool from env/config. Typically called once.
 * Do NOT call this directly; use getPool() to reuse the singleton.
 */
function createPoolFromConfig(config?: MySqlRuntimeConfig): Pool {
  const env = MySqlEnvSchema.parse({ ...process.env, ...config });

  const base: PoolOptions = env.MYSQL_URL
    ? { uri: env.MYSQL_URL }
    : {
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT ?? 3306,
        database: env.MYSQL_DATABASE,
        user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD
      };

  const pool = createPool({
    ...base,
    connectionLimit: env.MYSQL_POOL_LIMIT,
    waitForConnections: env.MYSQL_WAIT_FOR_CONNECTIONS,
    queueLimit: env.MYSQL_QUEUE_LIMIT,

    // Parsing / compatibility notes:
    // - For money/IDs, prefer bigNumberStrings=true to avoid precision loss.
    // - If you flip decimalNumbers=true, be sure all DECIMAL columns are safe to parse as JS number.
    decimalNumbers: env.MYSQL_DECIMAL_NUMBERS,
    supportBigNumbers: env.MYSQL_SUPPORT_BIG_NUMBERS,
    bigNumberStrings: env.MYSQL_BIG_NUMBER_STRINGS,
    dateStrings: env.MYSQL_DATE_STRINGS
    // namedPlaceholders: true, // enable if you want :named params (requires extra runtime transform)
  });

  // Optional lifecycle hooks for diagnostics:
  pool.on('connection', () => {
    console.debug('[@trp/db-mysql] new connection acquired');
  });
  pool.on('acquire', () => {
    console.debug('[@trp/db-mysql] connection checked out from the pool');
  });
  pool.on('release', () => {
    console.debug('[@trp/db-mysql] connection released back to the pool');
  });

  return pool;
}

/** Lazily creates and returns the global Drizzle instance cache (keyed by schema object). */
function getOrCreateDrizzleCache(): WeakMap<object, MySql2Database<any>> {
  if (!globalState.drizzleBySchema) {
    globalState.drizzleBySchema = new WeakMap<object, MySql2Database<any>>();
  }
  return globalState.drizzleBySchema;
}

/* -------------------------------------------------------------------------- */
/*                                Public API                                  */
/* -------------------------------------------------------------------------- */

/**
 * Returns the process-wide Pool singleton, creating it if necessary.
 * Pass a runtime config on the first call if you need to override env vars programmatically.
 */
export function getPool(config?: MySqlRuntimeConfig): Pool {
  if (!globalState.pool) {
    globalState.pool = createPoolFromConfig(config);
  }
  return globalState.pool;
}

/**
 * Returns a Drizzle database instance typed to the provided module schema.
 * Instances are cached per schema object to avoid re-wrapping the pool.
 *
 * @example
 *   import * as schema from "../shared/schema";
 *   const db = dbFor(schema);
 */
export function dbFor<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  cfg?: MySqlRuntimeConfig
): MySql2Database<TSchema> {
  const cache = getOrCreateDrizzleCache();
  const cached = cache.get(schema);
  if (cached) return cached as MySql2Database<TSchema>;
  const db = drizzle(getPool(cfg), { schema, mode: 'default' }); // 👈 importante
  cache.set(schema, db);
  return db;
}

/**
 * Runs a function inside a SQL transaction, exposing a Drizzle instance
 * scoped to the provided schema. Commits on success; rolls back on error.
 *
 * Keep transactions short to minimize lock contention.
 */
export async function txFor<TSchema extends Record<string, unknown>, T>(
  schema: TSchema,
  fn: (db: MySql2Database<TSchema>, conn: PoolConnection) => Promise<T>
) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const txDb = drizzle(conn, { schema, mode: 'default' }); // 👈 importante
    const out = await fn(txDb, conn);
    await conn.commit();
    return out;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Provides a raw mysql2 Connection from the pool for the duration of the callback.
 * No transaction is started by default.
 */
export async function withConn<T>(
  fn: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

/**
 * Executes a raw SQL query and returns the resulting rows as an array of T.
 * Prefer parameterized queries to avoid SQL injection: query("SELECT ... WHERE id = ?", [id]).
 */
export async function query<T = unknown>(
  sql: string,
  params?: QueryParams
): Promise<T[]> {
  const pool = getPool();

  // perf timing (Node 22 has global performance)
  const t0 =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const [rows] = await pool.query(sql, params as any[]);
    const t1 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const ms = Math.round(t1 - t0);

    if (ms > 200) {
      // Log slow queries; keep the SQL preview short to avoid noisy logs
      const preview = sql.replace(/\s+/g, ' ').trim().slice(0, 160);
      console.warn(`[@trp/db-mysql] slow query ${ms}ms: ${preview}`);
    }

    return rows as T[];
  } catch (err) {
    console.error('[@trp/db-mysql] query error:', err);
    throw err;
  }
}

/**
 * Lightweight healthcheck. Returns true if the database responds to SELECT 1.
 */
export async function ping(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Closes the shared pool and clears internal caches.
 * Call this on server shutdown or in tests to release resources.
 */
export async function close(): Promise<void> {
  if (globalState.pool) {
    await globalState.pool.end();
    globalState.pool = undefined;
    globalState.drizzleBySchema = undefined;
  }
}

export * as mysql from 'drizzle-orm/mysql-core';
export {
  sql,
  eq,
  ne,
  and,
  or,
  gt,
  gte,
  lt,
  lte,
  inArray,
  notInArray,
  like,
  between,
  isNull,
  isNotNull,
  asc,
  desc
} from 'drizzle-orm';
