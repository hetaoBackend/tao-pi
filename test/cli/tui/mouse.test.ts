import { describe, expect, it } from "vitest";
import {
  findToolResultHitTarget,
  getTerminalRectangle,
  parseSgrMouseInput,
  type ToolResultHitTarget,
} from "../../../src/cli/tui/mouse.js";

describe("tui mouse helpers", () => {
  it("parses SGR left mouse press coordinates", () => {
    expect(parseSgrMouseInput("\u001B[<0;12;4M")).toEqual({
      button: "left",
      action: "press",
      x: 12,
      y: 4,
    });
    expect(parseSgrMouseInput("[<0;12;4m")).toEqual({
      button: "left",
      action: "release",
      x: 12,
      y: 4,
    });
    expect(parseSgrMouseInput("x")).toBeUndefined();
  });

  it("does not classify wheel events as left clicks", () => {
    expect(parseSgrMouseInput("[<64;12;4M")).toMatchObject({
      button: "unknown",
      action: "press",
      x: 12,
      y: 4,
    });
  });

  it("maps zero-based Ink layout coordinates to one-based terminal cells", () => {
    expect(getTerminalRectangle({ left: 3, top: 4 }, { width: 10, height: 2 })).toEqual({
      left: 4,
      top: 5,
      right: 13,
      bottom: 6,
    });
  });

  it("finds the clicked tool result target", () => {
    const targets: ToolResultHitTarget[] = [
      {
        toolCallId: "call-1",
        rectangle: { left: 1, top: 2, right: 20, bottom: 4 },
      },
      {
        toolCallId: "call-2",
        rectangle: { left: 1, top: 5, right: 20, bottom: 7 },
      },
    ];

    expect(findToolResultHitTarget(targets, { x: 8, y: 6 })?.toolCallId).toBe("call-2");
    expect(findToolResultHitTarget(targets, { x: 8, y: 9 })).toBeUndefined();
  });
});
