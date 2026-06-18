import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";
import {
  filterTuiCommands,
  getSlashCommandQuery,
  type TuiCommand,
} from "../command-registry.js";
import { createInputHistory } from "../input-history.js";
import {
  insertTextAtCursor,
  moveCursorLeft,
  moveCursorRight,
  moveCursorWordLeft,
  moveCursorWordRight,
  removeCharacterBeforeCursor,
  type InputEditorState,
} from "../input-editor.js";
import { tuiTheme } from "../theme.js";
import { isSgrMouseInput } from "../mouse.js";
import { CommandList } from "./command-list.js";

export interface InputBoxProps {
  commands: readonly TuiCommand[];
  streaming: boolean;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  onToggleToolResults: () => void;
}

export interface InputTextSegments {
  before: string;
  after: string;
}

export const INPUT_CURSOR = "|";

export function InputBox({ commands, streaming, onSubmit, onAbort, onToggleToolResults }: InputBoxProps) {
  const [editor, setEditor] = useState<InputEditorState>({ text: "", cursorOffset: 0 });
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history] = useState(() => createInputHistory({ maxEntries: 100 }));
  const slashQuery = getSlashCommandQuery(editor.text);
  const pickerOpen = slashQuery !== null && dismissedQuery !== slashQuery;
  const filteredCommands = useMemo(
    () => (slashQuery === null ? [] : filterTuiCommands(commands, slashQuery)),
    [commands, slashQuery],
  );

  const updateEditor = (next: InputEditorState) => {
    setEditor(next);
    if (getSlashCommandQuery(next.text) !== dismissedQuery) {
      setDismissedQuery(null);
    }
  };

  useInput((input, key) => {
    if (isMouseInput(input)) {
      return;
    }

    if (key.ctrl && input === "c") {
      onAbort();
      return;
    }

    if (isToggleToolResultsInput(input, key)) {
      onToggleToolResults();
      return;
    }

    if (pickerOpen && key.escape) {
      setDismissedQuery(slashQuery);
      return;
    }

    if (key.escape) {
      onAbort();
      return;
    }

    if (pickerOpen && key.upArrow && filteredCommands.length > 0) {
      setSelectedIndex((index) => (index > 0 ? index - 1 : filteredCommands.length - 1));
      return;
    }

    if (pickerOpen && key.downArrow && filteredCommands.length > 0) {
      setSelectedIndex((index) => (index < filteredCommands.length - 1 ? index + 1 : 0));
      return;
    }

    if (pickerOpen && (key.return || key.tab) && filteredCommands[selectedIndex]) {
      const commandText = `/${filteredCommands[selectedIndex].name} `;
      updateEditor({ text: commandText, cursorOffset: commandText.length });
      setSelectedIndex(0);
      return;
    }

    if (key.return) {
      const text = editor.text.trim();
      if (!text) {
        return;
      }
      history.save(text);
      onSubmit(text);
      setEditor({ text: "", cursorOffset: 0 });
      setSelectedIndex(0);
      setDismissedQuery(null);
      return;
    }

    if (!pickerOpen && editor.text === "" && key.upArrow) {
      const previous = history.previous();
      setEditor({ text: previous, cursorOffset: previous.length });
      return;
    }

    if (!pickerOpen && key.downArrow) {
      const next = history.next();
      setEditor({ text: next, cursorOffset: next.length });
      return;
    }

    if (key.leftArrow || (key.meta && input === "b")) {
      updateEditor(key.meta ? moveCursorWordLeft(editor) : moveCursorLeft(editor));
      return;
    }

    if (key.rightArrow || (key.meta && input === "f")) {
      updateEditor(key.meta ? moveCursorWordRight(editor) : moveCursorRight(editor));
      return;
    }

    if (key.backspace || key.delete) {
      updateEditor(removeCharacterBeforeCursor(editor));
      return;
    }

    if (key.upArrow || key.downArrow || key.tab) {
      return;
    }

    updateEditor(insertTextAtCursor(editor, input));
  });

  const placeholder = streaming ? "steer current run" : "ask TaoPi";

  return (
    <Box flexDirection="column">
      {pickerOpen ? <CommandList commands={filteredCommands} selectedIndex={selectedIndex} /> : null}
      <Box borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1} columnGap={1}>
        <Text color={streaming ? tuiTheme.colors.warning : tuiTheme.colors.primary}>{tuiTheme.symbols.prompt}</Text>
        <InputText editor={editor} placeholder={placeholder} />
      </Box>
    </Box>
  );
}

function InputText({ editor, placeholder }: { editor: InputEditorState; placeholder: string }) {
  const segments = getInputTextSegments(editor.text, editor.cursorOffset);

  if (!editor.text) {
    return (
      <Box>
        <Text color={tuiTheme.colors.primary}>{INPUT_CURSOR}</Text>
        <Text color={tuiTheme.colors.dim}>{placeholder}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>{segments.before}</Text>
      <Text color={tuiTheme.colors.primary}>{INPUT_CURSOR}</Text>
      <Text>{segments.after}</Text>
    </Box>
  );
}

export function isToggleToolResultsInput(input: string, key: { ctrl?: boolean }): boolean {
  return Boolean(key.ctrl && input === "o");
}

export function isMouseInput(input: string): boolean {
  return isSgrMouseInput(input);
}

export function getInputTextSegments(text: string, cursorOffset: number): InputTextSegments {
  const safeOffset = Math.max(0, Math.min(cursorOffset, text.length));

  return {
    before: text.slice(0, safeOffset),
    after: text.slice(safeOffset),
  };
}
