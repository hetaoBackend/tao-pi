import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryPlugin } from "../../src/plugins/memory-plugin.js";

let memoryDir: string;

beforeEach(async () => {
  memoryDir = await mkdtemp(join(tmpdir(), "learning-pi-memory-plugin-"));
});

afterEach(async () => {
  await rm(memoryDir, { recursive: true, force: true });
});

describe("createMemoryPlugin", () => {
  it("packages file-tool memory guidance without exposing memory-specific tools", () => {
    const plugin = createMemoryPlugin({ memoryDir: "/tmp/pi-memory" });

    expect(plugin.id).toBe("memory");
    expect(plugin.tools ?? []).toEqual([]);
    expect(plugin.systemPromptSections?.join("\n")).toContain("Use existing file tools");
    expect(plugin.systemPromptSections?.join("\n")).toContain("MEMORY.md");
    expect(plugin.systemPromptSections?.join("\n")).toContain("/tmp/pi-memory");
    expect(plugin.systemPromptSections?.join("\n")).not.toContain("memory_read");
    expect(plugin.systemPromptSections?.join("\n")).not.toContain("memory_write");
    expect(plugin.systemPromptSections?.join("\n")).not.toContain("memory_delete");
  });

  it("includes the memory index in prompt guidance when MEMORY.md exists", async () => {
    await writeFile(
      join(memoryDir, "MEMORY.md"),
      "- [Prefers English prompts](prefers-english-prompts.md) - User wants prompts in English.\n",
      "utf8",
    );

    const plugin = createMemoryPlugin({ memoryDir });

    expect(plugin.systemPromptSections?.join("\n")).toContain("Current memory index:");
    expect(plugin.systemPromptSections?.join("\n")).toContain(
      "- [Prefers English prompts](prefers-english-prompts.md) - User wants prompts in English.",
    );
  });

  it("does not add an empty memory index section when MEMORY.md is missing", () => {
    const plugin = createMemoryPlugin({ memoryDir });

    expect(plugin.systemPromptSections?.join("\n")).not.toContain("Current memory index:");
  });
});
