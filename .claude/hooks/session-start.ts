#!/usr/bin/env bun
// SessionStart: avisa do que faz a sessão trabalhar num estado diferente do CI.
// O stdout vira contexto do modelo; fica calado quando está tudo certo.

import { existsSync } from "node:fs";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const notes: string[] = [];

if (!existsSync(`${projectDir}/node_modules`)) {
	notes.push(
		"Esta worktree não tem node_modules: rode `bun install` antes de testar ou commitar. Sem ele não existem os hooks de commit (commitlint, gitleaks) nem o formatador automático.",
	);
}

const branch = Bun.spawnSync(["git", "branch", "--show-current"], { cwd: projectDir }).stdout.toString().trim();
if (branch === "main") {
	notes.push("Sessão na branch `main`. Todo trabalho vai por PR: crie uma branch antes de commitar.");
}

if (notes.length > 0) console.log(notes.join("\n"));
