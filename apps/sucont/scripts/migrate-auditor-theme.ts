/**
 * Codemod: remove a prop `isDarkMode` do módulo do auditor.
 *
 * O módulo trocava de tema por prop, com `isDarkMode ? "<classes escuras>" :
 * "<classes claras>"` em 159 ternários e 92 pares distintos, mais a prop
 * atravessando oito componentes e um `document.documentElement.classList.add`
 * numa rota — uma tela mudando o tema do app inteiro.
 *
 * Cada par é um token: o valor claro e o valor escuro do par são, com folga de
 * arredondamento, os dois valores que a folha já declara para o mesmo token em
 * `:root` e em `.dark`. O que sobra é uma classe só, e quem troca é o CSS.
 *
 * A tabela abaixo é a parte revisável deste commit. Cada linha é uma decisão de
 * qual papel semântico aquele par exercia.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SRC = join(import.meta.dir, "..", "src")
const DRY = process.argv.includes("--dry")

/** `[valorEscuro, valorClaro] → substituição`. */
const PAIRS: Array<[string, string, string]> = [
	// ── Cromo de gráfico (hex → var). Recharts pinta em atributo SVG. ──────────
	["#94a3b8", "#64748b", "chartChrome.axis"],
	["#475569", "#94a3b8", "chartChrome.axis"],
	["#334155", "#e2e8f0", "chartChrome.grid"],
	["#1e293b", "#e2e8f0", "chartChrome.grid"],
	["#334155", "#cbd5e1", "chartChrome.grid"],
	["#475569", "#cbd5e1", "chartChrome.grid"],
	["#0f172a", "#fff", "chartChrome.surface"],
	["#0f172a", "#f8fafc", "chartChrome.surface"],
	["#1e293b", "#f8fafc", "chartChrome.surfaceMuted"],
	["#1e293b", "#f1f5f9", "chartChrome.surfaceMuted"],
	["#cbd5e1", "#475569", "chartChrome.label"],
	// Séries: mesma matiz, luminosidade por fundo — vira token nomeado pelo dado.
	["#3b82f6", "#1e40af", "chartSeries.siafi"],
	["#0ea5e9", "#0369a1", "chartSeries.siloms"],
	["#f43f5e", "#e11d48", "chartSeries.diff"],
	["#818cf8", "#4338ca", "chartSeries.pareto"],
	["#34d399", "#065f46", "chartSeries.accumulated"],
	["#fbbf24", "#d97706", "chartSeries.axisAlt"],

	// ── Texto ─────────────────────────────────────────────────────────────────
	["text-white", "text-slate-900", "text-foreground"],
	["text-white", "text-slate-800", "text-foreground"],
	["text-slate-100", "text-slate-900", "text-foreground"],
	["text-slate-100", "text-slate-800", "text-foreground"],
	["text-slate-200", "text-slate-800", "text-foreground"],
	["text-slate-300", "text-slate-700", "text-foreground"],
	["text-slate-300", "text-slate-600", "text-muted-foreground"],
	["text-slate-400", "text-slate-500", "text-muted-foreground"],
	["text-slate-400", "text-slate-600", "text-muted-foreground"],
	["text-slate-500", "text-slate-400", "text-muted-foreground"],
	["text-slate-600", "text-slate-400", "text-muted-foreground"],
	["text-slate-500", "text-slate-500", "text-muted-foreground"],
	["text-slate-400 hover:text-slate-200", "text-slate-500 hover:text-slate-700", "text-muted-foreground hover:text-foreground"],
	["text-slate-400 hover:text-white", "text-slate-400 hover:text-slate-600", "text-muted-foreground hover:text-foreground"],
	["text-slate-300 hover:bg-slate-700", "text-slate-700 hover:bg-slate-100", "text-foreground hover:bg-muted"],

	// ── Superfícies ───────────────────────────────────────────────────────────
	["bg-slate-800 border-slate-700", "bg-slate-100 border-slate-200", "bg-muted border-border"],
	["bg-slate-800 border-slate-700", "bg-card border-slate-200", "bg-card border-border"],
	["bg-slate-900 border-slate-700", "bg-card border-slate-200", "bg-card border-border"],
	["bg-slate-900 border-slate-700", "bg-slate-50 border-slate-200", "bg-muted/50 border-border"],
	["bg-slate-800/50 border-slate-700", "bg-card border-slate-200", "bg-card border-border"],
	["bg-slate-900/50 border-slate-800", "bg-card border-slate-200", "bg-card border-border"],
	["bg-slate-900/50 border-slate-700/50", "bg-slate-100 border-slate-200", "bg-muted border-border"],
	["border-slate-800 bg-slate-900/40", "border-slate-200 bg-card", "border-border bg-card"],
	["border-slate-800 bg-slate-900/50", "border-slate-300 bg-card", "border-border bg-card"],
	["border-slate-800 bg-slate-900/50", "border-slate-200 bg-slate-50", "border-border bg-muted/50"],
	["bg-slate-900/40 backdrop-blur-sm border-slate-800", "bg-card border-slate-200", "bg-card border-border"],
	["bg-slate-900", "bg-slate-100", "bg-muted"],
	["bg-slate-700", "bg-slate-200", "bg-muted"],
	["bg-transparent", "bg-card", "bg-card"],
	["border-slate-700", "border-slate-100", "border-border"],
	["border-slate-700/50", "border-slate-100", "border-border"],
	["hover:bg-slate-800/30", "hover:bg-slate-50", "hover:bg-muted/50"],
	["hover:bg-slate-700 text-slate-400", "hover:bg-slate-200 text-slate-500", "hover:bg-muted text-muted-foreground"],

	// ── Superfícies com blur (barra fixa, tooltip sobreposto) ─────────────────
	["bg-[#0f172a]/95 border-slate-800", "bg-white/95 border-slate-200", "bg-card/95 border-border"],
	["bg-[#0f172a]/95 border-slate-700", "bg-white/95 border-slate-200", "bg-card/95 border-border"],
	["bg-[#020617]/95", "bg-slate-50/95", "bg-background/95"],
	["border-slate-800 bg-slate-900/90 backdrop-blur-md", "border-slate-200 bg-white/90 backdrop-blur-md", "border-border bg-card/90 backdrop-blur-md"],
	[
		"bg-slate-900/90 backdrop-blur-md text-slate-400 border-slate-800",
		"bg-white/90 backdrop-blur-md text-slate-600 border-slate-200",
		"bg-card/90 backdrop-blur-md text-muted-foreground border-border",
	],
	[
		"bg-slate-900/90 backdrop-blur-md border-slate-700/50 shadow-[2px_0_5px_rgba(0,0,0,0.2)]",
		"bg-slate-100/90 backdrop-blur-md border-slate-200",
		"bg-muted/90 backdrop-blur-md border-border",
	],
	["bg-[#0f172a]/60 border-slate-800/50 hover:bg-[#0f172a]/80", "bg-card border-slate-200 hover:bg-slate-50", "bg-card border-border hover:bg-muted/50"],

	// ── Botão de segmento (toggle group) ──────────────────────────────────────
	// Selecionado sobe uma superfície; não selecionado é texto secundário.
	["bg-slate-600 text-white shadow-sm", "bg-card text-slate-800 shadow-sm", "bg-background text-foreground shadow-sm"],
	["bg-slate-700 text-white", "bg-slate-200 text-slate-800", "bg-background text-foreground"],
	["text-slate-100 bg-slate-600", "text-slate-100 bg-slate-700", "bg-primary text-primary-foreground"],
	["bg-slate-700 text-slate-300", "bg-slate-200 text-slate-600", "bg-muted text-muted-foreground"],

	// ── Campos e controles ────────────────────────────────────────────────────
	["bg-slate-900 border-slate-600 text-slate-300", "bg-slate-50 border-slate-300 text-slate-700", "bg-muted/50 border-border text-foreground"],
	["bg-slate-900 border-slate-600 text-white", "bg-card border-slate-200 text-slate-900", "bg-card border-border text-foreground"],
	["bg-slate-800 border-slate-700 text-slate-300", "bg-card border-slate-200 text-slate-700", "bg-card border-border text-foreground"],
	["border-slate-700 bg-slate-800/60 text-slate-300", "border-slate-200 bg-card text-slate-700", "border-border bg-card text-foreground"],
	["bg-slate-800 text-slate-400 border-slate-700", "bg-card text-slate-500 border-slate-200", "bg-card text-muted-foreground border-border"],
	["bg-slate-800 text-slate-400 border-slate-700", "bg-slate-100 text-slate-400 border-slate-200", "bg-muted text-muted-foreground border-border"],
	["bg-slate-800 text-slate-200 border border-slate-700", "bg-card text-slate-700 border border-slate-200", "bg-card text-foreground border border-border"],
	[
		"bg-slate-800/50 text-slate-400 hover:text-white border-slate-700",
		"bg-card text-slate-500 hover:text-slate-700 border-slate-200",
		"bg-card text-muted-foreground hover:text-foreground border-border",
	],
	[
		"bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-500 hover:bg-slate-750",
		"bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-100",
		"bg-muted/50 border-border text-foreground hover:bg-muted",
	],
	[
		"border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800",
		"border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100",
		"border-border bg-muted/50 hover:bg-muted",
	],
	[
		"border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white",
		"border-slate-200 text-slate-500 hover:bg-slate-100",
		"border-border text-muted-foreground hover:bg-muted hover:text-foreground",
	],
	[
		"hover:bg-slate-800 text-slate-400 border-transparent",
		"bg-card border-slate-200 text-slate-600 hover:bg-slate-100",
		"border-border text-muted-foreground hover:bg-muted",
	],
	[
		"bg-slate-950 text-slate-400 hover:bg-slate-800 border-slate-700",
		"bg-slate-100 text-slate-500 hover:bg-slate-200 border-slate-300",
		"bg-muted text-muted-foreground hover:bg-muted/70 border-border",
	],
	["bg-slate-950 border-slate-700 text-slate-400", "bg-slate-100 border-slate-300 text-slate-500", "bg-muted border-border text-muted-foreground"],
	["bg-blue-600/20 text-blue-400 font-semibold", "bg-blue-50 text-blue-600 font-semibold", "bg-accent text-accent-foreground font-semibold"],

	// ── Estado ────────────────────────────────────────────────────────────────
	["text-red-400", "text-red-600", "text-destructive"],
	["text-emerald-400", "text-emerald-600", "text-success"],
	["text-emerald-400", "text-emerald-700", "text-success"],
	["text-emerald-300", "text-emerald-800", "text-success"],
	["text-blue-400", "text-blue-600", "text-(--color-series-siafi)"],
	["text-sky-400", "text-sky-600", "text-(--color-series-siloms)"],
	["border-red-500/40 bg-red-500/10 text-red-200", "border-red-300 bg-red-50 text-red-800", "border-destructive/30 bg-destructive/10 text-destructive"],
	["border-amber-500/40 bg-amber-500/10 text-amber-200", "border-amber-300 bg-amber-50 text-amber-800", "border-warning/30 bg-warning/10 text-warning"],
	["bg-emerald-900/20 border-emerald-500/30", "bg-emerald-50 border-emerald-200", "bg-success/10 border-success/30"],
	[
		"bg-red-500/5 border-red-500/20 hover:bg-red-500/10",
		"bg-red-50/30 border-red-100 hover:bg-red-50/50",
		"bg-destructive/5 border-destructive/20 hover:bg-destructive/10",
	],
	[
		"bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10",
		"bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50",
		"bg-success/5 border-success/20 hover:bg-success/10",
	],
	[
		"bg-red-500/20 text-red-400 border-red-500/30 border shadow-[0_0_5px_rgba(220,38,38,0.2)]",
		"bg-red-50 text-red-700 border-red-200 border shadow-sm",
		"bg-destructive/15 text-destructive border-destructive/30 border",
	],
	[
		"bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border shadow-[0_0_5px_rgba(16,185,129,0.2)]",
		"bg-emerald-50 text-emerald-700 border-emerald-200 border shadow-sm",
		"bg-success/15 text-success border-success/30 border",
	],
	[
		"bg-blue-500/20 text-blue-400 border-blue-500/30 border shadow-[0_0_5px_rgba(37,99,235,0.2)]",
		"bg-blue-50 text-blue-700 border-blue-200 border shadow-sm",
		"bg-accent text-accent-foreground border-border border",
	],

	// ── Raiz da rota ──────────────────────────────────────────────────────────
	// A classe `dark` deixa de ir para o <html> e passa a ser aplicada aqui — a
	// variante do projeto é `&:is(.dark *)`, então qualquer ancestral serve. Uma
	// rota não troca mais o tema do app inteiro.
	["dark bg-[#020617] text-slate-100", "bg-slate-50 text-slate-900", "bg-background text-foreground"],

	// ── Texto sobre superfície da própria cor ─────────────────────────────────
	["text-white border-slate-700", "text-slate-900 border-slate-200", "text-foreground border-border"],
]

