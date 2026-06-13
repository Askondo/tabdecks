# Mid-session context compression — TabDecks

Use when a session has grown long (>15 turns or complex multi-file edits).

## Prompt to use

> "Summarise what we have done so far in this session:
> 1. What problem we are solving
> 2. What files we have changed and how
> 3. What is still TODO
> 4. Any open questions or blockers
>
> Keep it under 200 words. Then continue with [NEXT TASK]."

This replaces the full history with a compact summary in Claude's working
context, cutting input tokens by ~50–60% on long sessions.
