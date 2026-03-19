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

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
