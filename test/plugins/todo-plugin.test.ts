import { describe, expect, it } from "vitest";
import { createTodoPlugin } from "../../src/plugins/todo-plugin.js";

describe("createTodoPlugin", () => {
  it("packages todo tools and prompt guidance as a plugin", () => {
    const plugin = createTodoPlugin();

    expect(plugin.id).toBe("todo");
    expect(plugin.tools?.map((tool) => tool.name)).toEqual(["todo_read", "todo_write"]);
    expect(plugin.systemPromptSections?.join("\n")).toContain("todo_read");
    expect(plugin.systemPromptSections?.join("\n")).toContain("todo_write");
    expect(plugin.systemPromptSections?.join("\n")).toContain("multi-step work");
    expect(plugin.systemPromptSections?.join("\n")).toContain("before a final response");
    expect(plugin.systemPromptSections?.join("\n")).toContain("finished item marked completed");
    expect(plugin.systemPromptSections?.join("\n")).not.toContain("coding work");
  });
});
