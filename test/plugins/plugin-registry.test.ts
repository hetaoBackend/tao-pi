import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { createAgentPluginRuntime } from "../../src/plugins/plugin-registry.js";

const emptyParameters = Type.Object({});

function fakeTool(name: string): AgentTool {
  return {
    name,
    label: name,
    description: `${name} test tool`,
    parameters: emptyParameters,
    async execute() {
      return { content: [{ type: "text", text: name }], details: {} };
    },
  };
}

describe("createAgentPluginRuntime", () => {
  it("collects plugin ids, tools, and prompt sections in registration order", () => {
    const runtime = createAgentPluginRuntime([
      {
        id: "todo",
        tools: [fakeTool("todo_read"), fakeTool("todo_write")],
        systemPromptSections: ["- todo guidance"],
        slashCommands: [
          {
            name: "plan",
            description: "Create a todo plan.",
            toPrompt: ({ args }) => `Plan: ${args}`,
          },
        ],
      },
      {
        id: "research",
        tools: [fakeTool("research_lookup")],
        systemPromptSections: ["- research guidance"],
        slashCommands: [
          {
            name: "research",
            description: "Research a topic.",
            toPrompt: ({ args }) => `Research: ${args}`,
          },
        ],
      },
    ]);

    expect(runtime.pluginIds).toEqual(["todo", "research"]);
    expect(runtime.tools.map((tool) => tool.name)).toEqual(["todo_read", "todo_write", "research_lookup"]);
    expect(runtime.systemPromptSections).toEqual(["- todo guidance", "- research guidance"]);
    expect(runtime.slashCommands.map((command) => command.name)).toEqual(["plan", "research"]);
  });

  it("rejects duplicate plugin ids", () => {
    expect(() =>
      createAgentPluginRuntime([
        { id: "todo", tools: [fakeTool("todo_read")] },
        { id: "todo", tools: [fakeTool("todo_write")] },
      ]),
    ).toThrow("Duplicate plugin id: todo");
  });

  it("rejects duplicate tool names across plugins", () => {
    expect(() =>
      createAgentPluginRuntime([
        { id: "todo", tools: [fakeTool("shared_tool")] },
        { id: "memory", tools: [fakeTool("shared_tool")] },
      ]),
    ).toThrow("Duplicate plugin tool name: shared_tool");
  });

  it("rejects duplicate slash command names across plugins", () => {
    expect(() =>
      createAgentPluginRuntime([
        {
          id: "todo",
          slashCommands: [
            {
              name: "plan",
              description: "Create a todo plan.",
              toPrompt: ({ args }) => `Plan: ${args}`,
            },
          ],
        },
        {
          id: "memory",
          slashCommands: [
            {
              name: "plan",
              description: "Plan from memory.",
              toPrompt: ({ args }) => `Memory plan: ${args}`,
            },
          ],
        },
      ]),
    ).toThrow("Duplicate plugin slash command: plan");
  });
});
