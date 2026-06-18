import { describe, expect, it } from "vitest";
import { getAbsoluteLayoutPosition } from "../../../src/cli/tui/layout.js";

describe("tui layout helpers", () => {
  it("sums parent layout offsets", () => {
    const root = fakeLayoutNode({ left: 0, top: 0 });
    const column = fakeLayoutNode({ left: 2, top: 4 }, root);
    const input = fakeLayoutNode({ left: 3, top: 5 }, column);

    expect(getAbsoluteLayoutPosition(input)).toEqual({ left: 5, top: 9 });
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
