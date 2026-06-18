import { describe, expect, it } from "vitest";
import {
  createInitialRuntimeViewState,
  createUserTextMessage,
  handleTuiInput,
  shouldSteer,
  type TuiControllerAgent,
} from "../../../src/cli/tui/index.js";
import { buildTuiCommands } from "../../../src/cli/tui/command-registry.js";
import type { TuiViewAction } from "../../../src/cli/tui/view-state.js";

describe("tui runtime helpers", () => {
  it("uses steering only while the agent is streaming", () => {
    expect(shouldSteer(true)).toBe(true);
    expect(shouldSteer(false)).toBe(false);
  });

  it("builds user text messages for prompt and steer paths", () => {
    expect(createUserTextMessage("focus on tests")).toEqual({
      role: "user",
      content: [{ type: "text", text: "focus on tests" }],
      timestamp: expect.any(Number),
    });
  });

  it("initializes the visible TUI state from resumed agent messages", () => {
    const agent = createAgent({
      isStreaming: false,
      messages: [
        { role: "user", content: "resume prompt", timestamp: 1 },
        { role: "assistant", content: [{ type: "text", text: "resume answer" }], timestamp: 2 },
      ],
    });

    expect(createInitialRuntimeViewState(agent).rows).toEqual([
      { kind: "user", text: "resume prompt" },
      { kind: "assistant", text: "resume answer" },
    ]);
  });

  it("submits idle text as a prompt and saves after the turn", async () => {
    const calls: string[] = [];
    const agent = createAgent({
      isStreaming: false,
      prompt: async (input) => {
        calls.push(`prompt:${input}`);
      },
    });

    await handleTuiInput(
      "hello",
      createOptions(agent, {
        afterTurn: async () => {
          calls.push("save");
        },
      }),
    );

    expect(calls).toEqual(["prompt:hello", "save"]);
  });

  it("submits streaming text as steering without starting another prompt", async () => {
    const calls: string[] = [];
    const agent = createAgent({
      isStreaming: true,
      prompt: async (input) => {
        calls.push(`prompt:${input}`);
      },
      steer: (message) => {
        calls.push(`steer:${message.content[0]?.text}`);
      },
    });
    const actions: TuiViewAction[] = [];

    await handleTuiInput("focus on tests", createOptions(agent, { dispatch: (action) => actions.push(action) }));

    expect(calls).toEqual(["steer:focus on tests"]);
    expect(actions).toContainEqual({ type: "steer_queued", text: "focus on tests" });
  });

  it("turns plugin commands into steering text while streaming", async () => {
    const calls: string[] = [];
    const actions: TuiViewAction[] = [];
    const agent = createAgent({
      isStreaming: true,
      steer: (message) => {
        calls.push(`steer:${message.content[0]?.text}`);
      },
    });

    await handleTuiInput(
      "/review focus diff",
      createOptions(agent, {
        commands: [
          {
            name: "review",
            description: "Review changes.",
            source: "plugin",
            toPrompt: ({ args }) => `Use review skill: ${args}`,
          },
        ],
        dispatch: (action) => actions.push(action),
      }),
    );

    expect(calls).toEqual(["steer:Use review skill: focus diff"]);
    expect(actions).toContainEqual({ type: "steer_queued", text: "/review focus diff" });
  });

  it("uses raw plugin commands as the visible user message while sending expanded prompts to the model", async () => {
    const actions: TuiViewAction[] = [];
    const calls: string[] = [];
    const agent = createAgent({
      isStreaming: false,
      prompt: async (input) => {
        calls.push(`prompt:${input}`);
      },
    });

    await handleTuiInput(
      "/review focus diff",
      createOptions(agent, {
        commands: [
          {
            name: "review",
            description: "Review changes.",
            source: "plugin",
            toPrompt: ({ args }) =>
              [
                'Use the "review" skill for this request.',
                'First call skill_read with name "review" and follow the loaded SKILL.md instructions before answering.',
                `User request: ${args}`,
              ].join("\n"),
          },
        ],
        dispatch: (action) => actions.push(action),
      }),
    );

    expect(calls).toEqual([
      [
        'prompt:Use the "review" skill for this request.',
        'First call skill_read with name "review" and follow the loaded SKILL.md instructions before answering.',
        "User request: focus diff",
      ].join("\n"),
    ]);
    expect(actions).toContainEqual({ type: "next_user_message_display", text: "/review focus diff" });
  });

  it("handles local help and session commands without model calls", async () => {
    const actions: TuiViewAction[] = [];
    const agent = createAgent({ isStreaming: false });

    await handleTuiInput("/help", createOptions(agent, { dispatch: (action) => actions.push(action) }));
    await handleTuiInput("/session", createOptions(agent, { dispatch: (action) => actions.push(action) }));

    expect(actions).toEqual([
      { type: "system_message", text: expect.stringContaining("/help"), tone: "info" },
      { type: "system_message", text: "session details", tone: "info" },
    ]);
  });

  it("handles targeted tool expansion locally", async () => {
    const actions: TuiViewAction[] = [];
    const calls: string[] = [];
    const agent = createAgent({
      isStreaming: false,
      prompt: async (input) => {
        calls.push(`prompt:${input}`);
      },
    });

    await handleTuiInput("/tool 2", createOptions(agent, { dispatch: (action) => actions.push(action) }));

    expect(calls).toEqual([]);
    expect(actions).toEqual([{ type: "toggle_tool_result_at_index", index: 2 }]);
  });

  it("handles clear locally", async () => {
    const calls: string[] = [];
    const agent = createAgent({ isStreaming: false });

    await handleTuiInput(
      "/clear",
      createOptions(agent, {
        clear: () => calls.push("clear"),
      }),
    );

    expect(calls).toEqual(["clear"]);
  });
});

function createOptions(
  agent: TuiControllerAgent,
  overrides: Partial<Parameters<typeof handleTuiInput>[1]> = {},
): Parameters<typeof handleTuiInput>[1] {
  return {
    agent,
    commands: buildTuiCommands(),
    dispatch: () => undefined,
    helpText: () => "help text",
    sessionText: () => "session details",
    clear: () => undefined,
    exit: () => undefined,
    ...overrides,
  };
}

function createAgent(
  overrides: Partial<Omit<TuiControllerAgent, "state">> & {
    isStreaming?: boolean;
    messages?: TuiControllerAgent["state"]["messages"];
  },
): TuiControllerAgent {
  return {
    state: { isStreaming: overrides.isStreaming ?? false, messages: overrides.messages },
    prompt: overrides.prompt ?? (async () => undefined),
    steer: overrides.steer ?? (() => undefined),
    abort: overrides.abort ?? (() => undefined),
    subscribe: overrides.subscribe ?? (() => () => undefined),
  };
}
