/**
 * Migração única: tipografia crua → classes semânticas do STYLE_CONTRACT §4.3.
 *
 * Não faz parte do build. Fica no repo porque o número que ele produz é a
 * verificação da migração: rodar de novo em código já migrado não deve mudar
 * nada.
 *
 * Regra: um `className` que traga tamanho de texto tem os tokens de tamanho,
 * peso, tracking e uppercase REMOVIDOS e substituídos por um único nível
 * semântico. Cor não é tocada — o contrato exige que ela seja composta por fora
 * (`text-foreground` / `text-muted-foreground`), e por isso `text-<cor>` nunca
 * casa com o padrão de tamanho.
 */
import { readFileSync, writeFileSync } from "node:fs"

/** Tamanhos brutos do Tailwind e o piso semântico de cada um. */
const SIZE_TO_LEVEL = {
	"text-[8px]": "hint",
	"text-[9px]": "hint",
	"text-[10px]": "hint",
	"text-[11px]": "hint",
	"text-xs": "caption",
	"text-sm": "body",
	"text-base": "body",
	"text-lg": "heading",
	"text-xl": "heading",
	"text-2xl": "display",
	"text-3xl": "display",
	"text-4xl": "display",
	"text-5xl": "display",
	"text-6xl": "display",
	"text-7xl": "display",
}

const WEIGHT = {
	"font-thin": 100,
	"font-light": 300,
	"font-normal": 400,
	"font-medium": 500,
	"font-semibold": 600,
	"font-bold": 700,
	"font-extrabold": 800,
	"font-black": 900,
}

const TRACKING = /^tracking-(tighter|tight|normal|wide|wider|widest)$/
const IS_SIZE = (t) => Object.hasOwn(SIZE_TO_LEVEL, t)
const IS_WEIGHT = (t) => Object.hasOwn(WEIGHT, t)

/**
 * Nível semântico de um conjunto de tokens.
 *
 * `uppercase` puxa para `label` quando o tamanho é pequeno: é a assinatura do
 * rótulo de seção/`<th>`/badge no contrato. Em tamanho grande, uppercase é
 * decisão de caixa e não muda o nível.
 */
function levelFor(size, weight, upper) {
	const base = SIZE_TO_LEVEL[size]
	if (upper && (base === "caption" || base === "hint" || base === "body")) return "label"
	if (base === "body") {
		if (size === "text-base" && weight >= 600) return "heading"
		if (weight >= 500) return "subheading"
		return "body"
	}
	// `.text-label` EMBUTE caixa alta. Promover `text-xs font-bold` a label só
	// porque é pequeno e pesado reescreveria o texto: "12 UGs" virava "12 UGS".
	// Sem `uppercase` no original, texto pequeno é `caption` — e o peso se perde,
	// que é o que o §4.3 quer (quem escolhe peso é o nível, não a feature).
	return base
}

function migrateClassString(value) {
	const tokens = value.split(/(\s+)/)
	const words = tokens.filter((t) => t.trim() !== "")

	const size = words.find(IS_SIZE)
	if (!size) return { value, changed: 0 }

	// Dois tamanhos no mesmo `className` (ex.: `text-sm md:text-base`) são decisão
	// responsiva, não a mistura que a migração resolve. Sai intocado, para revisão
	// humana — trocar por um nível só apagaria o breakpoint.
	if (words.filter(IS_SIZE).length > 1) return { value, changed: 0 }

	const weightToken = words.find(IS_WEIGHT)
	const weight = weightToken ? WEIGHT[weightToken] : 400
	const upper = words.includes("uppercase")
	const level = levelFor(size, weight, upper)
	const replacement = `text-${level}`

	let inserted = false
	const out = tokens.map((t) => {
		if (t.trim() === "") return t
		if (IS_SIZE(t)) {
			inserted = true
			return replacement
		}
		if (IS_WEIGHT(t) || TRACKING.test(t)) return ""
		// `uppercase` só some quando o nível já a embute (`.text-label`).
		if (t === "uppercase" && level === "label") return ""
		return t
	})

	if (!inserted) return { value, changed: 0 }
	const cleaned = out.join("").replace(/\s+/g, " ").trim()
	return { value: cleaned, changed: cleaned === value ? 0 : 1 }
}

/**
 * Utilitárias de palavra única — as que não têm hífen nem variante e por isso não
 * dão para distinguir de prosa pela forma.
 */
const BARE_UTILITIES = new Set([
	"absolute",
	"block",
	"border",
	"capitalize",
	"fixed",
	"flex",
	"grid",
	"group",
	"hidden",
	"inline",
	"invisible",
	"italic",
	"relative",
	"resize",
	"rounded",
	"shadow",
	"sticky",
	"static",
	"table",
	"transform",
	"transition",
	"truncate",
	"underline",
	"uppercase",
	"lowercase",
	"visible",
])

