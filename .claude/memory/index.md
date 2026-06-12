# TabDecks Memory Index

First read at session start. One line per memory file; details live in the files.

## Modules (`modules/`)

_(none yet — add one file per src module as it stabilizes: public API, state, quirks)_

## Domain (`domain/`)

_(none yet — cross-cutting concepts: capture handshake, transport modes, FX contract)_

## Sessions (`sessions/`)

- [2026-06-13](sessions/2026-06-13.md) — initial build, all phases; biquad-Q-in-dB gotcha; node-web-audio-api render tests

## Conventions

- `feedback_*` memories about the Chrome/Web Audio platform itself go to the global
  auto-memory folder, not here. This folder is for TabDecks-specific knowledge.
- Mark stale entries `[STALE YYYY-MM-DD]` with a superseded-by note instead of deleting.
