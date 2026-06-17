import { describe, expect, it } from "vitest";
import {
  insertTextAtCursor,
  moveCursorLeft,
  moveCursorRight,
  moveCursorWordLeft,
  moveCursorWordRight,
  removeCharacterBeforeCursor,
} from "../../../src/cli/tui/input-editor.js";

describe("tui input editor", () => {
  it("inserts text at the cursor", () => {
    expect(insertTextAtCursor({ text: "helo", cursorOffset: 2 }, "l")).toEqual({
      text: "hello",
      cursorOffset: 3,
    });
  });

  it("removes the character before the cursor", () => {
    expect(removeCharacterBeforeCursor({ text: "hello", cursorOffset: 3 })).toEqual({
      text: "helo",
      cursorOffset: 2,
    });
    expect(removeCharacterBeforeCursor({ text: "hello", cursorOffset: 0 })).toEqual({
      text: "hello",
      cursorOffset: 0,
    });
  });

  it("moves the cursor by character and word", () => {
    const state = { text: "hello brave world", cursorOffset: 12 };

    expect(moveCursorLeft(state)).toEqual({ text: state.text, cursorOffset: 11 });
    expect(moveCursorRight(state)).toEqual({ text: state.text, cursorOffset: 13 });
    expect(moveCursorWordLeft(state)).toEqual({ text: state.text, cursorOffset: 6 });
    expect(moveCursorWordRight(state)).toEqual({ text: state.text, cursorOffset: 17 });
  });
});
