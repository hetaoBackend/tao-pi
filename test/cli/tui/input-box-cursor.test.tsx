import { renderToString } from "ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { InputBox } from "../../../src/cli/tui/components/input-box.js";

const cursorEvents = vi.hoisted(() => ({
  setCalls: [] as unknown[],
}));

vi.mock("ink", async () => {
  const actual = await vi.importActual<typeof import("ink")>("ink");

  return {
    ...actual,
    useCursor: () => ({
      setCursorPosition: (position: unknown) => {
        cursorEvents.setCalls.push(position);
      },
    }),
    useInput: () => {},
  };
});

describe("tui input box cursor", () => {
  it("renders the visible cursor inside the input box instead of using terminal positioning", () => {
    cursorEvents.setCalls.length = 0;

    const output = renderToString(
      <InputBox
        commands={[]}
        streaming={false}
        onSubmit={() => {}}
        onAbort={() => {}}
        onToggleToolResults={() => {}}
      />,
    );

    expect(output).toContain("> |ask TaoPi");
    expect(cursorEvents.setCalls).toEqual([]);
  });
});
