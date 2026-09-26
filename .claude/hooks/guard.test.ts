// Casos do guard.ts: o que ele barra (true), pede confirmação ("ask") e deixa passar (false).
// Roda com `bun test ./.claude/hooks/guard.test.ts` (fora dos workspaces; o turbo não o pega).
import { expect, test } from "bun:test";
import { resolve } from "node:path";

const P = resolve(import.meta.dir, "../..");
const GUARD = `${import.meta.dir}/guard.ts`;

const CASES: Array<[string, boolean | "ask", object]> = [
	["push main", true, { tool_name: "Bash", tool_input: { command: "git push origin " + "main" } }],
	["HEAD:main", true, { tool_name: "Bash", tool_input: { command: "git push -u origin HEAD:" + "main" } }],
	["branch contendo main", false, { tool_name: "Bash", tool_input: { command: "git push -u origin chore/main-fix" } }],
	["push + checkout main", false, { tool_name: "Bash", tool_input: { command: "git push -u origin chore/x && git checkout main" } }],
	["no-verify", true, { tool_name: "Bash", tool_input: { command: "git commit --no-verify -m x" } }],
	["-nm", true, { tool_name: "Bash", tool_input: { command: "git commit -nm x" } }],
	["-n na mensagem", false, { tool_name: "Bash", tool_input: { command: 'git commit -m "feat: use -n flag"' } }],
	["amend", false, { tool_name: "Bash", tool_input: { command: "git commit --amend -m x" } }],
	["vitest raiz", true, { tool_name: "Bash", tool_input: { command: "bunx vitest run" } }],
	["vitest no app", false, { tool_name: "Bash", tool_input: { command: "cd apps/sisub && bunx vitest run" } }],
	["repair reverted", true, { tool_name: "Bash", tool_input: { command: "bunx supabase migration repair --status reverted 1" } }],
	["repair applied", false, { tool_name: "Bash", tool_input: { command: "bunx supabase migration repair --status applied 1" } }],
	["repair citado em heredoc", false, { tool_name: "Bash", tool_input: { command: "git commit -F - <<'EOF'\nfix: never run migration repair --status reverted\nEOF" } }],
	["push main citado em -m", false, { tool_name: "Bash", tool_input: { command: 'git commit -m "docs: explain git push origin main"' } }],
	["heredoc + push main real", true, { tool_name: "Bash", tool_input: { command: "cat <<EOF > x\nhi\nEOF\ngit push origin " + "main" } }],
	["no-verify depois de -m", true, { tool_name: "Bash", tool_input: { command: 'git commit -m "x" --no-verify' } }],
	["commit | tail -n", false, { tool_name: "Bash", tool_input: { command: 'git commit -m "feat: x" 2>&1 | tail -n 20' } }],
	["commit -uno", false, { tool_name: "Bash", tool_input: { command: "git commit -uno -m x" } }],
	["commit -S keyid com n", false, { tool_name: "Bash", tool_input: { command: "git commit -Sabcn123 -m x" } }],
	["git -C dir commit -n", true, { tool_name: "Bash", tool_input: { command: "git -C apps commit -n -m x" } }],
	["commit -an", true, { tool_name: "Bash", tool_input: { command: "git commit -an -m x" } }],
	["db reset", true, { tool_name: "Bash", tool_input: { command: "bunx supabase db reset" } }],
	["routeTree", true, { tool_name: "Edit", tool_input: { file_path: `${P}/apps/sisub/src/routeTree.gen.ts` } }],
	["Dockerfile raiz", true, { tool_name: "Write", tool_input: { file_path: `${P}/Dockerfile` } }],
	["paths-filter", true, { tool_name: "Edit", tool_input: { file_path: `${P}/.github/paths-filter.yml` } }],
	["generated.ts", true, { tool_name: "Edit", tool_input: { file_path: `${P}/packages/database/src/generated.ts` } }],
	["apps/pdf/Dockerfile", false, { tool_name: "Edit", tool_input: { file_path: `${P}/apps/pdf/Dockerfile` } }],
	["arquivo normal", false, { tool_name: "Edit", tool_input: { file_path: `${P}/apps/sisub/src/main.tsx` } }],
];

for (const [name, expected, payload] of CASES) {
	test(name, () => {
		const run = Bun.spawnSync(["bun", GUARD], {
			stdin: new TextEncoder().encode(JSON.stringify({ cwd: P, ...payload })),
			env: { ...process.env, CLAUDE_PROJECT_DIR: P },
		});
		const out = run.stdout.toString();
		const got = out.includes('"deny"') ? true : out.includes('"ask"') ? "ask" : false;
		expect(got).toBe(expected);
	});
}
