import { describe, expect, it } from "vitest";
import { createInputHistory } from "../../../src/cli/tui/input-history.js";

describe("tui input history", () => {
  it("saves bounded non-empty entries without duplicate consecutive values", () => {
    const history = createInputHistory({ maxEntries: 3 });

    history.save(" one ");
    history.save("one");
    history.save("");
    history.save("two");
    history.save("three");
    history.save("four");

    expect(history.entries()).toEqual(["two", "three", "four"]);
  });

  it("browses up and down through history", () => {
    const history = createInputHistory({ initialEntries: ["one", "two"], maxEntries: 10 });

    expect(history.previous()).toBe("two");
    expect(history.previous()).toBe("one");
    expect(history.previous()).toBe("one");
    expect(history.next()).toBe("two");
    expect(history.next()).toBe("");
    expect(history.next()).toBe("");
  });
});
