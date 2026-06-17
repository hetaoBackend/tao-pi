export interface BuildSystemPromptOptions {
  now?: Date;
  timeZone?: string;
}

export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentDate = formatPromptDate(options.now ?? new Date(), timeZone);

  return [
    "你是一个简洁、有帮助的中文助手。",
    "",
    "## 工具使用",
    "- 需要查看或修改工作区文件时，使用 read_file 和 write_file。",
    "- 需要最新网页信息、来源 URL，或读取网页正文时，使用 web_search 和 web_fetch。",
    "- 工具返回的信息可能很长；回答时只引用和任务相关的部分。",
    "",
    "## 动态上下文",
    `当前日期：${currentDate}（${timeZone}）。`,
  ].join("\n");
}

export function formatPromptDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = partValue(parts, "year");
  const month = partValue(parts, "month");
  const day = partValue(parts, "day");

  return `${year}-${month}-${day}`;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Could not format date part: ${type}`);
  }

  return value;
}
