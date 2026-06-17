import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { createTransformContext, prefixLatestUserTextMessage } from "../../src/agent/context-transform.js";

describe("context transform helpers", () => {
  it("prefixes the latest user text message without mutating the original messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "old", timestamp: 1 },
      {
        role: "assistant",
        content: [],
        api: "test",
        provider: "test",
        model: "test",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 2,
      },
      { role: "user", content: "latest", timestamp: 3 },
    ];

    const transformed = prefixLatestUserTextMessage(messages, "[from transformContext]\n");

    expect(transformed.at(-1)).toMatchObject({
      role: "user",
      content: "[from transformContext]\nlatest",
    });
    expect(messages.at(-1)).toMatchObject({
      role: "user",
      content: "latest",
    });
  });

  it("creates an Agent-compatible transformContext function", async () => {
    const transformContext = createTransformContext({
      sessionId: "session-1",
      transform: ({ messages, sessionId }) =>
        prefixLatestUserTextMessage(messages, `[session=${sessionId}]\n`),
    });

    const transformed = await transformContext([{ role: "user", content: "hello", timestamp: 1 }]);

    expect(transformed).toEqual([
      {
        role: "user",
        content: "[session=session-1]\nhello",
        timestamp: 1,
      },
    ]);
  });
});
