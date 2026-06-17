# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root, if it exists
- `CONTEXT-MAP.md` at the repo root, if it exists
- `docs/adr/`, if it exists

If these files do not exist, proceed silently. Producer workflows can create them later when domain terms or decisions become stable enough to record.

## File structure

This repo currently uses the single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. If the concept is missing, either reconsider the wording or note the gap for a later domain-doc pass.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
