import { describe, expect, it } from "vitest";
import { resolveCliCommandName } from "../../src/cli/command-name.js";

describe("resolveCliCommandName", () => {
  it("keeps the development entrypoint help text stable", () => {
    expect(resolveCliCommandName(["node", "/workspace/src/index.ts"])).toBe("tsx src/index.ts");
  });

  it("uses the executable basename for compiled CLI runs", () => {
    expect(resolveCliCommandName(["bun", "/$bunfs/root/tao-pi"])).toBe("tao-pi");
  });
});
