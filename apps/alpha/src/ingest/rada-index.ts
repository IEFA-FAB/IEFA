/**
 * @module rada-index
 * Leitura do índice do RADA-e publicado pela DIREF na intranet do COMAER.
 *
 * O RADA-e é o Regulamento de Administração da Aeronáutica em forma eletrônica: uma
 * portaria do GABAER e quinze manuais, de A a O. A página da DIREF é o índice oficial —
 * e é ela que decide o que está em vigor, não esta lista.
 *
 * Por isso o parser NÃO tem os módulos escritos no código: ele lê o que a página publica.
 * O que o código guarda é o piso de sanidade — se a página passar a devolver menos módulos
 * do que o regulamento tem, é mudança de layout ou página quebrada, e cair alto é melhor
 * do que ingerir um corpus pela metade sem ninguém perceber. Mesmo raciocínio do
 * `MIN_EXPECTED_MODELS` do adapter da AGU.
 *
 * Este módulo é PURO: recebe HTML, devolve estrutura. Rede fica no CLI, o que permite
 * testar a leitura com uma fixture e sem intranet.
 */

/** Um módulo do RADA-e, como o índice o apresenta. */
export interface RadaModule {
	/** Letra do módulo, `A` a `O`. */
	letter: string
	/** Título como publicado, sem o prefixo da letra. */
	title: string
	/** URL absoluta do destino — pode ser um PDF ou a página de outro sistema. */
	url: string
}

/**
 * Piso de sanidade. O RADA-e tem 15 manuais (A–O); a página devolver menos significa
 * layout alterado ou publicação incompleta, e não "o regulamento encolheu".
 */
export const MIN_EXPECTED_MODULES = 15

// Aceita aspas simples e duplas: o índice usa duplas hoje, mas o gerador do portal não
// garante isso, e uma troca de aspas viraria "nenhum módulo encontrado".
const MODULE_ANCHOR = /<a[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
/** `A - Manual...`, `A – Manual...`, com ou sem espaço. Aceita só a faixa A–O. */
const MODULE_LABEL = /^([A-O])\s*[-–—]\s*(.+)$/

const HTML_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&apos;": "'",
	"&nbsp;": " ",
}

function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
		.replace(/&[a-z]+;|&#\d+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
}

function visibleText(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim()
}

/**
 * Extrai os módulos do HTML do índice.
 *
 * Duplicata de letra fica com a PRIMEIRA ocorrência: a página repete alguns links no menu
 * lateral, e o corpo do artigo vem antes.
 *
 * @param html - HTML bruto da página de índice
 * @param baseUrl - URL da própria página, para resolver href relativo
 */
export function parseRadaIndex(html: string, baseUrl: string): RadaModule[] {
	const byLetter = new Map<string, RadaModule>()

	for (const match of html.matchAll(MODULE_ANCHOR)) {
		const href = match[1] ?? match[2]
		const label = MODULE_LABEL.exec(visibleText(match[3]))
		if (!href || !label) continue

		const letter = label[1].toUpperCase()
		if (byLetter.has(letter)) continue

		byLetter.set(letter, {
			letter,
			title: label[2].trim(),
			url: new URL(decodeEntities(href), baseUrl).toString(),
		})
	}

	return [...byLetter.values()].sort((a, b) => a.letter.localeCompare(b.letter))
}

/**
 * Erro de leitura do índice, separado de erro de rede: aqui a página respondeu, mas o que
 * veio não se parece com o índice do RADA-e.
 */
export class RadaIndexError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "RadaIndexError"
	}
}

/** Aplica o piso de sanidade e devolve os módulos, ou lança dizendo o que veio. */
export function requireCompleteIndex(modules: RadaModule[]): RadaModule[] {
	if (modules.length < MIN_EXPECTED_MODULES) {
		const found = modules.map((m) => m.letter).join(", ") || "nenhum"
		throw new RadaIndexError(
			`índice do RADA-e devolveu ${modules.length} módulos, esperado ao menos ${MIN_EXPECTED_MODULES} (achados: ${found}). ` +
				"Layout da página mudou ou a publicação está incompleta — conferir antes de ingerir."
		)
	}
	return modules
}
