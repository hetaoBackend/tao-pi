import { Box } from "ink";
import type { TuiCommand } from "./command-registry.js";
import type { TodoViewItem } from "./message-format.js";
import { Footer } from "./components/footer.js";
import { Header } from "./components/header.js";
import { InputBox } from "./components/input-box.js";
import { MessageHistory } from "./components/message-history.js";
import { StreamingIndicator } from "./components/streaming-indicator.js";
import { TodoPanel } from "./components/todo-panel.js";
import type { TuiRow } from "./view-state.js";

export interface TuiAppProps {
  appVersion: string;
  modelLabel: string;
  sessionId: string;
  sessionMode: "new" | "resumed";
  workspaceRoot: string;
  toolCount: number;
  pluginCount: number;
  projectContextCount: number;
  messageCount: number;
  commands: readonly TuiCommand[];
  rows: readonly TuiRow[];
  todos: readonly TodoViewItem[];
  streaming: boolean;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  toolResultsExpanded: boolean;
  onToggleToolResults: () => void;
}

export function TuiApp({
  appVersion,
  modelLabel,
  sessionId,
  sessionMode,
  workspaceRoot,
  toolCount,
  pluginCount,
  projectContextCount,
  messageCount,
  commands,
  rows,
  todos,
  streaming,
  onSubmit,
  onAbort,
  toolResultsExpanded,
  onToggleToolResults,
}: TuiAppProps) {
  const nextTodo = todos.find((todo) => todo.status === "in_progress") ?? todos.find((todo) => todo.status === "pending");

  return (
    <Box flexDirection="column" width="100%" rowGap={1}>
      <Header
        appVersion={appVersion}
        modelLabel={modelLabel}
        sessionId={sessionId}
        sessionMode={sessionMode}
        workspaceRoot={workspaceRoot}
        toolCount={toolCount}
        pluginCount={pluginCount}
        projectContextCount={projectContextCount}
      />
      <MessageHistory rows={rows} toolResultsExpanded={toolResultsExpanded} />
      <StreamingIndicator streaming={streaming} nextTodo={nextTodo?.content} />
      <TodoPanel todos={todos} streaming={streaming} />
      <InputBox
        commands={commands}
        streaming={streaming}
        onSubmit={onSubmit}
        onAbort={onAbort}
        onToggleToolResults={onToggleToolResults}
      />
      <Footer
        modelLabel={modelLabel}
        sessionMode={sessionMode}
        messageCount={messageCount}
        toolCount={toolCount}
        pluginCount={pluginCount}
        inputMode={streaming ? "steer" : "prompt"}
      />
    </Box>
  );
}
