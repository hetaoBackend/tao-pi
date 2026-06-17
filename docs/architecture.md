# Architecture Notes

## Current shape

The project is a small TypeScript CLI with four main runtime responsibilities:

- `agent`: model selection, system prompt construction, context transforms, and streamed event rendering
- `cli`: argument parsing, terminal text, slash commands, and the interactive loop
- `tools`: agent tool adapters for workspace files and Firecrawl
- `persistence`: SQLite-backed session storage

`src/index.ts` is the composition root. It should stay as the place where these modules are wired together.

## Target source layout

```text
src/
├── index.ts
├── agent/
│   ├── context-transform.ts
│   ├── model-config.ts
│   ├── streaming-prompt.ts
│   └── system-prompt.ts
├── cli/
│   ├── args.ts
│   ├── conversation.ts
│   └── ui.ts
├── persistence/
│   └── session-store.ts
└── tools/
    ├── file-tools.ts
    └── firecrawl-tools.ts
```

## Deepening candidates

### 1. Runtime bootstrap module

`src/index.ts` still knows how to read every environment variable, resolve model settings, open sessions, assemble tools, and construct the agent. That module is shallower than it should become.

Deepen it later by introducing a runtime bootstrap module with one interface that returns the configured agent, session metadata, and save hook. This would concentrate configuration and startup tests in one place.

### 2. Tool registry module

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
