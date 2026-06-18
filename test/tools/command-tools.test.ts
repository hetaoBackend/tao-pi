import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCommandTools } from "../../src/tools/command-tools.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "tao-pi-command-tools-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
});

describe("createCommandTools", () => {
  it("creates a bash tool that captures stdout and exit code", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"process.stdout.write('ok')\"",
    });

    expect(result?.content[0]).toEqual({ type: "text", text: "Exit code: 0\nstdout:\nok" });
    expect(result?.details).toMatchObject({
      command: "node -e \"process.stdout.write('ok')\"",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      timedOut: false,
    });
  });

  it("runs commands through bash rather than the platform default shell", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "printf '%s' \"$0\"",
    });

    expect(result?.details).toMatchObject({
      exitCode: 0,
      stdout: "bash",
    });
  });

  it("captures stderr and non-zero exit codes", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"console.error('bad'); process.exit(3)\"",
    });

    expect(result?.content[0]).toEqual({ type: "text", text: "Exit code: 3\nstderr:\nbad\n" });
    expect(result?.details).toMatchObject({
      exitCode: 3,
      stdout: "",
      stderr: "bad\n",
      timedOut: false,
    });
  });

  it("truncates long command output per stream", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"process.stdout.write('abcdefghijklmnop'); process.stderr.write('qrstuvwxyz')\"",
      max_output_chars: 8,
    });

    expect(result?.content[0]).toEqual({
      type: "text",
      text: [
        "Exit code: 0",
        "stdout:",
        "abcdefgh",
        "[stdout truncated: showing first 8 of 16 characters. Use max_output_chars or narrow the command output.]",
        "stderr:",
        "qrstuvwx",
        "[stderr truncated: showing first 8 of 10 characters. Use max_output_chars or narrow the command output.]",
      ].join("\n"),
    });
    expect(result?.details).toMatchObject({
      stdout: "abcdefgh",
      stderr: "qrstuvwx",
      stdoutTruncated: true,
      stderrTruncated: true,
      stdoutChars: 16,
      stderrChars: 10,
      maxOutputChars: 8,
    });
  });

  it("runs commands from the configured workspace", async () => {
    await writeFile(join(workspaceRoot, "marker.txt"), "from workspace", "utf8");
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"process.stdout.write(require('node:fs').readFileSync('marker.txt', 'utf8'))\"",
    });

    expect(result?.details).toMatchObject({ exitCode: 0, stdout: "from workspace" });
    await expect(readFile(join(workspaceRoot, "marker.txt"), "utf8")).resolves.toBe("from workspace");
  });

  it("runs commands from a requested workspace subdirectory", async () => {
    await writeFile(join(workspaceRoot, "package.json"), "{}", "utf8");
    await mkdir(join(workspaceRoot, "packages", "app"), { recursive: true });
    await writeFile(join(workspaceRoot, "packages", "app", "marker.txt"), "from app", "utf8");
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"process.stdout.write(require('node:fs').readFileSync('marker.txt', 'utf8'))\"",
      cwd: "packages/app",
    });

    expect(result?.details).toMatchObject({
      cwd: "packages/app",
      exitCode: 0,
      stdout: "from app",
    });
  });

  it("rejects cwd values that point at files", async () => {
    await writeFile(join(workspaceRoot, "not-a-directory.txt"), "content", "utf8");
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    await expect(
      runTool?.execute("call-1", {
        command: "pwd",
        cwd: "not-a-directory.txt",
      }),
    ).rejects.toThrow("cwd must be an existing directory: not-a-directory.txt");
  });

  it("rejects cwd values that do not exist", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    await expect(
      runTool?.execute("call-1", {
        command: "pwd",
        cwd: "missing",
      }),
    ).rejects.toThrow("cwd must be an existing directory: missing");
  });

  it("disables optional locks for read-only git commands", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "git --version >/dev/null && node -e \"process.stdout.write(process.env.GIT_OPTIONAL_LOCKS || 'unset')\"",
    });

    expect(result?.details).toMatchObject({
      exitCode: 0,
      stdout: "0",
      gitOptionalLocksDisabled: true,
    });
  });

  it("does not disable optional locks for non-git commands", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"process.stdout.write(process.env.GIT_OPTIONAL_LOCKS || 'unset')\"",
    });

    expect(result?.details).toMatchObject({
      exitCode: 0,
      stdout: "unset",
      gitOptionalLocksDisabled: false,
    });
  });

  it("kills commands that exceed the timeout", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "node -e \"setTimeout(() => {}, 2000)\"",
      timeout_ms: 100,
    });

    expect(result?.content[0]).toEqual({ type: "text", text: "Command timed out after 100ms" });
    expect(result?.details).toMatchObject({
      exitCode: null,
      timedOut: true,
      timeoutMs: 100,
    });
  });

  it("rejects unsafe commands unless explicitly allowed", async () => {
    await writeFile(join(workspaceRoot, "marker.txt"), "keep", "utf8");
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    await expect(
      runTool?.execute("call-1", {
        command: "rm marker.txt",
      }),
    ).rejects.toThrow('Command looks unsafe ("rm"). Pass allow_unsafe: true only after user confirmation.');

    await expect(readFile(join(workspaceRoot, "marker.txt"), "utf8")).resolves.toBe("keep");
  });

  it("rejects outward-facing git push commands unless explicitly allowed", async () => {
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    await expect(
      runTool?.execute("call-1", {
        command: "git push origin main",
      }),
    ).rejects.toThrow('Command looks unsafe ("git push"). Pass allow_unsafe: true only after user confirmation.');
  });

  it("runs unsafe commands when explicitly allowed", async () => {
    await writeFile(join(workspaceRoot, "marker.txt"), "delete me", "utf8");
    const runTool = createCommandTools(workspaceRoot).find((tool) => tool.name === "bash");

    const result = await runTool?.execute("call-1", {
      command: "rm marker.txt",
      allow_unsafe: true,
    });

    await expect(access(join(workspaceRoot, "marker.txt"))).rejects.toThrow();
    expect(result?.details).toMatchObject({ exitCode: 0, timedOut: false });
  });
});
