import { renderToString } from "ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { InputBox } from "../../../src/cli/tui/components/input-box.js";

const cursorEvents = vi.hoisted(() => ({
  committed: [] as unknown[],
  setCalls: [] as unknown[],
}));

vi.mock("ink", async () => {
  const actual = await vi.importActual<typeof import("ink")>("ink");
  const react = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useBoxMetrics: () => ({ width: 0, height: 0, left: 0, top: 0, hasMeasured: true }),
    useCursor: () => {
      const positionRef = react.useRef<unknown>(undefined);

      react.useInsertionEffect(() => {
        cursorEvents.committed.push(positionRef.current);
      });

      return {
        setCursorPosition: (position: unknown) => {
          cursorEvents.setCalls.push(position);
          positionRef.current = position;
        },
      };
    },
    useInput: () => {},
  };
});

describe("tui input box cursor", () => {
  it("sets the terminal cursor position during render for IME placement", () => {
    cursorEvents.committed.length = 0;
    cursorEvents.setCalls.length = 0;

    renderToString(
      <InputBox
        commands={[]}
        streaming={false}
        onSubmit={() => {}}
        onAbort={() => {}}
        onToggleToolResults={() => {}}
      />,
    );

    expect(cursorEvents.setCalls).toContainEqual({ x: 4, y: 1 });
    expect(cursorEvents.committed).toContainEqual({ x: 4, y: 1 });
  });
});
