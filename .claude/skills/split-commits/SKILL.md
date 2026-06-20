---
name: split-commits
description: Reorganize quicksave WIP commits into intentional, CI-safe, well-segregated commits. Use when the user wants to clean up a series of "wip unstable" commits before pushing, or to split a large uncommitted diff into proper commits.
argument-hint: "[dry-run|apply] [base-ref]"
disable-model-invocation: true
allowed-tools:
  - Bash(git status *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git branch *)
  - Bash(git rev-parse *)
  - Bash(git add *)
  - Bash(git reset *)
  - Bash(git restore *)
  - Bash(git commit *)
  - Bash(git show *)
  - Bash(git ls-files *)
  - Bash(git stash *)
  - Bash(bun *)
---

## Project context (IEFA monorepo)

CI command: `bun run ci` (runs lint + typecheck via turbo)
Full check: `bun run check` (biome check + typecheck)
Format check: `bun run format:check`
Quicksave pattern: `chore(root): wip unstable` — these are intentional placeholders, not real commits

Apps and their canonical scopes:
- `apps/sisub` → scope `sisub`
- `apps/portal` → scope `portal`
- `apps/api` → scope `api`
- `apps/alpha` → scope `alpha`
- `apps/docs` → scope `docs`
- `apps/forms` → scope `forms`
- `apps/rumaer` → scope `rumaer`
- `apps/sisub-mcp` → scope `sisub-mcp`
- `packages/database` → scope `database` (NOT `db` — commitlint rejects `db`)
- `.github/`, `docker-bake.hcl`, `Dockerfile`, `fly.toml` → scope `ci`
- `package.json`, `turbo.json`, `bun.lockb`, `biome.json` → scope `deps` or `root`

## Current git state

Recent commits (to identify the last real commit, i.e. the base before quicksaves):

!`git log --oneline -20`

Working tree status:

!`git status --short`

Staged diff:

!`git diff --cached --stat`

Unstaged diff stat:

!`git diff --stat`

Full diff from last non-WIP commit:

!`git log --oneline | grep -v "wip unstable" | head -1 | awk '{print $1}' | xargs -I{} git diff {} --stat 2>/dev/null || git diff HEAD --stat`

## Task

Reorganize the current working tree and/or quicksave commits into small, readable, CI-safe commits with strong segregation of concerns.

### Invocation modes

Parse `$ARGUMENTS`:

- `dry-run` (default if nothing provided): propose the commit plan only. Do not stage, reset, or commit anything.
- `apply`: execute the plan — reset quicksaves, stage by hunk/file, validate, commit.
- A ref like `origin/main` or a SHA: use it as the base to diff against. Otherwise, auto-detect the last non-quicksave commit as base.

**Never infer `apply` from context. Only apply when the argument literally says `apply`.**

### Base ref detection

1. If the user passed an explicit ref, use it.
2. Otherwise, find the last commit whose message does NOT match `wip unstable`:
   ```
   git log --oneline | grep -v "wip unstable" | head -1 | awk '{print $1}'
   ```
3. That SHA is the effective base. All quicksave commits between it and HEAD will be treated as a flat diff to re-partition.

In `apply` mode, before staging anything:
- **Safety first — never lose material.** Confirm none of the commits to be rewritten exist on the upstream (`git log --oneline @{upstream}..HEAD`); if any are already pushed, STOP and tell the user (we do not rewrite shared history).
- **Create a backup ref** at the current HEAD before any reset: `git branch backup/split-commits-<branch>-<n>` (pick an unused name). Report it to the user; recovery is `git reset --hard <backup-ref>`.
- Soft-reset to the base ref to flatten all quicksave commits back into the working tree: `git reset --soft <base>` (keeps every change staged, touches no file — zero loss).
- Verify the working tree is correct with `git status --short` and `git diff --stat <base>`.
- Only ever use `git reset --soft`. Never `git reset --hard` or `git clean` over uncommitted material.

## Commit partitioning rules

Create commits that are independently understandable and independently green in CI. Each commit should belong to exactly one concern boundary.

Prefer these boundaries (order = preferred commit sequence):

1. Dependency/lockfile changes (`deps`): `package.json`, `bun.lockb`, `turbo.json`.
2. DB migrations and generated types (`database`): `packages/database/migrations/`, `packages/database/src/types/`.
3. Config/build/CI (`ci`): `Dockerfile`, `docker-bake.hcl`, `.github/`, `fly.toml`, `biome.json`.
4. Backend/API behavior (`api`, `alpha`, `sisub-mcp`): server logic, routes, workers.
5. Server functions (`sisub`, `portal`): `src/server/*.fn.ts`, `src/routes/*.ts` handlers.
6. UI/client behavior (per-app scope): components, pages, styles.
7. Observability (`sisub`, `portal`, `api`): Faro, OTel, tracing setup.
8. Tests (per-app scope): `*.test.ts`, `*.spec.ts`, `src/test/`.
9. Docs: `*.md`, `apps/docs/`.
10. Mechanical: formatting-only changes, generated files (`routeTree.gen.ts`).

