// Test-only SQLiteAdapter over Node's built-in `node:sqlite`, so tests can run
// the real core-llm-wiki engine (schema, indexes, constraints) in memory.
import type { SQLiteAdapter } from '@equationalapplications/core-llm-wiki';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

type Param = null | number | bigint | string | Uint8Array;

export function createNodeSqliteAdapter(): SQLiteAdapter {
  const db = new DatabaseSync(':memory:');
  const bind = (params?: unknown[]) =>
    (params ?? []).map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)) as Param[];

  const adapter: SQLiteAdapter = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params) {
      const r = db.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync<T>(sql: string, params?: unknown[]) {
      return db.prepare(sql).all(...bind(params)) as T[];
    },
    async getFirstAsync<T>(sql: string, params?: unknown[]) {
      return (db.prepare(sql).get(...bind(params)) as T | undefined) ?? null;
    },
    async withTransactionAsync(fn) {
      db.exec('BEGIN');
      try {
        const result = await fn(adapter);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async closeAsync() {
      db.close();
    },
  };
  return adapter;
}

/**
 * Report failures the way expo-sqlite does on device: "Error code N: <message>"
 * with N the PRIMARY result code (a unique violation is 19, not 2067).
 * expo-sqlite never enables sqlite3_extended_result_codes (see
 * ios/SQLiteResult.swift and android SQLiteError.h in expo-sqlite 58.0.14),
 * so the message carries `sqlite3_errcode() & 0xff`. node:sqlite puts the
 * extended code in `errcode` instead. `extendedCodes: true` emits the
 * extended code (as if expo-sqlite enabled them). Since engine 9.4.3 the
 * engine maps primary code 19 to SQLITE_CONSTRAINT_UNIQUE, so both shapes
 * behave the same; the option keeps both paths covered.
 */
export function withExpoSqliteErrors(
  inner: SQLiteAdapter,
  options: { extendedCodes?: boolean } = {},
): SQLiteAdapter {
  const toExpoShape = (err: unknown) => {
    const errcode = (err as { errcode?: unknown } | null)?.errcode;
    return typeof errcode === 'number'
      ? new Error(`Error code ${options.extendedCodes ? errcode : errcode & 0xff}: ${(err as Error).message}`)
      : err;
  };
  const wrapped: SQLiteAdapter = {
    ...inner,
    async runAsync(sql, params) {
      try {
        return await inner.runAsync(sql, params);
      } catch (err) {
        throw toExpoShape(err);
      }
    },
    async withTransactionAsync(fn) {
      return inner.withTransactionAsync(() => fn(wrapped));
    },
  };
  return wrapped;
}
