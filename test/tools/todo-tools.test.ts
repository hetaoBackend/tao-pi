import { describe, expect, it } from "vitest";
import { createTodoTools } from "../../src/tools/todo-tools.js";

describe("createTodoTools", () => {
  it("creates a todo_read tool that starts empty", async () => {
    const readTool = createTodoTools().find((tool) => tool.name === "todo_read");

    const result = await readTool?.execute("call-1", {});

    expect(result?.content[0]).toEqual({ type: "text", text: "Todo list is empty." });
    expect(result?.details).toEqual({ todos: [] });
  });

  it("creates a todo_write tool that replaces the current todo list", async () => {
    const tools = createTodoTools();
    const writeTool = tools.find((tool) => tool.name === "todo_write");
    const readTool = tools.find((tool) => tool.name === "todo_read");

    const writeResult = await writeTool?.execute("call-1", {
      todos: [
        { content: "Inspect current tests", status: "completed" },
        { content: "Implement todo tools", status: "in_progress" },
        { content: "Run verification", status: "pending" },
      ],
    });
    const readResult = await readTool?.execute("call-2", {});

    expect(writeResult?.content[0]).toEqual({ type: "text", text: "Updated todo list with 3 items." });
    expect(readResult?.content[0]).toEqual({
      type: "text",
      text: [
        "Todo list:",
        "1. [completed] Inspect current tests",
        "2. [in_progress] Implement todo tools",
        "3. [pending] Run verification",
      ].join("\n"),
    });
    expect(readResult?.details).toEqual({
      todos: [
        { content: "Inspect current tests", status: "completed" },
        { content: "Implement todo tools", status: "in_progress" },
        { content: "Run verification", status: "pending" },
      ],
    });
  });

  it("rejects todo lists with more than one in-progress item", async () => {
    const writeTool = createTodoTools().find((tool) => tool.name === "todo_write");

    await expect(
      writeTool?.execute("call-1", {
        todos: [
          { content: "First", status: "in_progress" },
          { content: "Second", status: "in_progress" },
        ],
      }),
    ).rejects.toThrow("Only one todo can be in_progress at a time");
  });

  it("rejects unknown todo statuses", async () => {
    const writeTool = createTodoTools().find((tool) => tool.name === "todo_write");

    await expect(
      writeTool?.execute("call-1", {
        todos: [{ content: "Mystery", status: "blocked" }],
      }),
    ).rejects.toThrow("Unsupported todo status: blocked");
  });
});
