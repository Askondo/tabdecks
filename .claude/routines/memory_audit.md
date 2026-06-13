# Memory system audit — TabDecks

Run when: major feature merged · memory files feel stale · unexpected hallucination · monthly.

## Step 1 — Staleness check

Prompt Claude:

> "Read the following files and check each memory file in
> `.claude/memory/modules/` and `.claude/memory/domain/` against the actual
> source code in `src/`.
>
> For each memory file:
> - Quote the claim in the memory file
> - Quote the corresponding line(s) in the source file
> - Mark as CURRENT, STALE, or MISSING
>
> Do not update yet. Only produce the audit table."

## Step 2 — Prioritised update

> "Update only the STALE files. For each update:
> - Remove the outdated claim
> - Insert the correct claim quoted directly from source
> - Add a `[verified YYYY-MM-DD]` tag to each updated entry"

## Step 3 — Trim bloat

> "Review `.claude/memory/index.md` and each memory file. Identify:
> - Entries that duplicate what is already in CLAUDE.md (remove from memory)
> - Entries not referenced in the last 3 session notes (flag for removal)
> - Files that could be merged without losing information (propose merge)
>
> Do not execute — just produce the trim proposal."

## Step 4 — Audit docs/architecture.md

Prompt Claude:

> "Read `docs/architecture.md` and compare each section against the actual
> source files:
> - §Extension contexts vs `src/entrypoints/*` (REMOVED/MISSING/STALE)
> - §Capture handshake vs `src/audio/capture.ts` + `src/messaging/protocol.ts`
> - §Audio graph (per deck → master) vs `src/audio/deck.ts`, `eq.ts`,
>   `crossfader.ts`, `master.ts`
> - §Transport worklet port protocol vs `src/entrypoints/transport-worklet.ts`
>   + `src/audio/transport.ts`
> - §Message protocol vs `src/messaging/protocol.ts`
> - §Stability invariants vs the guard logic in `src/audio/engine.ts`
>
> For each section, list anything REMOVED, MISSING, or STALE.
>
> Do not update yet. Produce the audit table only."

Then update only the STALE/MISSING/REMOVED entries, keeping the three Mermaid
diagrams (Extension contexts, Capture handshake, Audio graph) syntactically valid.

## Step 5 — Commit

```bash
git add .claude/memory/ docs/architecture.md
git commit -m "chore(repo): memory audit YYYY-MM-DD — staleness pass"
```

## Audit frequency heuristic

| Situation | Action |
|---|---|
| Single small bugfix | Update one module file only |
| New feature (new src module) | Add module file + update index |
| Refactor touching 3+ files | Full audit |
| Hallucination on a verified fact | Immediate audit of relevant memory file |
| Monthly | Full audit |
