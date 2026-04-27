import { defineConfig } from "cz-git";

const validScopes = [
	// apps
	"portal",
	"sisub",
	"alpha",
	"api",
	"docs",
	// monorepo raiz
	"deps",
	"ci",
	"scripts",
	"root",
];

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
});