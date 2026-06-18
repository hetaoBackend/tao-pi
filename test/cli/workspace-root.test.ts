import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../../src/config.js";

describe("workspace root config", () => {
  it("uses the process cwd instead of PI_WORKSPACE_ROOT", () => {
    const config = loadAppConfig({
      cwd: "/workspace/from-cwd",
      env: { PI_WORKSPACE_ROOT: "/workspace/from-env" },
      overrides: {},
      debugFlag: false,
    });

    expect(config.workspaceRoot).toBe("/workspace/from-cwd");
  });

  it("does not document PI_WORKSPACE_ROOT in the environment template", () => {
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(envExample).not.toContain("PI_WORKSPACE_ROOT");
    expect(envExample).toContain("current working directory");
  });
});
