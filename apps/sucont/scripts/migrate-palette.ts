/**
 * Codemod de paleta crua → token semântico.
 *
 * Traduz as classes de paleta do Tailwind que o STYLE_CONTRACT.md proíbe (§6) para
 * os tokens semânticos declarados em `styles.css`. Existe como script, e não como
 * uma sequência de sed, porque a substituição precisa de duas coisas que um
 * find/replace cego não tem:
 *
 *  1. **Ordem.** `slate-100` precisa casar antes de `slate-1`… e `bg-slate-50`
 *     antes de `bg-slate-5`. As regras são aplicadas na ordem declarada, das mais
 *     específicas para as mais gerais.
 *  2. **Escopo.** Superfície escura (`bg-slate-900` no herói do hub, painel escuro
 *     do chat) usa a escala invertida de propósito: ali `text-slate-300` é o texto
 *     legível, não um cinza fraco. Traduzir isso para `text-muted-foreground`
 *     apagaria o texto. Essas linhas são deixadas em paz e listadas no relatório.
 *
 * Uso:
 *   bun run scripts/migrate-palette.ts --dry     # relatório, sem escrever
 *   bun run scripts/migrate-palette.ts           # aplica
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dir, "..", "src")
const DRY = process.argv.includes("--dry")

/**
 * Arquivo que ainda resolve cor com `isDarkMode ? "<escuro>" : "<claro>"`. Nele os
 * pares claro/escuro são lógica, não estilo, e a migração depende de colapsá-los
 * primeiro — ver `migrate-auditor-theme.ts`. Sobrou apenas o estado do botão de
 * tema, que não escolhe cor nenhuma: por isso o teste é o ternário, não a palavra.
 */
const isDarkCapable = (source: string) => /isDarkMode\s*\?\s*"/.test(source)

/**
 * Uma linha que declara superfície escura. Nela a escala do slate é usada
 * invertida e as regras abaixo não valem.
 */
