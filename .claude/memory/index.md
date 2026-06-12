# TabDecks Memory Index

First read at session start. One line per memory file; details live in the files.

## Modules (`modules/`)

_(none yet — add one file per src module as it stabilizes: public API, state, quirks)_

## Domain (`domain/`)

_(none yet — cross-cutting concepts: capture handshake, transport modes, FX contract)_

## Sessions (`sessions/`)

_(YYYY-MM-DD.md logs, most recent first; frontmatter: changed, new_messages, new_config)_

## Conventions

- `feedback_*` memories about the Chrome/Web Audio platform itself go to the global
  auto-memory folder, not here. This folder is for TabDecks-specific knowledge.
- Mark stale entries `[STALE YYYY-MM-DD]` with a superseded-by note instead of deleting.
