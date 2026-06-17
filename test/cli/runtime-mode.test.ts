import { describe, expect, it } from "vitest";
import { shouldUseTui } from "../../src/cli/runtime-mode.js";

describe("runtime mode", () => {
  it("uses TUI only for non-print interactive stdin and stdout", () => {
    expect(shouldUseTui({ print: false, stdinIsTTY: true, stdoutIsTTY: true })).toBe(true);
    expect(shouldUseTui({ print: true, stdinIsTTY: true, stdoutIsTTY: true })).toBe(false);
    expect(shouldUseTui({ print: false, stdinIsTTY: false, stdoutIsTTY: true })).toBe(false);
    expect(shouldUseTui({ print: false, stdinIsTTY: true, stdoutIsTTY: false })).toBe(false);
  });
});
