/**
 * HTML de norma → texto normalizado.
 *
 * Cobre as duas origens que respondem de fato: o Planalto (lei e decreto) e o
 * DOU/in.gov.br (instrução normativa). O HTML do Planalto é gerado pelo
 * FrontPage e fragmenta o texto em `<span>`/`<font>` no meio das frases — por
 * isso a normalização achata tudo num fluxo único e a segmentação por
 * dispositivo acontece depois, sobre o texto, não sobre as tags.
 */

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const TAG = /<[^>]+>/g

const ENTITIES: Record<string, string> = {
	"&nbsp;": " ",
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
	"&ldquo;": '"',
	"&rdquo;": '"',
	"&aacute;": "á",
	"&eacute;": "é",
	"&iacute;": "í",
	"&oacute;": "ó",
	"&uacute;": "ú",
	"&acirc;": "â",
	"&ecirc;": "ê",
	"&ocirc;": "ô",
	"&atilde;": "ã",
	"&otilde;": "õ",
	"&ccedil;": "ç",
	"&ordm;": "º",
	"&ordf;": "ª",
	"&sect;": "§",
}

/** Aspas curvas do Word em codificação Windows-1252, comuns no Planalto. */
const SMART_QUOTES = /[\u201c\u201d\u2018\u2019\u0093\u0094]/g

function decodeEntities(value: string): string {
	return value
		.replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

/**
 * Decodifica os bytes da página respeitando o charset declarado.
 *
 * O Planalto serve `windows-1252`; ler como UTF-8 corrompe todo "º" e "ç", que
 * são justamente os caracteres dos rótulos de dispositivo ("Art. 6º").
 */
export function decodeHtml(bytes: Uint8Array): string {
	const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 4096))
	const declared = /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase()

	if (declared) {
		try {
			// O tipo do `label` é uma união fechada de encodings conhecidos, mas o
			// valor vem do HTML e pode ser qualquer coisa — o construtor lança em
			// charset inválido, que é o caso tratado abaixo.
			return new TextDecoder(declared as ConstructorParameters<typeof TextDecoder>[0]).decode(bytes)
		} catch {
			// charset declarado inválido — cai na detecção abaixo
		}
	}

	// A página da Lei 14.133 no Planalto não declara charset e é windows-1252.
	// Decodificar em modo estrito é o que distingue os dois casos: UTF-8 válido
	// passa, byte isolado de 1252 (o "º" de "Art. 6º") lança.
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
	} catch {
		return new TextDecoder("windows-1252").decode(bytes)
	}
}

export function htmlToNormalizedText(html: string): string {
	return decodeEntities(html.replace(SCRIPT_OR_STYLE, " ").replace(TAG, " ")).replace(SMART_QUOTES, '"').replace(/ /g, " ").replace(/\s+/g, " ").trim()
}
