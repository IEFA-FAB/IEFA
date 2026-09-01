/**
 * Migração única: paleta institucional FAB usada como CROMO → token semântico.
 *
 * O §4.1 do contrato admite a família `fab-*` como token legítimo — ela é a
 * identidade institucional. O que ela não é: a folha de estilo de uma ferramenta.
 * Três telas (`subitens-genericos`, `conta-generica`, `analista-compatibilidade`)
 * pintavam TUDO com ela — texto de corpo, borda de painel, fundo de ícone, anel
 * de foco — enquanto as outras nove usavam a escala semântica. Permitido não é o
 * mesmo que coerente: era isso que fazia essas três parecerem outro produto.
 *
 * O que sobrevive à migração: `fab-*` onde ele é MARCA — o ofício A4
 * (`plataforma-doc/fab-document.tsx`, fora deste passe) e as rampas de dado, que
 * o §8 já registra como exceção.
 *
 *   node scripts/migrate-fab-chrome.mjs <arquivos...>
 */
import { readFileSync, writeFileSync } from "node:fs"

/**
 * Mapa de cromo. A ordem importa: as chaves mais longas vêm primeiro para que
 * `text-fab-blue/40` não seja capturado pela regra de `text-fab-blue`.
 */
const CHROME = [
	// ── Texto ────────────────────────────────────────────────────────────────
	// Azul institucional em texto de corpo é a cor do texto, não a da marca.
	["text-fab-blue/70", "text-muted-foreground"],
	["text-fab-blue/60", "text-muted-foreground"],
	["text-fab-blue/40", "text-muted-foreground"],
	["text-fab-blue/30", "text-muted-foreground"],
	["text-fab-sky/60", "text-surface-inverted-muted"],
	["text-fab-blue", "text-foreground"],
	["text-fab-dark", "text-foreground"],
	["text-fab-900", "text-foreground"],
	["text-fab-800", "text-foreground"],
	["text-fab-700", "text-action"],
	["text-fab-600", "text-action"],
	["text-fab-500", "text-action"],
	// Sobre superfície invertida, o texto claro é o da própria superfície.
	["text-fab-sky", "text-surface-inverted-foreground"],
	// Ouro marcava ênfase; a ênfase do hub é `warning`.
	["text-fab-gold/60", "text-warning"],
	["text-fab-gold", "text-warning"],

	// ── Fundo ────────────────────────────────────────────────────────────────
	["bg-fab-blue/10", "bg-action/10"],
	["bg-fab-blue/5", "bg-action/5"],
	["bg-fab-gold/20", "bg-warning/20"],
	["bg-fab-gold/10", "bg-warning/10"],
	["bg-fab-gold", "bg-warning"],
	["bg-fab-sky/50", "bg-muted"],
	["bg-fab-sky/30", "bg-muted/50"],
	["bg-fab-sky", "bg-muted"],
	// Disco/painel escuro: a superfície invertida do hub.
	["bg-fab-dark", "bg-surface-inverted"],
	["bg-fab-blue", "bg-tech-blue"],
	["bg-fab-light-blue", "bg-tech-blue"],
	["bg-fab-950", "bg-surface-inverted"],
	["bg-fab-900", "bg-surface-inverted"],
	["bg-fab-700", "bg-action"],
	["bg-fab-600", "bg-action"],
	["bg-fab-500", "bg-action"],
	["bg-fab-100", "bg-muted"],
	["bg-fab-50", "bg-muted/50"],

	// ── Borda e anel ─────────────────────────────────────────────────────────
	["border-fab-blue/30", "border-border"],
	["border-fab-blue/20", "border-border"],
	["border-fab-blue/10", "border-border"],
	["border-fab-blue/5", "border-border"],
	["border-fab-blue", "border-tech-blue"],
	["border-fab-gold/40", "border-warning/40"],
	["border-fab-gold/30", "border-warning/30"],
	["border-fab-gold", "border-warning"],
	["border-fab-100", "border-border"],
	["border-fab-500", "border-ring"],
	["ring-fab-blue/20", "ring-ring/20"],
	["ring-fab-500", "ring-ring"],
	["focus:border-fab-gold", "focus:border-ring"],

	// ── Hover ────────────────────────────────────────────────────────────────
	["hover:bg-fab-dark", "hover:bg-surface-inverted"],
	["hover:bg-fab-light-blue", "hover:bg-tech-blue/90"],
	["hover:bg-fab-blue", "hover:bg-tech-blue"],
	["hover:bg-fab-gold", "hover:bg-warning"],
	["hover:bg-fab-700", "hover:bg-action/90"],
	["hover:bg-fab-100", "hover:bg-muted"],
	["hover:bg-fab-50", "hover:bg-muted/50"],
	["hover:text-fab-blue", "hover:text-foreground"],
	["hover:text-fab-gold", "hover:text-warning"],
	["hover:border-fab-gold", "hover:border-warning"],
	["hover:border-fab-blue/40", "hover:border-border"],
	["hover:border-fab-blue", "hover:border-tech-blue"],
]

/** Profundidade artificial e a faixa dourada de topo — nenhuma outra tela tem. */
const DROP = [
	/\bborder-t-4 border-t-fab-gold\/50\s?/g,
	/\bborder-t-4 border-t-fab-gold\s?/g,
	/\bshadow-inner\s?/g,
	/\bshadow-2xl shadow-fab-blue\/5\s?/g,
	/\bshadow-lg shadow-fab-blue\/5\s?/g,
]

let total = 0
for (const path of process.argv.slice(2)) {
	const src = readFileSync(path, "utf8")
	let out = src

	for (const re of DROP) out = out.replace(re, "")

	for (const [from, to] of CHROME) {
		// `(?![\w/-])` impede que `bg-fab-blue` engula `bg-fab-blue/5` e que
		// `bg-fab-50` engula `bg-fab-500`.
		out = out.replace(new RegExp(`\\b${from.replace(/[/\\]/g, "\\$&")}(?![\\w/-])`, "g"), to)
	}

	if (out !== src) {
		const before = (src.match(/fab-[a-z0-9]+/g) ?? []).length
		const after = (out.match(/fab-[a-z0-9]+/g) ?? []).length
		total += before - after
		writeFileSync(path, out)
		console.log(`${String(before - after).padStart(4)}  ${path}`)
	}
}
console.log(`\n${total} classes de cromo institucional trocadas por token semântico`)
