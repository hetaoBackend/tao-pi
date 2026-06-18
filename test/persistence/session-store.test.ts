import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteSessionStore } from "../../src/persistence/session-store.js";

let dbPath: string;

beforeEach(() => {
  dbPath = join(tmpdir(), `tao-pi-sessions-${randomUUID()}.sqlite`);
});

afterEach(async () => {
  await rm(dbPath, { force: true });
});

describe("SqliteSessionStore", () => {
  it("creates a fresh empty session with a generated id", async () => {
    const store = await SqliteSessionStore.open(dbPath);

    const session = await store.create();

    expect(session.id).toMatch(/^session-/);
    expect(session.messages).toEqual([]);
  });

  it("persists sessions and messages in a sqlite database file", async () => {
    const store = await SqliteSessionStore.open(dbPath);
    const session = await store.create("work");
    session.messages = [
      {
        role: "user" as const,
        content: "hello",
        timestamp: 1,
      },
    ];

    await store.save(session);

    const reopened = await SqliteSessionStore.open(dbPath);
    await expect(reopened.load("work")).resolves.toEqual(session);
    const dbBytes = await readFile(dbPath);
    expect(dbBytes.subarray(0, 16).toString("utf8")).toBe("SQLite format 3\0");
  });

  it("preserves sessions written by another open store for the same database path", async () => {
    const firstStore = await SqliteSessionStore.open(dbPath);
    const secondStore = await SqliteSessionStore.open(dbPath);

    await firstStore.save({
      id: "first",
      messages: [{ role: "user", content: "from first", timestamp: 1 }],
    });
    await secondStore.save({
      id: "second",
      messages: [{ role: "user", content: "from second", timestamp: 2 }],
    });

    const reopened = await SqliteSessionStore.open(dbPath);
    await expect(reopened.load("first")).resolves.toMatchObject({ id: "first" });
    await expect(reopened.load("second")).resolves.toMatchObject({ id: "second" });
  });

  it("returns the most recently created session for resume latest", async () => {
    const store = await SqliteSessionStore.open(dbPath);

    await store.create("first");
    await store.create("second");

    await expect(store.loadLatest()).resolves.toMatchObject({ id: "second" });
  });

  it("rejects invalid session ids", async () => {
    const store = await SqliteSessionStore.open(dbPath);

    await expect(store.load("../outside")).rejects.toThrow("Invalid session id");
  });
});
