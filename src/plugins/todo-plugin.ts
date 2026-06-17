import { createTodoTools } from "../tools/todo-tools.js";
import type { AgentPlugin } from "./plugin-registry.js";

export function createTodoPlugin(): AgentPlugin {
  return {
    id: "todo",
    tools: createTodoTools(),
    systemPromptSections: [
      "- todo: provides todo_read and todo_write for tracking multi-step work. Keep at most one todo in_progress at a time.",
    ],
  };
}
