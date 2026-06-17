import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

const TODO_STATUSES = new Set(["pending", "in_progress", "completed"]);

const todoItemParameters = Type.Object({
  content: Type.String({ description: "Concrete task description." }),
  status: Type.String({ description: "Task status: pending, in_progress, or completed." }),
});

const todoWriteParameters = Type.Object({
  todos: Type.Array(todoItemParameters, {
    description: "Complete replacement todo list. At most one item may be in_progress.",
  }),
});

const todoReadParameters = Type.Object({});

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

interface TodoDetails {
  todos: TodoItem[];
}

export function createTodoTools(): AgentTool[] {
  let todos: TodoItem[] = [];

  const readTool: AgentTool<typeof todoReadParameters, TodoDetails> = {
    name: "todo_read",
    label: "Read Todos",
    description: "Read the current session todo list.",
    parameters: todoReadParameters,
    async execute(_toolCallId, _params, signal) {
      throwIfAborted(signal);

      return {
        content: [{ type: "text", text: formatTodos(todos) }],
        details: { todos },
      };
    },
  };

  const writeTool: AgentTool<typeof todoWriteParameters, TodoDetails> = {
    name: "todo_write",
    label: "Write Todos",
    description: "Replace the current session todo list. Use this to track multi-step tasks.",
    parameters: todoWriteParameters,
    async execute(_toolCallId, params, signal) {
      throwIfAborted(signal);

      const nextTodos = normalizeTodos(params.todos);
      const inProgressCount = nextTodos.filter((todo) => todo.status === "in_progress").length;
      if (inProgressCount > 1) {
        throw new Error("Only one todo can be in_progress at a time");
      }

      todos = nextTodos;

      return {
        content: [{ type: "text", text: `Updated todo list with ${todos.length} ${todos.length === 1 ? "item" : "items"}.` }],
        details: { todos },
      };
    },
  };

  return [readTool, writeTool];
}

function normalizeTodos(todos: Array<{ content: string; status: string }>): TodoItem[] {
  return todos.map((todo) => {
    const content = todo.content.trim();
    if (!content) {
      throw new Error("Todo content is required");
    }
    if (!TODO_STATUSES.has(todo.status)) {
      throw new Error(`Unsupported todo status: ${todo.status}`);
    }

    return {
      content,
      status: todo.status as TodoItem["status"],
    };
  });
}

function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return "Todo list is empty.";
  }

  return ["Todo list:", ...todos.map((todo, index) => `${index + 1}. [${todo.status}] ${todo.content}`)].join("\n");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Tool execution aborted");
  }
}