/**
 * O texto é uma lista de classes utilitárias?
 *
 * A primeira versão desta função rejeitava qualquer string com `:`, `(` ou `[`
 * para não reescrever prosa — e assim rejeitava TODA classe com variante
 * (`hover:`, `md:`, `data-[size=default]:`), que é a maioria delas. Passaram 625
 * de ~1.050. A distinção certa é morfológica: token de utilitária tem hífen,
 * variante ou está na lista acima; palavra de prosa não tem nenhum dos três.
 */
function looksLikeClassList(body) {
	const words = body.split(/\s+/).filter(Boolean)
	if (words.length === 0) return false
	return words.every((w) => {
		if (BARE_UTILITIES.has(w)) return true
		// Marcador de interpolação já mascarada.
		if (w.includes("__hole")) return true
		return /^[!a-z0-9]/i.test(w) && /[-:]/.test(w) && !/[À-ÿ]/.test(w)
	})
}

/**
 * Percorre o conteúdo de cada string do arquivo, aplicando só onde ela é
 * reconhecidamente uma lista de classes. Uma varredura solta reescreveria texto
 * de comentário e conteúdo de UI.
 */
function migrateFile(path) {
	const src = readFileSync(path, "utf8")
	let count = 0

	// Aspas simples/duplas não atravessam linha; template literal atravessa, e é
	// justamente nele que moram as classes condicionais (`${ativo ? … : …}`) das
	// telas de segmento e badge. Sem o caso multilinha, 29 classes ficavam de fora.
	const out = src.replace(/(["'])((?:[^"'\\\n]|\\.)*)\1|`((?:[^`\\]|\\.)*)`/g, (match, quote, quoted, templated) => {
		const body = quote ? quoted : templated
		if (!/(?:^|\s)text-(?:xs|sm|base|lg|xl|\dxl|\[\d+px\])(?:$|\s)/.test(` ${body} `)) return match

		// As interpolações saem de cena antes da análise: `${a ? "x" : "y"}` contém
		// pontuação e aspas que nada têm a ver com a lista de classes ao redor, e a
		// própria interpolação pode trazer classes que este passe já migrou.
		const holes = []
		const masked = body.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, (hole) => {
			holes.push(hole)
			return `__hole${holes.length - 1}__`
		})
		if (!looksLikeClassList(masked)) return match

		const { value, changed } = migrateClassString(masked)
		if (changed === 0) return match
		count += changed
		const restored = value.replace(/__hole(\d+)__/g, (_, i) => holes[Number(i)])
		return quote ? `${quote}${restored}${quote}` : `\`${restored}\``
	})

	if (count > 0) writeFileSync(path, out)
	return count
}

/**
 * Segundo passe: `font-*` / `tracking-*` / `uppercase` convivendo com uma classe
 * semântica no MESMO `className`.
 *
 * São violação direta do §4.3 — o nível semântico já define peso e tracking, e o
 * token cru briga com ele. `uppercase` só sai de `display`/`heading`: no
 * `.text-label` a caixa alta já vem embutida, e em `<th>`/badge é a assinatura do
 * nível. Peso e família de fonte (`font-mono`, `font-serif`) não são tocados
 * aqui — família não é peso.
 */
const SEMANTIC = /(?:^|\s)text-(display|heading|subheading|body|label|caption|hint)(?:$|\s)/

function stripRedundant(path) {
	const src = readFileSync(path, "utf8")
	let count = 0

	const out = src.replace(/(["'])((?:[^"'\\\n]|\\.)*)\1|`((?:[^`\\]|\\.)*)`/g, (match, quote, quoted, templated) => {
		const body = quote ? quoted : templated
		const level = SEMANTIC.exec(` ${body} `)?.[1]
		if (!level) return match

		const words = body.split(/(\s+)/)
		let touched = false
		const kept = words.map((w) => {
			if (w.trim() === "") return w
			if (IS_WEIGHT(w) || TRACKING.test(w) || /^tracking-\[[^\]]+\]$/.test(w)) {
				touched = true
				return ""
			}
			if (w === "uppercase" && (level === "display" || level === "heading" || level === "subheading")) {
				touched = true
				return ""
			}
			return w
		})
		if (!touched) return match
		count += 1
		const cleaned = kept.join("").replace(/\s+/g, " ").trim()
		return quote ? `${quote}${cleaned}${quote}` : `\`${cleaned}\``
	})

	if (count > 0) writeFileSync(path, out)
	return count
}

let total = 0
for (const path of process.argv.slice(2)) {
	const n = migrateFile(path) + stripRedundant(path)
	if (n > 0) {
		total += n
		console.log(`${n}\t${path}`)
	}
}
console.log(`\ntotal: ${total} className migrados`)
