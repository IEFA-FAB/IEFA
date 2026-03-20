# IEFA

Monorepo for the IEFA platform.

## Apps

| App | Description |
|-----|-------------|
| `apps/sisub` | Sistema de subsistência |
| `apps/portal` | Portal IEFA |
| `apps/api` | Backend API |
| `apps/docs` | Documentation |

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Monorepo:** [Turborepo](https://turbo.build)
- **Frontend:** [TanStack Start](https://tanstack.com/start) + React 19
- **Database:** [Supabase](https://supabase.com)
- **Linting/Formatting:** [Biome](https://biomejs.dev)
- **Deploy:** [Fly.io](https://fly.io)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- [Docker](https://www.docker.com) (optional, for containerized dev)

### Install

```bash
bun install
```

### Development

```bash
# All apps
bun dev

# Specific app
bun sisub:dev
bun portal:dev
bun api:dev
bun docs:dev
```

### Build

```bash
bun build
```

### Lint & Format

```bash
bun lint
bun format
```

### Type Check

```bash
bun typecheck
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
