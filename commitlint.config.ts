import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { defineConfig } from "cz-git"

/**
 * Escopos derivados do repo, não digitados à mão: um workspace novo vira escopo
 * válido sozinho. A lista manual ficou seis packages atrás da realidade porque
 * ninguém lembra de vir aqui ao criar um package.
 */
function workspaceScopes() {
	const dirs = ["apps", "packages"].flatMap((group) =>
		readdirSync(join(import.meta.dirname, group), { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
	)
	// `5s` é alvo de deploy (o mesmo build do forms com outro tenant), não diretório.
	const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "apps.manifest.json"), "utf8")) as { apps: { key: string }[] }
	return [...new Set([...dirs, ...manifest.apps.map((a) => a.key)])].sort()
}

const validScopes = [
	...workspaceScopes(),
	// monorepo raiz
	"deps",
	"ci",
	"scripts",
	"root",
]

export default defineConfig({
	extends: ["@commitlint/config-conventional"],
	rules: {
		"scope-enum": [2, "always", validScopes],
		"scope-empty": [1, "never"],
		"body-max-line-length": [1, "always", 100],
	},
	prompt: {
		enableMultipleScopes: true,
		skipQuestions: ["breaking", "footer"],
		messages: {
			type: "Tipo de mudança:",
			scope: "Escopo(s) afetado(s):",
			subject: "Descrição curta (imperativo, sem ponto final):",
			body: "Descrição longa (opcional, Enter para pular):",
			confirmCommit: "Confirmar commit?",
		},
		types: [
			{ value: "feat", name: "feat: Nova funcionalidade" },
			{ value: "fix", name: "fix: Correção de bug" },
			{ value: "chore", name: "chore: Manutenção, deps, configs" },
			{ value: "refactor", name: "refactor: Sem mudança de comportamento externo" },
			{ value: "ci", name: "ci: Pipelines e workflows" },
			{ value: "docs", name: "docs: Documentação" },
			{ value: "test", name: "test: Testes" },
			{ value: "perf", name: "perf: Melhoria de performance" },
		],
	},
})
