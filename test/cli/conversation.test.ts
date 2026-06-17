import { describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { runMultiTurnConversation } from "../../src/cli/conversation.js";

class MemoryWriter extends Writable {
  chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(chunk.toString());
    callback();
  }
}

describe("runMultiTurnConversation", () => {
  it("runs each non-empty user turn on the same streaming agent until exit", async () => {
    const output = new MemoryWriter();
    const inputs = ["remember my name is Tao", "", "what is my name?", "/exit"];
    const prompts: string[] = [];
    let savedTurns = 0;
    const beforeTurnInputs: string[] = [];
    let listener: ((event: unknown) => void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => void) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
      async prompt(input: string) {
        prompts.push(input);
        await listener?.({ type: "turn_start" });
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: `reply ${prompts.length}` },
        });
      },
    };

    await runMultiTurnConversation(agent, {
      ask: async () => inputs.shift(),
      output,
      beforeTurnStart: async ({ event }) => {
        beforeTurnInputs.push(event.type);
      },
      afterTurn: async () => {
        savedTurns += 1;
      },
    });

    expect(prompts).toEqual(["remember my name is Tao", "what is my name?"]);
    expect(beforeTurnInputs).toEqual(["turn_start", "turn_start"]);
    expect(savedTurns).toBe(2);
    expect(output.chunks.join("")).toBe("reply 1\nreply 2\n");
  });

  it("handles Claude-style slash commands without calling the model", async () => {
    const output = new MemoryWriter();
    const inputs = ["/help", "/session", "/clear", "/nope", "/exit"];
    const prompts: string[] = [];

    const agent = {
      subscribe() {
        return () => undefined;
      },
      async prompt(input: string) {
        prompts.push(input);
      },
    };

    await runMultiTurnConversation(agent, {
      ask: async () => inputs.shift(),
      output,
      helpText: () => "help text\n",
      sessionText: () => "session text\n",
    });

    expect(prompts).toEqual([]);
    expect(output.chunks.join("")).toBe(
      "help text\nsession text\n\u001BcUnknown command: /nope\nType /help for available commands.\n",
    );
  });

  it("runs plugin slash commands as model turns", async () => {
    const output = new MemoryWriter();
    const inputs = ["/research compare local options", "/exit"];
    const prompts: string[] = [];
    let savedTurns = 0;
    let listener: ((event: unknown) => void) | undefined;

    const agent = {
      subscribe(callback: (event: unknown) => void) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
      async prompt(input: string) {
        prompts.push(input);
        listener?.({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "researched" },
        });
      },
    };

    await runMultiTurnConversation(agent, {
      ask: async () => inputs.shift(),
      output,
      slashCommands: [
        {
          name: "research",
          description: "Research a topic.",
          toPrompt: ({ args }) => `Use research skill: ${args}`,
        },
      ],
      afterTurn: async () => {
        savedTurns += 1;
      },
    });

    expect(prompts).toEqual(["Use research skill: compare local options"]);
    expect(savedTurns).toBe(1);
    expect(output.chunks.join("")).toBe("researched\n");
  });
});
