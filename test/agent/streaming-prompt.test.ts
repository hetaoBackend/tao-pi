import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { runStreamingPrompt } from "../../src/agent/streaming-prompt.js";

class MemoryWriter extends Writable {
  chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(chunk.toString());
    callback();
  }
}

describe("runStreamingPrompt", () => {
  it("writes assistant text deltas as the agent streams them", async () => {
    const output = new MemoryWriter();
    const prompts: string[] = [];
    let listener: ((event: unknown) => Promise<void> | void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => Promise<void> | void) {
        listener = callback;
        return () => undefined;
      },
      async prompt(input: string) {
        prompts.push(input);
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "hello" },
        });
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: " world" },
        });
      },
    };

    await runStreamingPrompt(agent, "Say hi", output);

    expect(prompts).toEqual(["Say hi"]);
    expect(output.chunks.join("")).toBe("hello world");
  });

  it("rejects when subscriber output handling fails even if the agent does not await listeners", async () => {
    let listener: ((event: unknown) => Promise<void> | void) | undefined;
    let unsubscribed = false;
    const output = {
      write() {
        throw new Error("output closed");
      },
    } as unknown as Writable;
    const agent = {
      subscribe(callback: (event: unknown) => Promise<void> | void) {
        listener = callback;
        return () => {
          unsubscribed = true;
        };
      },
      async prompt() {
        void listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "hello" },
        });
      },
    };

    await expect(runStreamingPrompt(agent, "Say hi", output)).rejects.toThrow("output closed");
    expect(unsubscribed).toBe(true);
  });

  it("runs a beforeTurnStart hook when the pi turn_start event is emitted", async () => {
    const output = new MemoryWriter();
    const calls: string[] = [];
    let listener: ((event: unknown) => Promise<void> | void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => Promise<void> | void) {
        listener = callback;
        return () => undefined;
      },
      async prompt(input: string) {
        calls.push("prompt");
        await listener?.({ type: "turn_start" });
        calls.push("after-turn-start");
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: input },
        });
      },
    };

    await runStreamingPrompt(agent, "Say hi", output, {
      beforeTurnStart: async ({ event }) => {
        calls.push(`hook:${event.type}`);
      },
    });

    expect(calls).toEqual(["prompt", "hook:turn_start", "after-turn-start"]);
    expect(output.chunks.join("")).toBe("Say hi");
  });

  it("writes assistant error messages instead of failing silently", async () => {
    const output = new MemoryWriter();
    let listener: ((event: unknown) => Promise<void> | void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => Promise<void> | void) {
        listener = callback;
        return () => undefined;
      },
      async prompt() {
        await listener?.({
          type: "message_end",
          message: {
            role: "assistant",
            stopReason: "error",
            errorMessage: "400 invalid role developer",
          },
        });
      },
    };

    await runStreamingPrompt(agent, "Say hi", output);

    expect(output.chunks.join("")).toContain("[assistant error] 400 invalid role developer");
  });

  it("shows tool calls and tool results in the streamed transcript", async () => {
    const output = new MemoryWriter();
    let listener: ((event: unknown) => Promise<void> | void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => Promise<void> | void) {
        listener = callback;
        return () => undefined;
      },
      async prompt() {
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "I will search." },
        });
        listener?.({
          type: "tool_execution_start",
          toolCallId: "call-1",
          toolName: "web_search",
          args: { query: "pi agent", limit: 2 },
        });
        listener?.({
          type: "tool_execution_end",
          toolCallId: "call-1",
          toolName: "web_search",
          isError: false,
          result: {
            content: [{ type: "text", text: "Search results for pi agent" }],
            details: { creditsUsed: 1 },
          },
        });
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Done." },
        });
      },
    };

    await runStreamingPrompt(agent, "Search", output);

    expect(output.chunks.join("")).toBe(
      [
        "I will search.",
        "[tool call] web_search",
        'args: {"query":"pi agent","limit":2}',
        "[tool result] web_search ok",
        "Search results for pi agent",
        "Done.",
      ].join("\n"),
    );
  });

  it("truncates long tool arguments and results in the streamed transcript", async () => {
    const output = new MemoryWriter();
    let listener: ((event: unknown) => Promise<void> | void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => Promise<void> | void) {
        listener = callback;
        return () => undefined;
      },
      async prompt() {
        listener?.({
          type: "tool_execution_start",
          toolCallId: "call-1",
          toolName: "write_file",
          args: { content: "abcdefghijklmnopqrstuvwxyz" },
        });
        listener?.({
          type: "tool_execution_end",
          toolCallId: "call-1",
          toolName: "write_file",
          isError: true,
          result: {
            content: [{ type: "text", text: "0123456789abcdefghijklmnopqrstuvwxyz" }],
            details: {},
          },
        });
      },
    };

    await runStreamingPrompt(agent, "Write", output, { maxToolDisplayChars: 12 });

    expect(output.chunks.join("")).toContain('args: {"content":"...');
    expect(output.chunks.join("")).toContain("[tool result] write_file error");
    expect(output.chunks.join("")).toContain("0123456789ab...");
  });
});
