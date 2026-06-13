# Session end ritual — TabDecks

At the end of every session, do the following.

## 1. Write a session note

Create `.claude/memory/sessions/YYYY-MM-DD-topic-slug.md` (topic = 2–4 word kebab-case summary of the session's main task, e.g. `2026-06-14-keylock-wsola`). Always create a new file per session — never append to an existing note.

```
---
changed: <one-line summary of what changed, e.g. "feat(eq): per-band kill switches">
new_messages: []
new_config: []
stale_memory: []
---
```

## 2. Update memory files for any changed module

- If a module's public API changed → update its `modules/*.md`
- If a new message type was added to `src/messaging/protocol.ts` → update
  `docs/api/messaging.md` (the canonical messaging reference per CLAUDE.md) AND
  any `domain/*.md` memory file describing the affected flow
- If a new audio graph node or DSP param was added → update the relevant
  `modules/*.md` AND `domain/audio_graph.md`
- If a new settings schema field was added → update `modules/settings.md`

## 3. Update docs/architecture.md if necessary

Check whether any of the following changed this session:

| Change | Section to update |
|---|---|
| New or removed entrypoint (`src/entrypoints/*`) | §Extension contexts (Mermaid diagram) |
| New or removed message type in `src/messaging/protocol.ts` | §Message protocol |
| New/changed capture handshake step | §Capture handshake (Mermaid diagram) |
| New audio node or graph topology change | §Audio graph (per deck → master) (Mermaid diagram) |
| New worklet command/param | §Transport worklet port protocol |
| New invariant or guard added to the engine | §Stability invariants |

If none of the above changed, skip this step.

## 4. Flag stale entries

Add `[STALE — YYYY-MM-DD]` marker to any memory file entry that is now out of date.
Update `index.md` if files were added or removed.
