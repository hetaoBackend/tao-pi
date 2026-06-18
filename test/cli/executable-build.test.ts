import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const executablePath = resolve(process.cwd(), "dist/tao-pi");

describe("compiled CLI executable", () => {
  beforeAll(async () => {
    await execFileAsync("bun", ["run", "build:cli"], { cwd: process.cwd() });
  }, 15000);

  it("starts and renders help after a Bun compile", async () => {
    const { stdout } = await execFileAsync(executablePath, ["--help"], {
      cwd: process.cwd(),
    });

    expect(stdout).toContain("Usage: tao-pi [options] [prompt]");
    expect(stdout).toContain("Usage: tao-pi setup");
    expect(stdout).toContain("setup");
  });

  it("initializes runtime dependencies before reporting a missing API key", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "tao-pi-home-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "tao-pi-workspace-"));

    try {
      await expect(
        execFileAsync(executablePath, ["--print", "hi"], {
          cwd: workspaceRoot,
          env: {
            HOME: homeDir,
            PATH: process.env.PATH ?? "",
            PI_API_KEY: "",
            PI_PROVIDER: "openai",
            PI_SESSION_DB: join(workspaceRoot, "sessions.sqlite"),
          },
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('No API key found for provider "openai"'),
      });
    } finally {
      await rm(homeDir, { force: true, recursive: true });
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});
