# CLI TUI Polish Design

## Context

The active goal is to polish the entire CLI UI until it reaches the TUI quality level of
MagicCube/helixent. The current CLI is a readline loop with plain string rendering in
`src/cli/ui.ts`, turn execution in `src/cli/conversation.ts`, and streaming event rendering
in `src/agent/streaming-prompt.ts`.

Helixent sets the reference bar with a real Ink/React terminal UI: a header, live message
history, command picker, editable input box, streaming indicator, task panel, footer, and
separate interaction surfaces for interruption and follow-up input. This project should adopt
the same class of TUI shell while preserving its existing Pi agent runtime, SQLite sessions,
tool adapters, plugin registry, and Chinese system prompt.

This design intentionally supersedes the older note in `docs/architecture.md` that says not
to add a framework. That note was appropriate for the earlier plain TypeScript CLI. A
helixent-level interactive TUI requires a terminal UI framework, and Ink is the closest match
to the target reference.

## Goals

- Replace the interactive readline experience with an Ink TUI that feels structured,
  responsive, and usable for long agent sessions.
- Preserve `--print` as a plain text one-shot mode and keep non-TTY execution compatible with
  the existing stream renderer.
- Keep `src/index.ts` thin: it should compose runtime dependencies, then choose the text or TUI
  runner.
- Render agent activity as stateful UI: user turns, assistant text, tool calls, tool results,
  assistant errors, active streaming state, and current task list.
- Provide helixent-style input affordances: slash command filtering, command selection,
  cursor movement, input history, abort, and steering while the agent is already working.
- Treat `Agent.steer()` as a first-class TUI behavior. When the agent is streaming, submitted
  text is queued as steering for the active run instead of starting a second prompt.
- Keep implementation testable through pure reducers and input helpers before React rendering.

## Non-Goals

- Do not rewrite the agent loop, model configuration, tool adapters, persistence layer, or
  plugin system.
- Do not add subagents, task runners, or approval policy changes as part of this UI slice.
- Do not make `--print` depend on Ink.
- Do not attempt exact visual cloning of helixent branding. The target is the same level of
  TUI capability and polish, adapted to TaoPi.

## User Experience

The interactive session opens with a compact header:

- TaoPi name and a small text logo.
- Provider/model label.
- Session id with `new` or `resumed` state.
- Workspace root and project context file count.
- Plugin and tool counts.

The main body is a conversation surface. User messages are shown as distinct prompt rows.
Assistant text streams into a highlighted assistant lane. Tool calls render as compact cards
with a readable title, the relevant path/command/query when available, and an ok/error result
line when finished. Long arguments and results are summarized, not dumped into the main view.

The input area is always visible when no blocking prompt is active. Typing `/` opens a command
picker containing built-in commands plus plugin slash commands. The picker supports filtering,
arrow navigation, Enter/Tab acceptance, and Escape dismissal. Normal input supports left/right
movement, word movement, backspace, history up/down, Enter submit, Escape abort, and Ctrl-C
abort.

While the agent is streaming, the input box remains usable in steering mode. Its placeholder
changes to make clear that submitted text will steer the current run. Pressing Enter with text
while streaming calls `agent.steer({ role: "user", content: [{ type: "text", text }] })` and
shows a small queued steering row. It does not call `agent.prompt()` concurrently. If the
runtime is idle, the same input starts a normal prompt.

The streaming indicator shows a small animated marker plus a status phrase. If the todo panel
has a current or next item, the indicator references that work item. The footer remains quiet
and informational: model, session mode, message count, tool count, plugin count, and whether
input will prompt or steer.

## Slash Commands

The TUI command registry will normalize these command sources into one list:

- Built-ins: `/help`, `/session`, `/clear`, `/exit`, and `/quit`.
- Plugin commands from `AgentPluginRuntime.slashCommands`.

Built-ins execute locally:

- `/help` renders help in the message history without calling the model.
- `/session` renders the current session summary without calling the model.
- `/clear` clears the visible TUI transcript and terminal scrollback, but it does not delete
  persisted session messages and does not call `agent.reset()`.
- `/exit` and `/quit` leave the TUI.

Plugin commands keep the existing behavior: the selected command's `toPrompt()` output becomes
the model prompt when idle. If a plugin command is submitted while streaming, the generated
prompt is passed through `agent.steer()` as a user steering message.

Unknown slash commands show an inline error and suggest `/help`.

## Agent Event Model

Add a pure view-state reducer under `src/cli/tui/` that consumes the existing
`@earendil-works/pi-agent-core` events:

- `agent_start`: mark the run as active.
- `turn_start`: record a new model turn.
- `message_start`: add a user row when the message role is `user`; create an assistant row
  when the message role is `assistant` and no active assistant row exists for the current turn.
- `message_update`: append assistant text deltas.
- `message_end`: finalize assistant text and surface assistant error/aborted messages.
- `tool_execution_start`: create an active tool card.
- `tool_execution_update`: update a tool card with partial result text when available.
- `tool_execution_end`: mark the tool card ok/error and attach a compact result summary.
- `agent_end`: mark the run as idle and sync final message count.

The reducer should be tolerant of partial or out-of-order event details. It should prefer
stable display over complete raw event dumps. Raw JSON appears only in truncated detail text
when no better summary is available.

## Todo Panel

The existing `todo_write` tool returns structured details:

