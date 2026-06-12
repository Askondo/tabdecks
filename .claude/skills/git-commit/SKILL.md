---
name: git-commit
description: Create conventional commits. Use for any commit task.
allowed-tools: Bash(git *)
---

# git-commit

Creates a conventional commit using a single script call.

## Dynamic Context

Inject before committing:
- Current changes: `!`git diff HEAD --stat``
- Current branch: `!`git branch --show-current``

## Usage

```bash
scripts/commit.sh "feat: add user authentication"
```

## Conventional Format

```
<type>(<optional scope>): <subject>
```

Types: `feat` | `fix` | `docs` | `refactor` | `chore` | `test` | `style` | `perf`

- Subject < 72 characters
- Lowercase, imperative mood ("add" not "added")
- No trailing period
- No co-authorship footer

## Rules

- Always use this skill — never raw `git commit`
- Only commit when explicitly asked by the user
- Stage specific files by name, not `git add -A`, unless intentional
- If pre-commit hook fails: fix the issue, then create a NEW commit (never `--amend`)
