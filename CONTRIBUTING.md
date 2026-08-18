# Contributing to IEFA

## How to Contribute

### Reporting Bugs

Open an issue with a clear title, steps to reproduce, expected vs actual behavior, and your environment details.

### Suggesting Features

Open an issue describing the feature, its motivation, and any relevant context.

### Pull Requests

Every change goes through a pull request against `main` — never commit or merge straight
into it.

1. Branch from `main` (contributors outside the organization: fork first).
2. Install dependencies:
   ```bash
   bun install
   ```
3. Make your changes and make sure the checks pass — the whole suite, not a per-file
   typecheck, which misses cross-package breakage:
   ```bash
   bun run check   # biome + typecheck
   bun run test
   ```
   Integration tests need a real database and stay skipped without one. That is expected.
4. Touched an app or package that ships? Regenerate the deploy artifacts, which are
   derived from `apps.manifest.json` and never edited by hand:
   ```bash
   bun run check:deploy    # CI runs this and fails on drift
   bun run generate:deploy # rewrite Dockerfile, docker-bake.hcl, paths-filter.yml
   ```
5. Commit using the interactive wizard (commitizen + cz-git):
   ```bash
   bun run commit
   ```
   This guides you through [Conventional Commits](https://www.conventionalcommits.org) with
   the required scope. The valid scopes are **not** a list anyone maintains by hand:
   `commitlint.config.ts` derives them from the `apps/` and `packages/` directories plus
   the deploy keys in `apps.manifest.json`, then adds `deps`, `ci`, `scripts` and `root`.
   A new workspace becomes a valid scope on its own. A change spanning several apps may
   list them: `fix(portal,sisub): …`.

   **Commit messages are written in English** — subject and body — even when the code,
   comments and diff are in Portuguese.

   If committing manually, follow the format:
   ```
   <type>(<scope>): <short description>

   feat(sisub): add weekly menu export
   fix(api): handle null response from provider
   ```

6. Open a pull request against `main` with a clear description of what and why. Leave it
   open for review; don't self-merge.

### Review

Automated review is on demand, not automatic: run `/code-review` before asking for a merge
and report the findings on the PR. CI covers Biome, typecheck, Opengrep, CodeQL, Trivy,
zizmor, gitleaks, the dependency audit and the contract tests — but no linter sees a race
between a check and a mutation, an empty state that hides a failure, or a wrong FK order.
An absence of bot comments does not mean the code was reviewed.

When a bug traces back to a pattern rather than a typo, the fix includes a rule in
`.opengrep/rules/` so the pattern can't come back.

## Development Setup

See [README.md](README.md#getting-started) for full setup instructions, and
[CLAUDE.md](CLAUDE.md) for the conventions this codebase enforces — server function shape,
Supabase client construction, the two incompatible design systems, the AI tool contract.

## Code Style

This project uses [Biome](https://biomejs.dev) for linting and formatting. Run before committing:

```bash
bun run format
```

Or to check formatting, lint and types at once:

```bash
bun run check
```

## Security

Automated checks run on every pull request (`.github/workflows/security.yml`): Opengrep
with this repo's own rules, CodeQL, gitleaks, a dependency audit, zizmor for the workflows
themselves, and Trivy for IaC.

Two of them are worth running locally.

**Opengrep** enforces the invariants that generic scanners can't know about — every
TanStack Start server function needs an auth guard, the Supabase service key never leaves
server-only modules, `throw new Response` never appears inside a server fn. Rules live in
`.opengrep/rules/`. Install the [binary](https://github.com/opengrep/opengrep/releases),
then:

```bash
opengrep scan --config .opengrep/rules .
```

**gitleaks** blocks secrets at commit time via the pre-commit hook. It's optional — without
it installed the hook prints a warning and lets the commit through — but this repo is
public, so a pushed secret means rotating the credential, not just rewriting history.
Install it from the [releases](https://github.com/gitleaks/gitleaks/releases). Allowlist
false positives in `.gitleaks.toml`; never allowlist a real secret.

Two checks need credentials and therefore run on a schedule instead of per-PR:

```bash
# RLS of every schema exposed through PostgREST (needs SISUB_DATABASE_URL)
bun --filter @iefa/database audit:rls

# server fn endpoints really answer 401 without a session (needs a running app)
bun --cwd apps/sisub test:e2e -- e2e/tests/authz.spec.ts
```

Adding a server function? `apps/sisub/src/server/server-fn-auth.contract.test.ts` fails if
it has no guard. A genuinely public endpoint goes in that file's `PUBLIC_SERVER_FNS` map,
with a reason — the route's `beforeLoad` is *not* a guard, since `/_serverFn/<id>` is
callable directly over HTTP.

Found a vulnerability? Please report it privately rather than opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
