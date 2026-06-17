export interface InputHistoryOptions {
  initialEntries?: string[];
  maxEntries: number;
}

export interface InputHistory {
  save(input: string): void;
  previous(): string;
  next(): string;
  entries(): string[];
}

export function createInputHistory(options: InputHistoryOptions): InputHistory {
  let entries = [...(options.initialEntries ?? [])].slice(-options.maxEntries);
  let browseIndex: number | null = null;

  return {
    save(input: string) {
      const trimmed = input.trim();
      browseIndex = null;
      if (!trimmed) {
        return;
      }
      if (entries[entries.length - 1] === trimmed) {
        return;
      }
      entries = [...entries, trimmed].slice(-options.maxEntries);
    },
    previous() {
      if (entries.length === 0) {
        return "";
      }
      browseIndex = browseIndex === null ? entries.length - 1 : Math.max(0, browseIndex - 1);
      return entries[browseIndex] ?? "";
    },
    next() {
      if (browseIndex === null) {
        return "";
      }
      browseIndex += 1;
      if (browseIndex >= entries.length) {
        browseIndex = null;
        return "";
      }
      return entries[browseIndex] ?? "";
    },
    entries() {
      return [...entries];
    },
  };
}
