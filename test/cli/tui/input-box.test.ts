import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import React from "react";
import { InputBox } from "../../../src/cli/tui/components/input-box.js";
import {
  getInputTextSegments,
  isMouseInput,
  isToggleToolResultsInput,
} from "../../../src/cli/tui/components/input-box.js";

describe("tui input box", () => {
  it("renders a stable inline cursor inside the input frame", () => {
    const output = renderToString(
      React.createElement(InputBox, {
        commands: [],
        streaming: false,
        onSubmit: () => {},
        onAbort: () => {},
        onToggleToolResults: () => {},
      }),
    );

    expect(output).toContain("> |ask TaoPi");
  });

  it("recognizes Ctrl+O as the tool result fold toggle", () => {
    expect(isToggleToolResultsInput("o", { ctrl: true })).toBe(true);
    expect(isToggleToolResultsInput("o", { ctrl: false })).toBe(false);
    expect(isToggleToolResultsInput("x", { ctrl: true })).toBe(false);
  });

  it("recognizes terminal mouse escape sequences so clicks do not enter text", () => {
    expect(isMouseInput("\u001B[<0;12;4M")).toBe(true);
    expect(isMouseInput("[<0;12;4M")).toBe(true);
    expect(isMouseInput("hello")).toBe(false);
  });

  it("splits input text without rendering a second visible cursor cell", () => {
    expect(getInputTextSegments("abcd", 2)).toEqual({ before: "ab", after: "cd" });
    expect(getInputTextSegments("abcd", 4)).toEqual({ before: "abcd", after: "" });
    expect(getInputTextSegments("", 0)).toEqual({ before: "", after: "" });
  });
});