const DARK_SURFACE = /bg-(?:slate|zinc|gray)-(?:700|800|900|950)|bg-black|from-slate-9|bg-\[#0[0-9a-f]/i

interface Rule {
	from: RegExp
	to: string
	/** Por que a tradução é essa, quando não é óbvio. */
	note?: string
}

const RULES: Rule[] = [
	// ── Régua de 1px ────────────────────────────────────────────────────────────
	// `h-[1px] bg-slate-200` é uma borda desenhada como caixa. O token é o de
	// borda, não o de superfície.
	{ from: /h-\[1px\] bg-slate-200\b/g, to: "h-[1px] bg-border" },
	{ from: /h-px bg-slate-200\b/g, to: "h-px bg-border" },

	// ── Texto ───────────────────────────────────────────────────────────────────
	// O sistema tem dois papéis de texto, não onze degraus. 900–700 é o conteúdo;
	// 600–400 é o secundário. Colapsar 400 em `muted-foreground` também SOBE o
	// contraste: `text-slate-400` sobre branco reprova WCAG AA, o token passa.
	{ from: /\btext-slate-(?:900|800|700)\b/g, to: "text-foreground" },
	{ from: /\btext-slate-(?:600|500|400)\b/g, to: "text-muted-foreground" },

	// ── Bordas e divisores ──────────────────────────────────────────────────────
	{ from: /\bborder-slate-(?:100|200|300)\b/g, to: "border-border" },
	{ from: /\bdivide-slate-(?:100|200)\b/g, to: "divide-border" },
	{ from: /\bring-slate-(?:100|200|300)\b/g, to: "ring-border" },

	// ── Superfícies claras ──────────────────────────────────────────────────────
	{ from: /\bbg-slate-50\b/g, to: "bg-muted/50" },
	{ from: /\bbg-slate-(?:100|200)\b/g, to: "bg-muted" },
	{ from: /\bhover:bg-slate-50\b/g, to: "hover:bg-muted/50" },
	{ from: /\bhover:bg-slate-100\b/g, to: "hover:bg-muted" },

	// ── Foco ────────────────────────────────────────────────────────────────────
	// Anel de foco é o token `ring`, sempre: é o que dá um indicador de teclado
	// igual na aplicação inteira.
	{ from: /\bfocus:ring-blue-500\/50\b/g, to: "focus-visible:ring-ring/50" },
	{ from: /\bfocus:ring-blue-500\b/g, to: "focus-visible:ring-ring" },
	{ from: /\bfocus-visible:ring-blue-500\b/g, to: "focus-visible:ring-ring" },
	{ from: /\bring-blue-500\/50\b/g, to: "ring-ring/50" },

	// ── Estado: erro ────────────────────────────────────────────────────────────
	{ from: /\btext-red-(?:900|800|700|600|500)\b/g, to: "text-destructive" },
	{ from: /\bborder-red-(?:200|300|400)\b/g, to: "border-destructive/30" },
	{ from: /\bbg-red-50\b/g, to: "bg-destructive/10" },
	{ from: /\bbg-red-100\b/g, to: "bg-destructive/15" },
	{ from: /\bhover:bg-red-700\b/g, to: "hover:bg-destructive/90" },
	{ from: /\bhover:bg-red-600\b/g, to: "hover:bg-destructive/90" },
	{ from: /\bbg-red-(?:500|600|700)\b/g, to: "bg-destructive" },
	{ from: /\bhover:text-red-(?:400|500|600)\b/g, to: "hover:text-destructive" },

	// ── Estado: sucesso ─────────────────────────────────────────────────────────
	{ from: /\btext-(?:emerald|green)-(?:900|800|700|600|500)\b/g, to: "text-success" },
	{ from: /\bborder-(?:emerald|green)-(?:200|300|400)\b/g, to: "border-success/30" },
	{ from: /\bbg-(?:emerald|green)-50\b/g, to: "bg-success/10" },
	{ from: /\bbg-(?:emerald|green)-100\b/g, to: "bg-success/15" },
	{ from: /\bhover:bg-(?:emerald|green)-700\b/g, to: "hover:bg-success/90" },
	{ from: /\bbg-(?:emerald|green)-(?:500|600|700)\b/g, to: "bg-success" },

	// ── Estado: atenção ─────────────────────────────────────────────────────────
	{ from: /\btext-(?:amber|yellow|orange)-(?:900|800|700|600|500)\b/g, to: "text-warning" },
	{ from: /\bborder-(?:amber|yellow|orange)-(?:200|300|400)\b/g, to: "border-warning/30" },
	{ from: /\bbg-(?:amber|yellow|orange)-50\b/g, to: "bg-warning/10" },
	{ from: /\bbg-(?:amber|yellow|orange)-100\b/g, to: "bg-warning/15" },
	{ from: /\bbg-(?:amber|yellow|orange)-(?:500|600|700)\b/g, to: "bg-warning" },
]

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return walk(full)
		return full.endsWith(".tsx") ? [full] : []
	})
}

let filesChanged = 0
let replacements = 0
const skippedDarkCapable: string[] = []
const skippedDarkLines = new Map<string, number>()

for (const file of walk(SRC)) {
	const original = readFileSync(file, "utf8")

	if (isDarkCapable(original)) {
		skippedDarkCapable.push(file.replace(`${SRC}/`, ""))
		continue
	}

	// Linha a linha: é o menor grão em que dá para reconhecer uma superfície escura
	// sem montar um parser de JSX.
	let fileReplacements = 0
	let darkLines = 0
	const next = original
		.split("\n")
		.map((line) => {
			if (DARK_SURFACE.test(line)) {
				darkLines++
				return line
			}
			let out = line
			for (const { from, to } of RULES) {
				out = out.replace(from, () => {
					fileReplacements++
					return to
				})
			}
			return out
		})
		.join("\n")

	if (darkLines > 0) skippedDarkLines.set(file.replace(`${SRC}/`, ""), darkLines)

	if (next !== original) {
		filesChanged++
		replacements += fileReplacements
		if (!DRY) writeFileSync(file, next)
	}
}

console.log(`${DRY ? "[dry-run] " : ""}${replacements} substituições em ${filesChanged} arquivos`)
console.log(`\nPulados por prop isDarkMode (${skippedDarkCapable.length}) — dependem de remover a prop primeiro:`)
for (const f of skippedDarkCapable) console.log(`  ${f}`)
if (skippedDarkLines.size > 0) {
	console.log(`\nLinhas de superfície escura preservadas (${[...skippedDarkLines.values()].reduce((a, b) => a + b, 0)}):`)
	for (const [f, n] of [...skippedDarkLines].sort((a, b) => b[1] - a[1])) console.log(`  ${f}: ${n}`)
}
