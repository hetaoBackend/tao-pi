import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileTools } from "../../src/tools/file-tools.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "learning-pi-tools-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe("createFileTools", () => {
  it("creates a read_file tool that returns file contents", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "hello from disk", "utf8");

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");
    const result = await readTool?.execute("call-1", { path: "notes.txt" });

    expect(result?.content).toEqual([{ type: "text", text: "hello from disk" }]);
    expect(result?.details).toMatchObject({ path: "notes.txt", bytes: 15 });
  });

  it("creates a write_file tool that creates parent directories", async () => {
    const writeTool = createFileTools(workspaceRoot).find((tool) => tool.name === "write_file");

    const result = await writeTool?.execute("call-1", {
      path: "drafts/answer.md",
      content: "# Hello\n",
    });

    await expect(readFile(join(workspaceRoot, "drafts/answer.md"), "utf8")).resolves.toBe("# Hello\n");
    expect(result?.content[0]).toEqual({ type: "text", text: "Wrote 8 bytes to drafts/answer.md" });
    expect(result?.details).toMatchObject({ path: "drafts/answer.md", bytes: 8 });
  });

  it("rejects paths outside the workspace root", async () => {
    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");

    await expect(readTool?.execute("call-1", { path: "../outside.txt" })).rejects.toThrow(
      "Path must stay inside the workspace",
    );
  });
});
