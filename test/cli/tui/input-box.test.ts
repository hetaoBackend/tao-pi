import { describe, expect, it } from "vitest";
import {
  getAbsoluteLayoutPosition,
  getInputCursorPosition,
  getInputTextSegments,
  isToggleToolResultsInput,
} from "../../../src/cli/tui/components/input-box.js";

describe("tui input box", () => {
  it("recognizes Ctrl+O as the tool result fold toggle", () => {
    expect(isToggleToolResultsInput("o", { ctrl: true })).toBe(true);
    expect(isToggleToolResultsInput("o", { ctrl: false })).toBe(false);
    expect(isToggleToolResultsInput("x", { ctrl: true })).toBe(false);
  });

  it("splits input text without rendering a second visible cursor cell", () => {
    expect(getInputTextSegments("abcd", 2)).toEqual({ before: "ab", after: "cd" });
    expect(getInputTextSegments("abcd", 4)).toEqual({ before: "abcd", after: "" });
    expect(getInputTextSegments("", 0)).toEqual({ before: "", after: "" });
  });

  it("sums parent layout offsets for terminal cursor positioning", () => {
    const root = fakeLayoutNode({ left: 0, top: 0 });
    const column = fakeLayoutNode({ left: 2, top: 4 }, root);
    const input = fakeLayoutNode({ left: 3, top: 5 }, column);

    expect(getAbsoluteLayoutPosition(input)).toEqual({ left: 5, top: 9 });
  });

  it("places the IME cursor on the input content cell after wide characters", () => {
    expect(getInputCursorPosition({ left: 5, top: 9 }, "当前有 s", 3)).toEqual({
      x: 15,
      y: 10,
    });
  });
});

function fakeLayoutNode(layout: { left: number; top: number }, parentNode?: unknown) {
  return {
    parentNode,
    yogaNode: {
      getComputedLayout: () => ({ ...layout, width: 0, height: 0 }),
    },
  };
}
