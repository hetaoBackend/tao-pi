import { createTodoTools } from "../tools/todo-tools.js";
import type { AgentPlugin } from "./plugin-registry.js";

export function createTodoPlugin(): AgentPlugin {
  return {
    id: "todo",
    tools: createTodoTools(),
    systemPromptSections: [
      [
        "- todo: provides todo_read and todo_write for tracking multi-step work.",
        "Use todo_write whenever the active task changes, and before a final response if you used todos, write the complete list with every finished item marked completed.",
        "Keep at most one todo in_progress at a time.",
      ].join(" "),
    ],
  };
}
