/**
 * A D1Database over Node's built-in SQLite, for tests that want real SQL
 * rather than a hand-rolled fake. node:sqlite exists from Node 22, so suites
 * using it skip themselves on older Node (`sqliteAvailable`).
 */
import { createRequire } from "node:module";

type SqliteModule = typeof import("node:sqlite");
let sqlite: SqliteModule | null = null;
try {
  sqlite = createRequire(import.meta.url)("node:sqlite") as SqliteModule;
} catch {
  sqlite = null;
}

export const sqliteAvailable = sqlite !== null;

type Value = string | number | bigint | null | Uint8Array;

function clean(args: unknown[]): Value[] {
  return args.map((arg) => (arg === undefined ? null : typeof arg === "boolean" ? Number(arg) : (arg as Value)));
}

class Statement {
  constructor(
    private db: import("node:sqlite").DatabaseSync,
    private sql: string,
    private args: Value[] = [],
  ) {}

  bind(...args: unknown[]) {
    return new Statement(this.db, this.sql, clean(args));
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.args) as Array<Record<string, unknown>>;
    return { results: rows.map((row) => ({ ...row })) as T[], success: true, meta: {} };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  async raw() {
    const rows = this.db.prepare(this.sql).all(...this.args) as Array<Record<string, unknown>>;
    return rows.map((row) => Object.values(row));
  }
}

export function sqliteD1(): D1Database {
  if (!sqlite) throw new Error("node:sqlite is not available on this Node.");
  const db = new sqlite.DatabaseSync(":memory:");
  return {
    prepare: (sql: string) => new Statement(db, sql),
    batch: async (statements: Statement[]) => {
      const out = [];
      db.exec("BEGIN");
      try {
        for (const statement of statements) out.push(await statement.run());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return out;
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
}
