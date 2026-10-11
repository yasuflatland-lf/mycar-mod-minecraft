@AGENTS.md

## Claude Code

- [AGENTS.md](AGENTS.md) is the single source of truth for every agent. Put shared rules there, not here. This file holds only what is specific to Claude Code.
- A `PostToolUse` hook in `.claude/settings.json` runs `scripts/check-language.mjs` on every file you edit or write inside the repository (ignored files are skipped). The edit has already been applied when it runs; if it reports lines, rewrite them in English right away instead of working around the check.
- A `PreToolUse` hook runs the same script with `--pr-hook` before every Bash command and blocks `gh pr create` or `gh pr edit` when the title or body (inline or from `--body-file`) contains Japanese or other CJK text. Write the title and body in English and retry.
- Personal overrides go in `.claude/settings.local.json` or `CLAUDE.local.md`. Both are untracked.
