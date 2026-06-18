import { renderToString } from "ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageHistory } from "../../../src/cli/tui/components/message-history.js";
import { ENABLE_SGR_MOUSE } from "../../../src/cli/tui/mouse.js";

const terminalWrites = vi.hoisted(() => ({
  values: [] as string[],
}));

vi.mock("ink", async () => {
  const actual = await vi.importActual<typeof import("ink")>("ink");

  return {
    ...actual,
    useInput: () => {},
    useStdout: () => ({
      stdout: {
        isTTY: true,
        destroyed: false,
        writableEnded: false,
        write: (value: string) => {
          terminalWrites.values.push(value);
        },
      },
      write: (value: string) => {
        terminalWrites.values.push(value);
      },
    }),
  };
});

describe("tui message history mouse behavior", () => {
  it("does not enable terminal mouse tracking by default so native scroll remains available", () => {
    terminalWrites.values.length = 0;

    renderToString(
      <MessageHistory
        onToggleToolResult={() => {}}
        rows={[
          {
            kind: "tool",
            toolCallId: "call-1",
            toolName: "bash",
            title: "Run command",
            detail: "printf",
            result: "ok",
            fullResult: "ok",
            resultTruncated: false,
            status: "ok",
          },
        ]}
      />,
    );

    expect(terminalWrites.values).not.toContain(ENABLE_SGR_MOUSE);
  });
});
