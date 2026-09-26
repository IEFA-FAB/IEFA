#!/usr/bin/env bun
// PreToolUse: barra, antes de acontecer, as ações que o repo já sabe que dão errado.
//
// Cada regra aqui corresponde a um incidente ou a um arquivo gerado. O hook recusa com
// `permissionDecision: "deny"` e o motivo volta para o modelo, que corrige o caminho.
// É um freio de boa-fé, não uma fronteira de segurança: casar comando de shell por regex
// sempre deixa brecha. A fronteira de verdade segue sendo o CI e a proteção da `main`.

type HookInput = {
	tool_name?: string;
	cwd?: string;
	tool_input?: { file_path?: string; command?: string };
};

const input: HookInput = await Bun.stdin.json().catch(() => ({}));
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();

function decide(permissionDecision: "deny" | "ask", reason: string): never {
	console.log(
		JSON.stringify({
			hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason: reason },
		}),
	);
	process.exit(0);
}
const deny = (reason: string) => decide("deny", reason);

// Flags curtas do `git commit` que recebem valor colado (`-mmsg`, `-uno`, `-S<keyid>`): o que
// vem depois delas no mesmo token é valor, não outra flag.
const COMMIT_VALUE_FLAGS = new Set(["m", "F", "C", "c", "t", "u", "S"]);
function skipsCommitHooks(segment: string): boolean {
	// Husky desligado por variável ou hooksPath desviado pula os mesmos hooks que `--no-verify`.
	if (/\bgit\b/.test(segment) && /\bHUSKY=0\b|core\.hooksPath/.test(segment)) return true;
	const tokens = segment.trim().split(/\s+/);
	const git = tokens.indexOf("git");
	const at = git < 0 ? -1 : tokens.indexOf("commit", git + 1); // cobre `git -C <dir> commit`
	if (at < 0) return false;
	for (const token of tokens.slice(at + 1)) {
		// O git aceita prefixo não ambíguo de opção longa: `--no-veri` é `--no-verify`.
		if (token.length > 5 && "--no-verify".startsWith(token)) return true;
		if (!/^-[a-zA-Z]/.test(token)) continue;
		for (const flag of token.slice(1)) {
			if (flag === "n") return true;
			if (COMMIT_VALUE_FLAGS.has(flag)) break;
		}
	}
	return false;
}

const GENERATED: Array<[RegExp, string]> = [
	[
		/^(Dockerfile|docker-bake\.hcl|\.github\/paths-filter\.yml)$/,
		"Arquivo gerado de apps.manifest.json. Edite o manifesto (ou scripts/generate-deploy-artifacts.ts) e rode `bun run generate:deploy`; o CI falha em drift.",
	],
	[
		/(^|\/)routeTree\.gen\.ts$/,
		"routeTree.gen.ts é gerado pelo TanStack Router. Crie/renomeie a rota e rode o dev server do app (ou `bunx tsr generate`); em conflito de merge, regenere em vez de costurar.",
	],
	[
		/^packages\/database\/src\/generated\.ts$/,
		"Tipos gerados do Supabase. Rode `bun --filter @iefa/database db:types` depois de aplicar a migration.",
	],
	[/^packages\/compras-api\/src\/types\.gen\.ts$/, "Gerado por openapi-typescript a partir do swagger do Compras.gov."],
];

const tool = input.tool_name ?? "";

if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
	const abs = input.tool_input?.file_path ?? "";
	const rel = abs.startsWith(`${projectDir}/`) ? abs.slice(projectDir.length + 1) : abs;
	for (const [pattern, reason] of GENERATED) {
		if (pattern.test(rel)) deny(reason);
	}
}

if (tool === "Bash") {
	// Corpo de heredoc e texto entre aspas são dado, não comando: uma mensagem de commit que
	// cita `migration repair --status reverted` não pode ser barrada como se o rodasse.
	const cmd = (input.tool_input?.command ?? "")
		.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, "")
		.replace(/"(?:\\.|[^"\\])*"/g, '""')
		.replace(/'[^']*'/g, "''");
	const segments = cmd.split(/&&|\|\||[;|\n]/);

	// O ruleset da `main` já recusa o push no servidor; barrar aqui poupa a volta e diz o caminho.
	// Da `main`, qualquer push sai para ela (`git push`, `git push origin HEAD`), com ou sem nome.
	const pushes = segments.filter((s) => /\bgit\b.*\bpush\b/.test(s));
	const onMain = () =>
		Bun.spawnSync(["git", "branch", "--show-current"], { cwd: input.cwd ?? projectDir }).stdout.toString().trim() ===
		"main";
	if (pushes.some((s) => /(\s|:|\+)(refs\/heads\/)?main(\s|$)/.test(s)) || (pushes.length > 0 && onMain())) {
		deny("A main não aceita push direto (ruleset sem bypass). Abra PR a partir de uma branch: skill ship-pr.");
	}
	if (segments.some(skipsCommitHooks)) {
		deny(
			"Commit sem hooks pula commitlint e gitleaks. Corrija a mensagem ou o achado; falso positivo do gitleaks vai para .gitleaks.toml.",
		);
	}
	if (/\bmigration\s+repair\b.*--status[=\s]+reverted\b|\bdb:repair:reverted\b/.test(cmd)) {
		deny(
			"`migration repair --status reverted` declara não aplicado o que está em produção e faz o próximo push arrastar migrations de contract. Veja .claude/rules/database.md.",
		);
	}
	if (/\bdb\s+reset\b.*--(linked|db-url)\b/.test(cmd)) {
		deny("`supabase db reset` com `--linked`/`--db-url` apaga o banco compartilhado (produção + treino). Sem flag ele reseta só o local.");
	}
	// Aplicar migration no banco compartilhado só com pedido explícito (declara → aplica → mergeia):
	// `ask` devolve a decisão ao humano em vez de negar um passo que às vezes é o pedido.
	if (/\bsupabase\s+(db\s+push|migration\s+repair)\b|\bdb:(push|repair:applied)\b/.test(cmd)) {
		decide("ask", "Isto escreve no banco compartilhado (produção + treino). Só com pedido explícito do mantenedor.");
	}
	const cwd = input.cwd ?? projectDir;
	const cdTarget = cmd.match(/^\s*cd\s+(\S+)/)?.[1];
	const runsAtRoot = cwd === projectDir && (!cdTarget || cdTarget === "." || cdTarget === projectDir);
	if (runsAtRoot && /\b(bunx|npx)\s+vitest\b/.test(cmd)) {
		deny(
			"vitest da raiz não resolve o alias `@/` e dá ~32 falsos positivos. Use `bun run test` (turbo) ou `cd apps/<app> && bunx vitest run`.",
		);
	}
}

process.exit(0);
