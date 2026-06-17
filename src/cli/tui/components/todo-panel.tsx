import { Box, Text } from "ink";
import type { TodoViewItem } from "../message-format.js";
import { tuiTheme } from "../theme.js";

export interface TodoPanelProps {
  todos: readonly TodoViewItem[];
  streaming: boolean;
}

export function TodoPanel({ todos, streaming }: TodoPanelProps) {
  if (todos.length === 0) {
    return null;
  }

  const allCompleted = todos.every((todo) => todo.status === "completed");
  if (!streaming && allCompleted) {
    return null;
  }

  const completed = todos.filter((todo) => todo.status === "completed").length;
  const inProgress = todos.filter((todo) => todo.status === "in_progress").length;
  const pending = todos.filter((todo) => todo.status === "pending").length;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1}>
      <Box columnGap={1}>
        <Text color={tuiTheme.colors.primary} bold>
          Tasks
        </Text>
        <Text color={tuiTheme.colors.dim}>
          {completed} completed, {inProgress} in progress, {pending} pending
        </Text>
      </Box>
      {todos.map((todo, index) => (
        <Box key={`${todo.status}:${index}:${todo.content}`} columnGap={1}>
          <Text color={todoColor(todo.status)}>{todoIcon(todo.status)}</Text>
          <Text color={todo.status === "completed" ? tuiTheme.colors.dim : undefined}>{todo.content}</Text>
        </Box>
      ))}
    </Box>
  );
}

function todoIcon(status: string): string {
  if (status === "completed") {
    return tuiTheme.symbols.done;
  }
  if (status === "in_progress") {
    return tuiTheme.symbols.active;
  }
  return tuiTheme.symbols.pending;
}

function todoColor(status: string): string {
  if (status === "completed") {
    return tuiTheme.colors.accent;
  }
  if (status === "in_progress") {
    return tuiTheme.colors.primary;
  }
  return tuiTheme.colors.dim;
}
