import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { randomUUID } from "node:crypto";
import { mkdir, open as openFile, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import initSqlJs from "sql.js";
import { isMissingFileError, isNodeError } from "../utils/errors.js";

const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = 30000;
const LOCK_RETRY_MS = 25;
const dbPathLocks = new Map<string, Promise<void>>();

export interface AgentSession {
  id: string;
  messages: AgentMessage[];
}

type SqlJsDatabase = initSqlJs.Database;
type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;

export class SqliteSessionStore {
  private constructor(
    private readonly dbPath: string,
    private readonly db: SqlJsDatabase,
    private readonly SQL: SqlJsStatic,
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

    const store = new SqliteSessionStore(resolvedPath, db, SQL);
    store.migrate();
    await store.persist();
    return store;
  }

  async create(id = createSessionId()): Promise<AgentSession> {
    assertValidSessionId(id);

    await withSessionStoreLock(this.dbPath, async () => {
      await this.mergeFromDisk();
      const now = Date.now();

      this.db.run(
        "INSERT INTO sessions (id, created_at, updated_at) VALUES (?, ?, ?)",
        [id, now, now],
      );
      await this.persistUnlocked();
    });

    return { id, messages: [] };
  }

  async load(id: string): Promise<AgentSession> {
    assertValidSessionId(id);

    await withSessionStoreLock(this.dbPath, async () => {
      await this.mergeFromDisk();
      const sessionRows = this.db.exec("SELECT id FROM sessions WHERE id = ? LIMIT 1", [id]);
      if (!sessionRows[0]?.values[0]) {
        throw new Error(`Session "${id}" not found`);
      }
    });

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

    await withSessionStoreLock(this.dbPath, async () => {
      await this.mergeFromDisk();
      this.saveInMemory(session);
      await this.persistUnlocked();
    });
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
    await withSessionStoreLock(this.dbPath, () => this.persistUnlocked());
  }

  private async persistUnlocked(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    const tempPath = `${this.dbPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, this.db.export());
      await rename(tempPath, this.dbPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private async mergeFromDisk(): Promise<void> {
    let diskDb: SqlJsDatabase;
    try {
      diskDb = new this.SQL.Database(await readFile(this.dbPath));
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }

      throw error;
    }

    this.db.run("BEGIN");
    try {
      const sessionRows =
        diskDb.exec("SELECT id, created_at, updated_at FROM sessions ORDER BY rowid ASC")[0]?.values ?? [];
      const messageRows =
        diskDb.exec("SELECT session_id, position, message_json FROM messages ORDER BY session_id, position ASC")[0]
          ?.values ?? [];
      const messagesBySession = new Map<string, Array<{ position: number; messageJson: string }>>();
      for (const row of messageRows) {
        const sessionId = String(row[0]);
        const messages = messagesBySession.get(sessionId) ?? [];
        messages.push({ position: Number(row[1]), messageJson: String(row[2]) });
        messagesBySession.set(sessionId, messages);
      }

      for (const row of sessionRows) {
        const sessionId = String(row[0]);
        const diskUpdatedAt = Number(row[2]);
        const localUpdatedAt = readSessionUpdatedAt(this.db, sessionId);
        if (localUpdatedAt !== undefined && localUpdatedAt > diskUpdatedAt) {
          continue;
        }

        this.db.run(
          `INSERT INTO sessions (id, created_at, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, updated_at = excluded.updated_at`,
          [sessionId, Number(row[1]), diskUpdatedAt],
        );
        this.db.run("DELETE FROM messages WHERE session_id = ?", [sessionId]);
        const insertMessage = this.db.prepare(
          "INSERT INTO messages (session_id, position, message_json) VALUES (?, ?, ?)",
        );
        try {
          for (const message of messagesBySession.get(sessionId) ?? []) {
            insertMessage.run([sessionId, message.position, message.messageJson]);
          }
        } finally {
          insertMessage.free();
        }
      }

      this.db.run("COMMIT");
    } catch (error) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        // Ignore rollback failure; preserve original error
      }
      throw error;
    } finally {
      diskDb.close();
    }
  }

  private saveInMemory(session: AgentSession): void {
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
      try {
        this.db.run("ROLLBACK");
      } catch {
        // Ignore rollback failure; preserve original error
      }
      throw error;
    }
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

function readSessionUpdatedAt(db: SqlJsDatabase, sessionId: string): number | undefined {
  const value = db.exec("SELECT updated_at FROM sessions WHERE id = ? LIMIT 1", [sessionId])[0]?.values[0]?.[0];
  if (value === undefined || value === null) {
    return undefined;
  }

  const updatedAt = Number(value);
  return Number.isFinite(updatedAt) ? updatedAt : undefined;
}

async function withSessionStoreLock<T>(dbPath: string, task: () => Promise<T>): Promise<T> {
  return withInProcessLock(dbPath, () => withSessionFileLock(`${dbPath}.lock`, task));
}

async function withInProcessLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = dbPathLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveCurrent) => {
    release = resolveCurrent;
  });
  const next = previous.catch(() => undefined).then(() => current);
  dbPathLocks.set(key, next);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (dbPathLocks.get(key) === next) {
      dbPathLocks.delete(key);
    }
  }
}

async function withSessionFileLock<T>(lockPath: string, task: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = await acquireSessionFileLock(lockPath);
  try {
    return await task();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function acquireSessionFileLock(lockPath: string): Promise<Awaited<ReturnType<typeof openFile>>> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const lock = await openFile(lockPath, "wx");
      await lock.writeFile(`${process.pid}\n${Date.now()}\n`);
      return lock;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }

      await removeStaleLock(lockPath);
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for session database lock: ${lockPath}`);
      }
      await delay(LOCK_RETRY_MS);
    }
  }
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
      await rm(lockPath, { force: true });
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
