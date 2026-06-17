# Architecture Notes

## Current shape

The project is a small TypeScript general-purpose agent CLI with five main runtime responsibilities:

- `agent`: model selection, system prompt construction, context transforms, and streamed event rendering
- `cli`: argument parsing, terminal text, slash commands, and the interactive loop
- `tools`: core agent tool adapters for workspace files, local commands, and Firecrawl
- `plugins`: optional non-core capabilities that can contribute tools and system-prompt guidance
- `persistence`: SQLite-backed session storage

`src/index.ts` is the composition root. It should stay as the place where these modules are wired together.

The minimal base agent includes the core local loop directly, not as plugins:

- workspace context loading from `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md`, injected directly into the system prompt when present
- workspace file listing, metadata inspection, search, paged read, precise edit, multi-edit, and write tools; `list_files` supports optional glob-style `pattern` filtering; `file_info` reports file/directory metadata including binary detection for files; `search_files` supports literal or regex matching, optional case-insensitive search, and `context_lines` for nearby matches; `read_file` returns up to 200 lines from text files by default, rejects directories and binary files, and supports `start_line`/`max_lines` plus optional `show_line_numbers` for location-aware inspection; `edit_file` and `multi_edit_file` require the target and replacement text to have appeared in raw `read_file` output in the current tool runtime before they can modify the file; `write_file` creates new files directly but requires `read_file` before overwriting an existing file
- Bash command execution through `bash`; commands can run from a workspace subdirectory through `cwd`, stdout and stderr are capped per stream by default and can be adjusted with `max_output_chars`, and read-only git commands run with optional locks disabled
- Firecrawl-backed web search and fetch tools

The prompt should keep the model on that local loop: prefer dedicated file and search tools over shell commands when they fit, and report code locations as `file_path:line_number` so terminal renderers can make them clickable.

Non-core features should be added as plugins first. A plugin has an id, optional tools, optional prompt guidance, and optional interactive slash commands. For now, the only default plugins are `todo`, `memory`, and `skills`; do not add task runners or subagents yet. The runtime loads configured plugins through `PI_PLUGINS`, defaults to `todo,memory,skills`, and accepts `PI_PLUGINS=none` when a minimal core toolset is desired. The memory plugin stores file-backed memories under `PI_MEMORY_DIR`, defaulting to `.pi-memory` in the workspace, loads `MEMORY.md` into prompt guidance when present, and intentionally exposes no memory-specific tools; the agent uses the ordinary file tools to inspect or edit memory files. The skills plugin discovers local `SKILL.md` files from `~/.tao/skills` and the workspace `.tao/skills` directory by default, can be pointed at additional roots through `PI_SKILLS_DIRS`, lets later roots override earlier same-name skills, advertises discovered skills directly in prompt guidance, exposes `skill_read` for loading a specific full `SKILL.md`, and contributes `/<skill-name>` slash commands so the user can explicitly invoke a skill while the agent still reads the full `SKILL.md` before following it.

## Target source layout

```text
src/
├── index.ts
├── agent/
│   ├── context-transform.ts
│   ├── model-config.ts
│   ├── project-context.ts
│   ├── streaming-prompt.ts
│   └── system-prompt.ts
├── cli/
│   ├── args.ts
│   ├── conversation.ts
│   └── ui.ts
├── persistence/
│   └── session-store.ts
├── plugins/
│   ├── default-plugins.ts
│   ├── memory-plugin.ts
│   ├── plugin-registry.ts
│   ├── skills-plugin.ts
│   └── todo-plugin.ts
└── tools/
    ├── command-tools.ts
    ├── file-tools.ts
    ├── firecrawl-tools.ts
    └── todo-tools.ts
```

## Deepening candidates

### 1. Runtime bootstrap module

`src/index.ts` still knows how to read every environment variable, resolve model settings, open sessions, assemble tools, and construct the agent. That module is shallower than it should become.

Deepen it later by introducing a runtime bootstrap module with one interface that returns the configured agent, session metadata, and save hook. This would concentrate configuration and startup tests in one place.

### 2. Core tool registry module

`src/tools/` contains separate adapters, but tool assembly still happens in `src/index.ts`.

Deepen it later with a `createAgentTools` module that hides adapter ordering, optional Firecrawl configuration, and display names behind one interface.

### 3. Session lifecycle module

`SqliteSessionStore` is a good persistence adapter, but resume/create/save decisions are currently spread through startup code.

Deepen it later by concentrating "load latest, load explicit, or create fresh" behind one session lifecycle interface. Tests would then exercise session selection without constructing the full CLI.

## What not to do yet

- Do not introduce interfaces for only one adapter.
- Do not move environment parsing into many small files.
- Do not split tool formatting helpers out of their adapters unless another adapter reuses them.
- Do not add a framework. The current direct TypeScript modules are enough.
