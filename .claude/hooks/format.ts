#!/usr/bin/env bun
// PostToolUse (Edit|Write|MultiEdit): formata e organiza imports SÓ do arquivo editado.
//
// Linter desligado de propósito: `biome check --write` com lint aplica o que é corrigível e
// esconde o que não é (a11y, por exemplo) atrás de "Fixed N files". O gate de lint é
// `bun run lint`, que continua valendo. Nunca falha a ferramenta: formatação é conveniência.

import { existsSync } from "node:fs";

const input = await Bun.stdin.json().catch(() => ({}));
const file: string | undefined = input?.tool_input?.file_path;
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd();

if (!file || !existsSync(file) || !file.startsWith(`${projectDir}/`)) process.exit(0);
if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/.test(file)) process.exit(0);

const biome = `${projectDir}/node_modules/.bin/biome`;
if (!existsSync(biome)) process.exit(0);

Bun.spawnSync(
	[biome, "check", "--write", "--linter-enabled=false", "--no-errors-on-unmatched", file],
	{ cwd: projectDir, stdout: "ignore", stderr: "ignore" },
);
process.exit(0);
