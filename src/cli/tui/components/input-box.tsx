import { Box, Text, useBoxMetrics, useCursor, useInput } from "ink";
import { useMemo, useRef, useState } from "react";
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

export interface LayoutPosition {
  left: number;
  top: number;
}

export interface TerminalCursorPosition {
  x: number;
  y: number;
}

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
  const inputRef = useRef(null);
  const metrics = useBoxMetrics(inputRef);
  const { setCursorPosition } = useCursor();

  if (metrics.hasMeasured) {
    setCursorPosition(getInputCursorPosition(getAbsoluteLayoutPosition(inputRef.current), editor.text, editor.cursorOffset));
  }

  return (
    <Box flexDirection="column">
      {pickerOpen ? <CommandList commands={filteredCommands} selectedIndex={selectedIndex} /> : null}
      <Box ref={inputRef} borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1} columnGap={1}>
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
        <Text> </Text>
        <Text color={tuiTheme.colors.dim}>{placeholder}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>{segments.before}</Text>
      <Text>{segments.after}</Text>
    </Box>
  );
}

export function isToggleToolResultsInput(input: string, key: { ctrl?: boolean }): boolean {
  return Boolean(key.ctrl && input === "o");
}

export function getInputTextSegments(text: string, cursorOffset: number): InputTextSegments {
  const safeOffset = Math.max(0, Math.min(cursorOffset, text.length));

  return {
    before: text.slice(0, safeOffset),
    after: text.slice(safeOffset),
  };
}

export function getInputCursorPosition(
  inputBoxPosition: LayoutPosition,
  text: string,
  cursorOffset: number,
): TerminalCursorPosition {
  const beforeText = text.slice(0, Math.max(0, Math.min(cursorOffset, text.length)));
  return {
    x: inputBoxPosition.left + 4 + stringWidth(beforeText),
    y: inputBoxPosition.top + 1,
  };
}

export function getAbsoluteLayoutPosition(node: unknown): LayoutPosition {
  let left = 0;
  let top = 0;
  let current = node;

  while (isLayoutNode(current)) {
    const layout = current.yogaNode?.getComputedLayout?.();
    left += numberValue(layout?.left);
    top += numberValue(layout?.top);
    current = current.parentNode;
  }

  return { left, top };
}

/**
 * Calculate the display width of a string in terminal columns.
 * CJK characters and fullwidth forms occupy 2 columns.
 */
function stringWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // CJK Unified Ideographs, Hangul, Japanese, fullwidth forms, etc.
    if (
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK radicals, Hiragana, Katakana, Bopomofo, etc.
      (code >= 0xa960 && code <= 0xa97f) || // Hangul Jamo Extended-A
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0xd7b0 && code <= 0xd7ff) || // Hangul Jamo Extended-B
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
      (code >= 0xfe10 && code <= 0xfe19) || // Vertical forms
      (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
      (code >= 0xff00 && code <= 0xff60) || // Fullwidth ASCII variants
      (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth symbol variants
      (code >= 0x1f300 && code <= 0x1f64f) || // Emojis
      (code >= 0x1f900 && code <= 0x1f9ff) // Supplemental Symbols and Pictographs
    ) {
      width += 2;
    } else if (code >= 0x300 && code <= 0x36f) {
      // Combining marks: zero width
    } else {
      width += 1;
    }
  }
  return width;
}

interface LayoutNodeLike {
  parentNode?: unknown;
  yogaNode?: {
    getComputedLayout?: () => { left?: unknown; top?: unknown };
  };
}

function isLayoutNode(value: unknown): value is LayoutNodeLike {
  return Boolean(value && typeof value === "object" && ("parentNode" in value || "yogaNode" in value));
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
