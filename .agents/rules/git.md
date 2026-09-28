---
description: Git commits and PR conventions
alwaysApply: true
---

# Git

Project uses **Conventional Commits** via commitlint (`commitlint.config.mjs`).

## Commit messages

Format: `type(scope): subject`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

```text
// ❌ BAD
fixed stuff
WIP
update

// ✅ GOOD
feat(users): add create user endpoint
fix(prisma): handle duplicate email on create
chore(deps): bump @nestjs/common to 11.0.2
```

- Subject: imperative, lowercase, no trailing period, max ~72 chars
- Body: explain **why**, not what the diff already shows
- Never add Cursor co-author trailers (`Co-authored-by: Cursor`, `Made with Cursor`)

## When to commit

- Commit only when the user explicitly asks
- Do not commit `.env`, credentials, or `src/generated/**` changes alone without schema update intent
- Do not push unless explicitly asked
- Do not use `--no-verify`, `--force`, or amend unless user requests and conditions allow

## Pull requests

When asked to open a PR:

1. Summarize all commits on the branch, not just the latest
2. Include **Summary** (1–3 bullets) and **Test plan** checklist
3. Use `gh pr create`; return the PR URL

## Branch workflow

- Default branch on remote: `main`
- Current dev branch may be `dev` — do not force-push to `main`
