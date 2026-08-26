import { Database } from "bun:sqlite";

type Stmt = {
  bind(...values: unknown[]): Stmt;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
};

/**
 * Real SQLite via bun:sqlite, exposing the D1Database surface used by the app.
 */
export function createBunSqliteD1(path = ":memory:"): D1Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");

  function prepare(sql: string): Stmt {
    let bound: unknown[] = [];
    const self: Stmt = {
      bind(...values: unknown[]) {
        bound = values;
        return self;
      },
      async first<T = unknown>() {
        const stmt = db.prepare(sql);
        const row = stmt.get(...bound) as T | null | undefined;
        return (row ?? null) as T | null;
      },
      async run() {
        const stmt = db.prepare(sql);
        const info = stmt.run(...bound);
        return {
          success: true,
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: info.changes,
            changed_db: info.changes > 0,
          },
          results: [],
        } as D1Result;
      },
      async all<T = unknown>() {
        const stmt = db.prepare(sql);
        const results = stmt.all(...bound) as T[];
        return {
          success: true,
          meta: {
            changes: 0,
            last_row_id: 0,
            duration: 0,
            size_after: 0,
            rows_read: results.length,
            rows_written: 0,
            changed_db: false,
          },
          results,
        } as D1Result<T>;
      },
      async raw<T = unknown>() {
        const stmt = db.prepare(sql);
        return stmt.values(...bound) as T[];
      },
    };
    return self;
  }

  return {
    prepare,
    async batch(statements: D1PreparedStatement[]) {
      const out: D1Result[] = [];
      db.exec("BEGIN");
      try {
        for (const s of statements) {
          out.push(await (s as unknown as Stmt).run());
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return out;
    },
    async exec(query: string) {
      db.exec(query);
      return { count: 0, duration: 0 };
    },
    withSession() {
      throw new Error("withSession not implemented in test D1");
    },
  } as unknown as D1Database;
}
