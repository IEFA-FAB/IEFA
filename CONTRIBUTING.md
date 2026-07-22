# Contributing to IEFA

Thank you for your interest in contributing!

## How to Contribute

### Reporting Bugs

Open an issue with a clear title, steps to reproduce, expected vs actual behavior, and your environment details.

### Suggesting Features

Open an issue describing the feature, its motivation, and any relevant context.

### Pull Requests

1. Fork the repository and create your branch from `main`.
2. Install dependencies:
   ```bash
   bun install
   ```
3. Make your changes and ensure checks pass:
   ```bash
   bun typecheck
   bun lint
   bun test
   ```
4. Commit using the interactive wizard (commitizen + cz-git):
   ```bash
   bun commit
   ```
   This guides you through [Conventional Commits](https://www.conventionalcommits.org) with the required scope. Valid scopes are: `portal`, `sisub`, `ai`, `api`, `docs`, `deps`, `ci`, `scripts`, `root`.

   If committing manually, follow the format:
   ```
   <type>(<scope>): <short description>

   feat(sisub): add weekly menu export
   fix(api): handle null response from provider
   ```

5. Open a pull request against `main` with a clear description of what and why.

## Development Setup

See [README.md](README.md#getting-started) for full setup instructions.

## Code Style

This project uses [Biome](https://biomejs.dev) for linting and formatting. Run before committing:

```bash
bun format
```

Or to lint + format + typecheck at once:

```bash
bun check
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
