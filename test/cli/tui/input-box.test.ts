import { describe, expect, it } from "vitest";
import { getInputCursorSegments, isToggleToolResultsInput } from "../../../src/cli/tui/components/input-box.js";

describe("tui input box", () => {
  it("recognizes Ctrl+O as the tool result fold toggle", () => {
    expect(isToggleToolResultsInput("o", { ctrl: true })).toBe(true);
    expect(isToggleToolResultsInput("o", { ctrl: false })).toBe(false);
    expect(isToggleToolResultsInput("x", { ctrl: true })).toBe(false);
  });

  it("splits input text around a visible cursor cell", () => {
    expect(getInputCursorSegments("abcd", 2)).toEqual({ before: "ab", cursor: "c", after: "d" });
    expect(getInputCursorSegments("abcd", 4)).toEqual({ before: "abcd", cursor: " ", after: "" });
    expect(getInputCursorSegments("", 0)).toEqual({ before: "", cursor: " ", after: "" });
  });
});