```ts
{ todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }> }
```

The TUI will extract that shape from `tool_execution_end.result.details.todos`. The latest
todo list drives a panel with counts and rows:

- completed: dim check mark.
- in progress: highlighted progress marker.
- pending: dim open marker.

The panel hides when there are no todos or when the most recent list is fully completed and
the agent is idle. Tool cards for `todo_write` summarize current work instead of dumping the
full JSON payload.

## File Structure

New TUI files:

- `src/cli/tui/index.ts`: public `runTuiConversation()` entrypoint.
- `src/cli/tui/app.tsx`: top-level Ink component composition.
- `src/cli/tui/agent-loop.ts`: imperative bridge between Ink UI callbacks and `Agent`.
- `src/cli/tui/view-state.ts`: reducer, event types, and selectors for messages, tools, todos,
  streaming state, and steering queue rows.
- `src/cli/tui/command-registry.ts`: built-in/plugin slash command normalization, filtering,
  help formatting, and prompt/steer submission building.
- `src/cli/tui/input-editor.ts`: pure cursor and editing operations.
- `src/cli/tui/input-history.ts`: bounded on-disk or in-memory input history helpers.
- `src/cli/tui/message-format.ts`: compact summaries for tool calls/results and plain fallback
  transcript text.
- `src/cli/tui/theme.ts`: restrained color and symbol choices.
- `src/cli/tui/components/header.tsx`
- `src/cli/tui/components/footer.tsx`
- `src/cli/tui/components/input-box.tsx`
- `src/cli/tui/components/command-list.tsx`
- `src/cli/tui/components/message-history.tsx`
- `src/cli/tui/components/streaming-indicator.tsx`
- `src/cli/tui/components/todo-panel.tsx`

Existing files to modify:

- `package.json` and `package-lock.json`: add `ink`, `react`, and matching React types.
- `tsconfig.json`: support TSX compilation for the new TUI files.
- `src/index.ts`: choose TUI for interactive TTY sessions; keep `--print` and non-TTY text paths.
- `src/cli/conversation.ts`: remain available as the plain fallback loop.
- `src/cli/ui.ts`: keep plain help/session/welcome renderers for `--print`, fallback, and tests.
- `docs/architecture.md`: update target layout and framework note after implementation.

Tests should mirror this layout under `test/cli/tui/`.

## Runtime Flow

Interactive TTY flow:

1. `src/index.ts` builds the model, tools, plugin runtime, session store, agent, and session
   metadata exactly as it does today.
2. `src/index.ts` calls `runTuiConversation()` with the agent, session metadata, save hook,
   help/session render functions, slash commands, and optional first prompt.
3. `runTuiConversation()` renders the Ink app.
4. The TUI bridge subscribes to agent events and dispatches them to `view-state`.
5. Idle input calls `agent.prompt(text)` and saves the session after the run settles.
6. Streaming input calls `agent.steer(userMessage)` and records the steering row immediately.
7. Abort calls `agent.abort()`.
8. Exit unmounts Ink and closes the session cleanly.

Plain mode flow:

- `--print` continues to call `runStreamingPrompt()` and emits plain text.
- Non-TTY interactive fallback continues to use `runMultiTurnConversation()`.

## Error Handling

- If Ink rendering fails during startup, fall back to the plain conversation loop and show a
  concise warning.
- If an agent run emits an assistant error message, render it as an assistant error row.
- If `agent.prompt()` rejects unexpectedly, render an error row and keep the TUI alive.
- If `agent.steer()` is called while idle due to a race, treat the input as a normal prompt.
- If command history cannot be written, keep in-memory history for that session and show no
  blocking error.
- Truncate long tool args/results with a visible truncation marker.

## Testing

Use test-first implementation for behavior changes.

Pure unit tests:

- command registry filters built-ins and plugin commands by name/description.
- command registry resolves built-ins, plugin prompts, unknown commands, and help text.
- input editor inserts text, deletes text, moves by character, and moves by word.
- input history bounds entries and avoids duplicate consecutive saves.
- view-state reducer handles text deltas, tool start/end, assistant errors, agent idle state,
  and steering rows.
- todo extraction reads `tool_execution_end.result.details.todos` and updates counts.
- message formatting summarizes known tools and truncates unknown raw details.

Integration tests:

- `src/index.ts` chooses TUI only for interactive TTY and keeps `--print` on the plain renderer.
- submitted idle input calls `agent.prompt()` once and triggers session save after completion.
- submitted streaming input calls `agent.steer()` and does not call `agent.prompt()`.
- plugin slash commands become prompts when idle and steering messages when streaming.

Final verification:

- `bun run test`
- `bun run typecheck`

## Acceptance Criteria

- Running `bun run dev -- [options]` in an interactive terminal opens the Ink TUI instead of
  the old `pi >` readline prompt.
- Running `bun run dev -- --print "hello"` remains plain text and does not initialize Ink.
- The visible TUI includes header, message history, command picker, input box, streaming
  indicator, todo panel, and footer.
- Tool calls and results are visible as compact structured rows.
- The current todo list is visible while work is active.
- Slash commands are discoverable through the picker and preserve existing plugin command
  behavior.
- Input submitted during an active run uses `Agent.steer()` and is shown as queued steering.
- `Escape` or `Ctrl-C` aborts an active run without exiting the whole process.
- Tests and typecheck pass.
