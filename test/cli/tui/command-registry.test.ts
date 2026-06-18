import { describe, expect, it } from "vitest";
import {
  buildTuiCommands,
  filterTuiCommands,
  formatTuiHelp,
  getSlashCommandQuery,
  resolveTuiSubmission,
} from "../../../src/cli/tui/command-registry.js";

describe("tui command registry", () => {
  const pluginCommands = [
    {
      name: "research",
      description: "Research a topic.",
      toPrompt: ({ args }: { args: string }) => `Use research skill: ${args}`,
    },
    {
      name: "review",
      description: "Review code changes.",
      toPrompt: ({ args }: { args: string }) => `Use review skill: ${args}`,
    },
  ];

  it("combines built-in and plugin commands", () => {
    const commands = buildTuiCommands(pluginCommands);

    expect(commands.map((command) => command.name)).toEqual([
      "help",
      "session",
      "clear",
      "exit",
      "quit",
      "research",
      "review",
    ]);
    expect(commands.find((command) => command.name === "research")).toMatchObject({
      source: "plugin",
      description: "Research a topic.",
    });
  });

  it("filters commands by name and description with strongest matches first", () => {
    const commands = buildTuiCommands(pluginCommands);

    expect(filterTuiCommands(commands, "re").map((command) => command.name)).toEqual([
      "research",
      "review",
      "session",
    ]);
    expect(filterTuiCommands(commands, "code").map((command) => command.name)).toEqual(["review"]);
  });

  it("resolves built-in command submissions locally", () => {
    const commands = buildTuiCommands(pluginCommands);

    expect(resolveTuiSubmission("/help review", commands)).toEqual({
      type: "builtin",
      name: "help",
      args: "review",
      raw: "/help review",
    });
  });

  it("resolves plugin command submissions into model prompt text", () => {
    const commands = buildTuiCommands(pluginCommands);

    expect(resolveTuiSubmission("/research local tui", commands)).toEqual({
      type: "prompt",
      prompt: "Use research skill: local tui",
      displayText: "/research local tui",
      raw: "/research local tui",
      sourceCommand: "research",
    });
  });

  it("resolves normal text as a prompt and unknown slash command as an error", () => {
    const commands = buildTuiCommands(pluginCommands);

    expect(resolveTuiSubmission("hello", commands)).toEqual({
      type: "prompt",
      prompt: "hello",
      raw: "hello",
    });
    expect(resolveTuiSubmission("/missing arg", commands)).toEqual({
      type: "error",
      message: "Unknown command: /missing\nType /help for available commands.",
      raw: "/missing arg",
    });
  });

  it("formats help for all commands and one command", () => {
    const commands = buildTuiCommands(pluginCommands);

    expect(formatTuiHelp(commands)).toContain("/help");
    expect(formatTuiHelp(commands)).toContain("/research");
    expect(formatTuiHelp(commands, "research")).toBe("/research - Research a topic.");
    expect(formatTuiHelp(commands, "missing")).toBe("Unknown command: /missing. Type /help for available commands.");
  });

  it("opens the command picker only for a single slash token", () => {
    expect(getSlashCommandQuery("/")).toBe("");
    expect(getSlashCommandQuery("/re")).toBe("re");
    expect(getSlashCommandQuery("hello")).toBeNull();
    expect(getSlashCommandQuery("/help me")).toBeNull();
  });
});
