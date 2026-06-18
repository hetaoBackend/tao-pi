# Workspace Tool Pack Design

## Context

The active goal is to evolve TaoPi into a capable general-purpose agent by using the latest Claude Code surface as a reference point. Claude Code 2.1.179 exposes a practical local work loop through file inspection, precise editing, shell execution, web lookup, and explicit verification habits.

This repository currently has session persistence, streaming CLI output, `read_file`, `write_file`, `web_search`, and `web_fetch`. The first approved slice adds the missing local workspace loop: inspect, edit, and verify.

This local loop is part of the base agent, not an optional plugin. Project instruction files such as `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` are loaded directly into the prompt instead of exposed through a tool. `todo`, `memory`, and `skills` are the initial optional plugins; plugin capabilities may include tools, prompt guidance, and interactive slash commands. The skills plugin discovers `~/.tao/skills` and project `.tao/skills` by default; later roots override earlier same-name skills. Discovered skills are advertised directly in prompt guidance; `skill_read` loads one full `SKILL.md` when a skill applies. Task runners and subagents are intentionally out of scope for now.

## Scope

Add these base agent capabilities:

- project context injection: load workspace instruction files such as `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` into the system prompt when present.
- `list_files`: list files under the configured workspace root while skipping common generated/runtime directories and files, with optional glob-style pattern filtering.
- `file_info`: inspect file or directory metadata, including file size, modified time, direct directory entry count, and binary detection for files.
- `search_files`: search UTF-8 text files under the workspace root using literal or regex matching, optional case-insensitive matching, and optional surrounding context.
- `read_file`: read bounded line ranges with optional line numbers for location-aware inspection.
- `edit_file`: replace exactly one `old_text` occurrence in a UTF-8 file with `new_text`; reject missing or ambiguous matches.
- `multi_edit_file`: apply ordered exact text replacements in one UTF-8 file atomically after the file has been read.
- `bash`: run a Bash command inside the workspace root or a requested workspace subdirectory via `cwd`, returning exit code, capped stdout/stderr, truncation metadata, git optional-lock metadata, and timeout state.

Update the agent prompt and CLI text so the model knows to use a careful work loop: prefer dedicated file/search tools over shell commands when they fit, search/read first when local context matters, cite code as `file_path:line_number`, prefer precise edits, run relevant verification commands after changes, and report failures honestly.

## Architecture

Keep responsibilities in the existing source layout:

- `src/agent/project-context.ts` loads and formats project instruction files for direct prompt injection.
- `src/tools/file-tools.ts` remains the workspace file adapter and grows the listing, search, and precise edit tools.
- `src/tools/command-tools.ts` becomes the shell execution adapter.
- `src/index.ts` wires command tools beside file and Firecrawl tools without taking on tool logic.
- `src/agent/system-prompt.ts` owns the new general-purpose agent guidance and software-work habits.
- `src/cli/ui.ts` owns visible tool names in welcome/session/help text.

Tool adapters keep workspace path containment local. They should return compact text content for model consumption plus structured `details` for tests and future UI.

## Error Handling

- All workspace paths must resolve inside the configured root.
- Missing workspace paths return a concise workspace-relative `Path not found` error.
- Empty paths, search queries, and commands are rejected.
- `read_file` rejects directories; use `list_files` or `file_info` instead.
- `read_file` rejects binary files; use `file_info` to inspect their metadata instead.
- `edit_file` rejects missing `old_text`, multiple matches, and replacements whose `old_text` was not returned by an earlier `read_file` call.
- `write_file` creates new files directly but rejects overwriting an existing file until it has been read in the current tool runtime.
- `bash` verifies `cwd` points at an existing workspace directory, enforces a timeout, caps stdout/stderr per stream, disables optional locks for read-only git commands, and returns partial output when a process is killed.
- Tool output should be concise enough for terminal streaming and model context.

## Testing

Tests cover:

- `list_files` skips generated/runtime files, returns stable relative paths, supports `pattern` filters such as `**/*.ts`, and applies `max_results` after filtering.
- `file_info` reports file and directory metadata, detects binary files, and rejects paths outside the workspace root.
- `file_info`, `list_files`, and `search_files` report missing paths without leaking absolute runtime paths.
- project context loading returns formatted project instruction files for prompt injection and returns an empty list when none are present.
- `search_files` returns matching `path:line` entries, supports literal/regex and case-sensitive/case-insensitive matching, can include surrounding lines on request, rejects invalid regex queries, and ignores binary/generated files.
- `read_file` can display line numbers without changing the raw text tracked for later edit validation.
- `read_file` rejects directories and missing paths with clear errors.
- `read_file` rejects binary files with a clear error instead of returning decoded binary noise.
- `edit_file` performs one exact replacement and rejects missing or ambiguous replacements.
- `multi_edit_file` applies multiple exact replacements after `read_file` and leaves the file unchanged if any replacement is invalid.
- `write_file` rejects existing-file overwrites unless `overwrite` is explicit and the file has been read first.
- `bash` captures success, failure, timeout behavior, read-only git optional-lock handling, and long-output truncation.
- System prompt and CLI UI mention the new tools and verification loop.

Final verification for this slice is:

- `bun run test`
- `bun run typecheck`
