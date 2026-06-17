import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  it("creates a file_info tool that reports text file metadata", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "export {}\n", "utf8");

    const infoTool = createFileTools(workspaceRoot).find((tool) => tool.name === "file_info");
    const result = await infoTool?.execute("call-1", { path: "src/index.ts" });
    const text = result?.content[0]?.type === "text" ? result.content[0].text : "";

    expect(result?.content[0]?.type).toBe("text");
    expect(text).toContain("File info for src/index.ts:");
    expect(text).toContain("kind: file");
    expect(text).toContain("bytes: 10");
    expect(text).toContain("binary: false");
    expect(result?.details).toMatchObject({
      path: "src/index.ts",
      kind: "file",
      bytes: 10,
      binary: false,
    });
    expect(result?.details).toHaveProperty("modifiedAt");
  });

  it("reports directory metadata with file_info", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "export {}\n", "utf8");

    const infoTool = createFileTools(workspaceRoot).find((tool) => tool.name === "file_info");
    const result = await infoTool?.execute("call-1", { path: "src" });
    const text = result?.content[0]?.type === "text" ? result.content[0].text : "";

    expect(result?.content[0]?.type).toBe("text");
    expect(text).toContain("File info for src:");
    expect(text).toContain("kind: directory");
    expect(text).toContain("entries: 1");
    expect(result?.details).toMatchObject({
      path: "src",
      kind: "directory",
      entries: 1,
    });
  });

  it("detects binary files with file_info", async () => {
    await writeFile(join(workspaceRoot, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x47]));

    const infoTool = createFileTools(workspaceRoot).find((tool) => tool.name === "file_info");
    const result = await infoTool?.execute("call-1", { path: "image.bin" });
    const text = result?.content[0]?.type === "text" ? result.content[0].text : "";

    expect(result?.content[0]?.type).toBe("text");
    expect(text).toContain("binary: true");
    expect(result?.details).toMatchObject({
      path: "image.bin",
      kind: "file",
      bytes: 4,
      binary: true,
    });
  });

  it("reports missing paths clearly with file_info", async () => {
    const infoTool = createFileTools(workspaceRoot).find((tool) => tool.name === "file_info");

    await expect(infoTool?.execute("call-1", { path: "missing.txt" })).rejects.toThrow("Path not found: missing.txt");
  });

  it("rejects binary files with read_file", async () => {
    await writeFile(join(workspaceRoot, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x47]));

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");

    await expect(readTool?.execute("call-1", { path: "image.bin" })).rejects.toThrow(
      "Cannot read binary file with read_file; use file_info to inspect metadata instead",
    );
  });

  it("rejects directories with read_file", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");

    await expect(readTool?.execute("call-1", { path: "src" })).rejects.toThrow(
      "Cannot read directory with read_file; use list_files or file_info instead",
    );
  });

  it("reports missing paths clearly with read_file", async () => {
    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");

    await expect(readTool?.execute("call-1", { path: "missing.txt" })).rejects.toThrow("Path not found: missing.txt");
  });

  it("creates a list_files tool that skips generated and runtime files", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "node_modules/pkg"), { recursive: true });
    await mkdir(join(workspaceRoot, ".git"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "node_modules/pkg/index.js"), "module.exports = {}\n", "utf8");
    await writeFile(join(workspaceRoot, ".git/config"), "[core]\n", "utf8");
    await writeFile(join(workspaceRoot, ".pi-sessions.sqlite"), "sqlite data", "utf8");

    const listTool = createFileTools(workspaceRoot).find((tool) => tool.name === "list_files");
    const result = await listTool?.execute("call-1", { path: "." });

    expect(result?.details).toMatchObject({ root: ".", files: ["src/index.ts"] });
    expect(result?.content[0]).toEqual({ type: "text", text: "Files under .:\nsrc/index.ts" });
  });

  it("reports missing paths clearly with list_files", async () => {
    const listTool = createFileTools(workspaceRoot).find((tool) => tool.name === "list_files");

    await expect(listTool?.execute("call-1", { path: "missing" })).rejects.toThrow("Path not found: missing");
  });

  it("filters list_files results with a glob pattern", async () => {
    await mkdir(join(workspaceRoot, "src/ui"), { recursive: true });
    await mkdir(join(workspaceRoot, "docs"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "src/ui/button.ts"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "src/ui/button.css"), ".button {}\n", "utf8");
    await writeFile(join(workspaceRoot, "docs/readme.md"), "# Docs\n", "utf8");

    const listTool = createFileTools(workspaceRoot).find((tool) => tool.name === "list_files");
    const result = await listTool?.execute("call-1", {
      path: ".",
      pattern: "**/*.ts",
    });

    expect(result?.details).toMatchObject({
      root: ".",
      pattern: "**/*.ts",
      files: ["src/index.ts", "src/ui/button.ts"],
      truncated: false,
    });
    expect(result?.content[0]).toEqual({
      type: "text",
      text: "Files under . matching **/*.ts:\nsrc/index.ts\nsrc/ui/button.ts",
    });
  });

  it("applies list_files max_results after glob filtering", async () => {
    await mkdir(join(workspaceRoot, "a"), { recursive: true });
    await mkdir(join(workspaceRoot, "z"), { recursive: true });
    await writeFile(join(workspaceRoot, "a/first.md"), "# First\n", "utf8");
    await writeFile(join(workspaceRoot, "a/second.md"), "# Second\n", "utf8");
    await writeFile(join(workspaceRoot, "z/code.ts"), "export {}\n", "utf8");
    await writeFile(join(workspaceRoot, "z/extra.ts"), "export {}\n", "utf8");

    const listTool = createFileTools(workspaceRoot).find((tool) => tool.name === "list_files");
    const result = await listTool?.execute("call-1", {
      path: ".",
      pattern: "**/*.ts",
      max_results: 1,
    });

    expect(result?.details).toMatchObject({
      files: ["z/code.ts"],
      truncated: true,
    });
    expect(result?.content[0]).toEqual({
      type: "text",
      text: "Files under . matching **/*.ts:\nz/code.ts\nResults truncated.",
    });
  });

  it("creates a search_files tool that returns matching file lines", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await mkdir(join(workspaceRoot, "node_modules/pkg"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "const target = true;\nconst other = false;\n", "utf8");
    await writeFile(join(workspaceRoot, "node_modules/pkg/index.js"), "const target = false;\n", "utf8");

    const searchTool = createFileTools(workspaceRoot).find((tool) => tool.name === "search_files");
    const result = await searchTool?.execute("call-1", { query: "target" });

    expect(result?.details).toMatchObject({
      query: "target",
      matches: [{ path: "src/index.ts", line: 1, text: "const target = true;" }],
    });
    expect(result?.content[0]).toEqual({
      type: "text",
      text: 'Search results for "target":\nsrc/index.ts:1: const target = true;',
    });
  });

  it("reports missing paths clearly with search_files", async () => {
    const searchTool = createFileTools(workspaceRoot).find((tool) => tool.name === "search_files");

    await expect(searchTool?.execute("call-1", { query: "target", path: "missing" })).rejects.toThrow(
      "Path not found: missing",
    );
  });

  it("supports case-insensitive search_files matches when requested", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "const Target = true;\n", "utf8");

    const searchTool = createFileTools(workspaceRoot).find((tool) => tool.name === "search_files");
    const result = await searchTool?.execute("call-1", {
      query: "target",
      case_sensitive: false,
    });

    expect(result?.details).toMatchObject({
      query: "target",
      matches: [{ path: "src/index.ts", line: 1, text: "const Target = true;" }],
    });
    expect(result?.content[0]).toEqual({
      type: "text",
      text: 'Search results for "target":\nsrc/index.ts:1: const Target = true;',
    });
  });

  it("supports regex search_files matches when requested", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "const target    = true;\nconst other = false;\n", "utf8");

    const searchTool = createFileTools(workspaceRoot).find((tool) => tool.name === "search_files");
    const result = await searchTool?.execute("call-1", {
      query: "target\\s*=\\s*true",
      regex: true,
    });

    expect(result?.details).toMatchObject({
      query: "target\\s*=\\s*true",
      matches: [{ path: "src/index.ts", line: 1, text: "const target    = true;" }],
    });
    expect(result?.content[0]).toEqual({
      type: "text",
      text: 'Search results for "target\\s*=\\s*true":\nsrc/index.ts:1: const target    = true;',
    });
  });

  it("rejects invalid search_files regex queries", async () => {
    const searchTool = createFileTools(workspaceRoot).find((tool) => tool.name === "search_files");

    await expect(
      searchTool?.execute("call-1", {
        query: "[",
        regex: true,
      }),
    ).rejects.toThrow("Invalid search regex");
  });

  it("adds surrounding lines to search_files results when requested", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "src/index.ts"),
      [
        "const before = true;",
        "const target = true;",
        "const after = true;",
        "const other = false;",
      ].join("\n"),
      "utf8",
    );

    const searchTool = createFileTools(workspaceRoot).find((tool) => tool.name === "search_files");
    const result = await searchTool?.execute("call-1", {
      query: "target",
      context_lines: 1,
    });

    expect(result?.details).toMatchObject({
      query: "target",
      matches: [
        {
          path: "src/index.ts",
          line: 2,
          text: "const target = true;",
          contextBefore: [{ line: 1, text: "const before = true;" }],
          contextAfter: [{ line: 3, text: "const after = true;" }],
        },
      ],
    });
    expect(result?.content[0]).toEqual({
      type: "text",
      text: [
        'Search results for "target":',
        "src/index.ts:1: const before = true;",
        "src/index.ts:2: const target = true;",
        "src/index.ts:3: const after = true;",
      ].join("\n"),
    });
  });

  it("creates an edit_file tool that replaces exactly one text occurrence", async () => {
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "src/index.ts"), "const value = 'old';\n", "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const editTool = tools.find((tool) => tool.name === "edit_file");
    expect(editTool?.description).toContain("read_file");
    await readTool?.execute("call-1", { path: "src/index.ts" });
    const result = await editTool?.execute("call-1", {
      path: "src/index.ts",
      old_text: "'old'",
      new_text: "'new'",
    });

    await expect(readFile(join(workspaceRoot, "src/index.ts"), "utf8")).resolves.toBe("const value = 'new';\n");
    expect(result?.content[0]).toEqual({ type: "text", text: "Edited src/index.ts (1 replacement)" });
    expect(result?.details).toMatchObject({ path: "src/index.ts", replacements: 1 });
  });

  it("creates a multi_edit_file tool that applies multiple exact replacements after reading", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "alpha\nbeta\ngamma\n", "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const multiEditTool = tools.find((tool) => tool.name === "multi_edit_file");
    expect(multiEditTool).toBeDefined();
    await readTool?.execute("call-1", { path: "notes.txt" });
    const result = await multiEditTool!.execute("call-2", {
      path: "notes.txt",
      edits: [
        { old_text: "alpha", new_text: "one" },
        { old_text: "gamma", new_text: "three" },
      ],
    });

    await expect(readFile(join(workspaceRoot, "notes.txt"), "utf8")).resolves.toBe("one\nbeta\nthree\n");
    expect(result?.content[0]).toEqual({ type: "text", text: "Edited notes.txt (2 replacements)" });
    expect(result?.details).toMatchObject({ path: "notes.txt", replacements: 2 });
  });

  it("keeps multi_edit_file atomic when a replacement is missing", async () => {
    const content = "alpha\nbeta\n";
    await writeFile(join(workspaceRoot, "notes.txt"), content, "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const multiEditTool = tools.find((tool) => tool.name === "multi_edit_file");
    expect(multiEditTool).toBeDefined();
    await readTool?.execute("call-1", { path: "notes.txt" });

    await expect(
      multiEditTool!.execute("call-2", {
        path: "notes.txt",
        edits: [
          { old_text: "alpha", new_text: "one" },
          { old_text: "missing", new_text: "nope" },
        ],
      }),
    ).rejects.toThrow("old_text for edit 2 must match exactly one location; found 0");
    await expect(readFile(join(workspaceRoot, "notes.txt"), "utf8")).resolves.toBe(content);
  });

  it("requires read_file before edit_file modifies an existing file", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "hello\n", "utf8");

    const editTool = createFileTools(workspaceRoot).find((tool) => tool.name === "edit_file");

    await expect(
      editTool?.execute("call-1", {
        path: "notes.txt",
        old_text: "hello",
        new_text: "goodbye",
      }),
    ).rejects.toThrow("Read the file with read_file before editing it");
    await expect(readFile(join(workspaceRoot, "notes.txt"), "utf8")).resolves.toBe("hello\n");
  });

  it("requires edit_file old_text to appear in a previously read file range", async () => {
    const content = Array.from({ length: 205 }, (_value, index) => `line ${index + 1}`).join("\n");
    await writeFile(join(workspaceRoot, "large.txt"), content, "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const editTool = tools.find((tool) => tool.name === "edit_file");
    await readTool?.execute("call-1", { path: "large.txt" });

    await expect(
      editTool?.execute("call-1", {
        path: "large.txt",
        old_text: "line 205",
        new_text: "line 205 updated",
      }),
    ).rejects.toThrow("old_text must appear in text returned by read_file before editing it");
    await expect(readFile(join(workspaceRoot, "large.txt"), "utf8")).resolves.toBe(content);
  });

  it("allows edit_file after the target text appears in a later read_file range", async () => {
    const content = Array.from({ length: 205 }, (_value, index) => `line ${index + 1}`).join("\n");
    await writeFile(join(workspaceRoot, "large.txt"), content, "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const editTool = tools.find((tool) => tool.name === "edit_file");
    await readTool?.execute("call-1", { path: "large.txt" });
    await readTool?.execute("call-2", { path: "large.txt", start_line: 201, max_lines: 5 });

    const result = await editTool?.execute("call-3", {
      path: "large.txt",
      old_text: "line 205",
      new_text: "line 205 updated",
    });

    expect(result?.details).toMatchObject({ path: "large.txt", replacements: 1 });
    await expect(readFile(join(workspaceRoot, "large.txt"), "utf8")).resolves.toContain("line 205 updated");
  });

  it("rejects ambiguous edit_file replacements", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "repeat\nrepeat\n", "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const editTool = tools.find((tool) => tool.name === "edit_file");
    await readTool?.execute("call-1", { path: "notes.txt" });

    await expect(
      editTool?.execute("call-1", {
        path: "notes.txt",
        old_text: "repeat",
        new_text: "done",
      }),
    ).rejects.toThrow("old_text must match exactly one location; found 2");
  });

  it("rejects missing edit_file replacements", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "hello\n", "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const editTool = tools.find((tool) => tool.name === "edit_file");
    await readTool?.execute("call-1", { path: "notes.txt" });

    await expect(
      editTool?.execute("call-1", {
        path: "notes.txt",
        old_text: "missing",
        new_text: "done",
      }),
    ).rejects.toThrow("old_text must match exactly one location; found 0");
  });

  it("creates a read_file tool that returns file contents", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "hello from disk", "utf8");

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");
    const result = await readTool?.execute("call-1", { path: "notes.txt" });

    expect(result?.content).toEqual([{ type: "text", text: "hello from disk" }]);
    expect(result?.details).toMatchObject({ path: "notes.txt", bytes: 15 });
  });

  it("truncates read_file output by default for large files", async () => {
    const content = Array.from({ length: 205 }, (_value, index) => `line ${index + 1}`).join("\n");
    await writeFile(join(workspaceRoot, "large.txt"), content, "utf8");

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");
    const result = await readTool?.execute("call-1", { path: "large.txt" });

    const text = result?.content[0]?.type === "text" ? result.content[0].text : "";
    expect(text).toContain("line 1");
    expect(text).toContain("line 200");
    expect(text).not.toContain("line 201");
    expect(text).toContain("[File truncated: showing lines 1-200 of 205. Use start_line and max_lines to read more.]");
    expect(result?.details).toMatchObject({
      path: "large.txt",
      startLine: 1,
      endLine: 200,
      totalLines: 205,
      truncated: true,
    });
  });

  it("reads a requested line range with read_file", async () => {
    const content = Array.from({ length: 10 }, (_value, index) => `line ${index + 1}`).join("\n");
    await writeFile(join(workspaceRoot, "range.txt"), content, "utf8");

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");
    const result = await readTool?.execute("call-1", {
      path: "range.txt",
      start_line: 4,
      max_lines: 3,
    });

    expect(result?.content).toEqual([
      {
        type: "text",
        text: [
          "line 4",
          "line 5",
          "line 6",
          "[File truncated: showing lines 4-6 of 10. Use start_line and max_lines to read more.]",
        ].join("\n"),
      },
    ]);
    expect(result?.details).toMatchObject({
      path: "range.txt",
      startLine: 4,
      endLine: 6,
      totalLines: 10,
      truncated: true,
    });
  });

  it("can include line numbers in read_file output", async () => {
    const content = Array.from({ length: 5 }, (_value, index) => `line ${index + 1}`).join("\n");
    await writeFile(join(workspaceRoot, "numbered.txt"), content, "utf8");

    const readTool = createFileTools(workspaceRoot).find((tool) => tool.name === "read_file");
    const result = await readTool?.execute("call-1", {
      path: "numbered.txt",
      start_line: 2,
      max_lines: 2,
      show_line_numbers: true,
    });

    expect(result?.content).toEqual([
      {
        type: "text",
        text: [
          "2 | line 2",
          "3 | line 3",
          "[File truncated: showing lines 2-3 of 5. Use start_line and max_lines to read more.]",
        ].join("\n"),
      },
    ]);
    expect(result?.details).toMatchObject({
      path: "numbered.txt",
      startLine: 2,
      endLine: 3,
      totalLines: 5,
      truncated: true,
    });
  });

  it("allows edit_file after read_file output included line numbers", async () => {
    await writeFile(join(workspaceRoot, "numbered-edit.txt"), "alpha\nbeta\n", "utf8");

    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const editTool = tools.find((tool) => tool.name === "edit_file");
    await readTool?.execute("call-1", {
      path: "numbered-edit.txt",
      show_line_numbers: true,
    });
    const result = await editTool?.execute("call-2", {
      path: "numbered-edit.txt",
      old_text: "beta",
      new_text: "gamma",
    });

    expect(result?.details).toMatchObject({ path: "numbered-edit.txt", replacements: 1 });
    await expect(readFile(join(workspaceRoot, "numbered-edit.txt"), "utf8")).resolves.toBe("alpha\ngamma\n");
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

  it("rejects write_file overwrites unless explicitly allowed", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "existing", "utf8");
    const writeTool = createFileTools(workspaceRoot).find((tool) => tool.name === "write_file");

    await expect(
      writeTool?.execute("call-1", {
        path: "notes.txt",
        content: "replacement",
      }),
    ).rejects.toThrow("File already exists; pass overwrite: true after confirming replacement is intended");

    await expect(readFile(join(workspaceRoot, "notes.txt"), "utf8")).resolves.toBe("existing");
  });

  it("rejects write_file overwrites until the file has been read", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "existing", "utf8");
    const writeTool = createFileTools(workspaceRoot).find((tool) => tool.name === "write_file");

    await expect(
      writeTool?.execute("call-1", {
        path: "notes.txt",
        content: "replacement",
        overwrite: true,
      }),
    ).rejects.toThrow("Read the file with read_file before overwriting it");

    await expect(readFile(join(workspaceRoot, "notes.txt"), "utf8")).resolves.toBe("existing");
  });

  it("allows write_file overwrites after the file has been read and overwrite is explicit", async () => {
    await writeFile(join(workspaceRoot, "notes.txt"), "existing", "utf8");
    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const writeTool = tools.find((tool) => tool.name === "write_file");

    await readTool?.execute("call-1", { path: "notes.txt" });
    const result = await writeTool?.execute("call-1", {
      path: "notes.txt",
      content: "replacement",
      overwrite: true,
    });

    await expect(readFile(join(workspaceRoot, "notes.txt"), "utf8")).resolves.toBe("replacement");
    expect(result?.details).toMatchObject({ path: "notes.txt", bytes: 11 });
  });

  it("rejects paths outside the workspace root", async () => {
    const tools = createFileTools(workspaceRoot);
    const readTool = tools.find((tool) => tool.name === "read_file");
    const infoTool = tools.find((tool) => tool.name === "file_info");

    await expect(readTool?.execute("call-1", { path: "../outside.txt" })).rejects.toThrow(
      "Path must stay inside the workspace",
    );
    await expect(infoTool?.execute("call-2", { path: "../outside.txt" })).rejects.toThrow(
      "Path must stay inside the workspace",
    );
  });
});