Never mix:
- DB migration + unrelated UI.
- Refactor + behavior change.
- Feature code + broad formatting sweep.
- Config/secrets + application logic.
- Multiple unrelated app scopes in one commit (e.g. sisub UI + portal UI together) unless the change is cross-cutting by necessity (e.g. shared package).

If an intermediate commit would break typecheck or build (e.g. a type in `packages/database` used immediately in `apps/sisub`), merge it with the smallest necessary adjacent commit and explain why.

## CI/CD safety rules

This repo uses Fly.io per-app deploys triggered by paths-filter on push to `main`. A commit that breaks `bun run ci` will fail the deploy pipeline.

Validation tiers:

- `full`: run `bun run ci` (lint + typecheck). Required for any commit touching source files.
- `light`: `bun run format:check` only. Sufficient for docs-only or comments-only commits.
- `deferred`: cannot validate locally (e.g. migration requires live DB). Explain why.

In `apply` mode, for each commit:
1. Stage only the intended files/hunks (`git add -p` or `git add <files>`).
2. Run `git diff --cached --stat` to confirm exactly what is staged.
3. Run the required validation tier.
4. Commit only after validation passes.
5. Run `git status --short` after each commit.

If validation fails:
- Stop immediately. Do not commit.
- Leave the working tree recoverable (no partial commits).
- Report: what failed, which commit was being prepared, what to fix.

**Never amend or force-push already-pushed commits. Never rebase interactively. Never merge to `main` directly — always go through a PR.**

## Finalize via Pull Request (apply mode)

This repo is open-source and eligible for **Greptile** automated code review, which runs on PRs. So every change MUST land through a PR — never commit/merge straight to `main`.

After all commits are created and validated:

1. If currently on `main`, move the new commits to a feature branch before pushing:
   `git branch <type>/<short-slug>` then `git reset --hard origin/main` on `main`... — simpler: create the branch from the current HEAD and check it out (`git switch -c <type>/<short-slug>`), so `main` is untouched. Name it after the dominant concern (e.g. `feat/sisub-observability`).
2. Push the branch: `git push -u origin <branch>`.
3. Open a PR to `main` with `gh pr create --base main` — title in English (Conventional Commits style), body summarizing the commits and the `bun run check` validation.
4. **Do NOT auto-merge.** Leave the PR open so Greptile (and the user) can review. Report the PR URL.
5. Only merge when the user explicitly asks (`gh pr merge <n> --merge`), then sync local `main`.

## Commit message rules

Follow Conventional Commits. Match the scope to the app or concern from the list above.

**Always write commit messages in English** — subject AND body. Never Portuguese, even when the code, comments, or diff are in Portuguese.

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`, `style`

Subject rules:
- English, imperative mood: "add", "fix", "remove", not "added", "fixes".
- Max 72 characters.
- No vague subjects: `update files`, `fix stuff`, `wip`, `misc changes`.
- Describe behavior or intent, not implementation trivia.

Add a body when:
- The commit touches DB migrations (explain the schema change).
- The commit changes build/CI (explain what and why).
- A non-obvious constraint forced the partitioning decision.
- A validation was deferred and needs a note.

Body format:
```
<type>(<scope>): <subject>

- What changed and why it belongs here.
- Any constraint or dependency that shaped this partition.

Validation: bun run ci
```

## Secrets and suspicious files

Before staging anything, check for:
- `.env`, `.env.*` (except `.env.schema`, `.env.example`)
- `*.pem`, `*.key`, `*.p12`, `*.pfx`
- Files containing `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE_KEY` in their name
- Unexpected large binaries

If any suspicious file appears in the diff: **stop and ask the user**. Do not commit it.

## Output format — dry-run mode

```md
## Effective base

`<sha>` <original message>
(<N> quicksave commits will be flattened)

## Proposed commit plan

### 1. <type(scope): subject>

Files/hunks:
- path/to/file.ts (full)
- path/to/other.ts (hunks: lines X–Y)

Reason: <why these belong together>
Validation: <full | light | deferred — reason>
Risk: <none | low | medium — brief note>

### 2. ...

## Notes

- Any files that should NOT be committed (generated, secrets, etc.)
- Any merges forced by CI-green constraint
- Anything the user should review before applying
```

## Output format — apply mode

```md
## Effective base

`<sha>` <original message>
Backup ref: `backup/split-commits-<branch>-<n>` (recover with `git reset --hard <backup-ref>`)
Soft-reset complete. Working tree contains all changes.

## Created commits

1. `<sha>` <type(scope): subject>
   Files: ...
   Validation: bun run ci ✓

2. `<sha>` <type(scope): subject>
   Files: ...
   Validation: bun run ci ✓

## Remaining working tree

\`\`\`
<git status --short output>
\`\`\`

## Notes

- ...
```