/** `expr` é hex (vai para atributo SVG) ou lista de classes (vai para className)? */
const isHexPair = (dark: string) => dark.startsWith("#")

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry)
		if (statSync(full).isDirectory()) return walk(full)
		return full.endsWith(".tsx") ? [full] : []
	})
}

const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

let replaced = 0
const unmatched = new Map<string, number>()

for (const file of walk(SRC)) {
	const original = readFileSync(file, "utf8")
	if (!original.includes("isDarkMode")) continue

	let next = original
	for (const [dark, light, to] of PAIRS) {
		// `isDarkMode ? "<dark>" : "<light>"` → token. Dentro de template string o
		// resultado é literal; num atributo SVG vira a expressão do theme.
		const pattern = new RegExp(`isDarkMode\\s*\\?\\s*"${escapeRe(dark)}"\\s*:\\s*"${escapeRe(light)}"`, "g")
		next = next.replace(pattern, () => {
			replaced++
			return isHexPair(dark) ? `__EXPR__${to}` : `__LIT__${to}`
		})
	}

	// `${__LIT__x}` dentro de template → texto puro. `{__EXPR__x}` → expressão.
	next = next.replace(/\$\{__LIT__([^}]*)\}/g, "$1")
	next = next.replace(/__LIT__/g, "")
	next = next.replace(/__EXPR__/g, "")

	if (next !== original) writeFileSync(file, next)

	for (const m of next.matchAll(/isDarkMode\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/g)) {
		unmatched.set(`${m[1]}  |  ${m[2]}`, (unmatched.get(`${m[1]}  |  ${m[2]}`) ?? 0) + 1)
	}
}

console.log(`${replaced} ternários resolvidos`)
if (unmatched.size > 0) {
	console.log(`\nPares sem mapeamento (${unmatched.size}) — resolver à mão:`)
	for (const [pair, n] of unmatched) console.log(`  ${n}x  ${pair}`)
}
if (DRY) console.log("\n(dry-run não implementado: rode em branch limpa e use git diff)")
