import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import initSqlJs from "sql.js";

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface AgentSession {
  id: string;
  messages: AgentMessage[];
}

type SqlJsDatabase = initSqlJs.Database;

export class SqliteSessionStore {
  private constructor(
    private readonly dbPath: string,
    private readonly db: SqlJsDatabase,
  ) {}

  static async open(dbPath: string): Promise<SqliteSessionStore> {
    const SQL = await initSqlJs();
    const resolvedPath = resolve(dbPath);
    let db: SqlJsDatabase;

    try {
      const bytes = await readFile(resolvedPath);
      db = new SQL.Database(bytes);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      db = new SQL.Database();
    }

    const store = new SqliteSessionStore(resolvedPath, db);
    store.migrate();
    await store.persist();
    return store;
  }

  async create(id = createSessionId()): Promise<AgentSession> {
    assertValidSessionId(id);
    const now = Date.now();

    this.db.run(
      "INSERT INTO sessions (id, created_at, updated_at) VALUES (?, ?, ?)",
      [id, now, now],
    );
    await this.persist();

    return { id, messages: [] };
  }

  async load(id: string): Promise<AgentSession> {
    assertValidSessionId(id);

    const sessionRows = this.db.exec("SELECT id FROM sessions WHERE id = ? LIMIT 1", [id]);
    if (!sessionRows[0]?.values[0]) {
      throw new Error(`Session "${id}" not found`);
    }

    return {
      id,
      messages: this.loadMessages(id),
    };
  }

  async loadLatest(): Promise<AgentSession> {
    const result = this.db.exec(
      "SELECT id FROM sessions ORDER BY updated_at DESC, rowid DESC LIMIT 1",
    );
    const id = result[0]?.values[0]?.[0];
    if (typeof id !== "string") {
      throw new Error("No sessions found to resume");
    }

    return this.load(id);
  }

  async save(session: AgentSession): Promise<void> {
    assertValidSessionId(session.id);

    const now = Date.now();
    this.db.run("BEGIN");
    try {
      this.db.run(
        `INSERT INTO sessions (id, created_at, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        [session.id, now, now],
      );
      this.db.run("DELETE FROM messages WHERE session_id = ?", [session.id]);

      const insertMessage = this.db.prepare(
        "INSERT INTO messages (session_id, position, message_json) VALUES (?, ?, ?)",
      );
      try {
        session.messages.forEach((message, index) => {
          insertMessage.run([session.id, index, JSON.stringify(message)]);
        });
      } finally {
        insertMessage.free();
      }

      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }

    await this.persist();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        session_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        message_json TEXT NOT NULL,
        PRIMARY KEY (session_id, position),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
    `);
  }

  private loadMessages(sessionId: string): AgentMessage[] {
    const result = this.db.exec(
      "SELECT message_json FROM messages WHERE session_id = ? ORDER BY position ASC",
      [sessionId],
    );

    return (result[0]?.values ?? []).map((row) => JSON.parse(String(row[0])) as AgentMessage);
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    await writeFile(this.dbPath, this.db.export());
  }
}

function createSessionId(): string {
  return `session-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function assertValidSessionId(id: string): void {
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new Error("Invalid session id");
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}
