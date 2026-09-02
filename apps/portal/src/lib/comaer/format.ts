/**
 * @module comaer/format
 * Formatadores puros da NSCA 5-3/2026, Anexo I. Sem React, sem I/O — cada função
 * responde por um artigo, para que a regra possa ser testada contra o texto da norma.
 */

import { isGeneralOfficer, quadroInFull, rankInFull } from "./ranks"
import type { Addressing, Classification, Line, Numbering, Paragraph, Party, Precedence, Scope, Signer } from "./types"

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] as const

/**
 * Art. 12 § 4º — data por extenso, usada nos textos externos.
 * Sem zero à esquerda ("3 de setembro", não "03") e com ordinal no primeiro dia do mês.
 * Os modelos de epígrafe da própria norma escrevem "03 de julho"; o artigo é explícito em
 * sentido contrário, e é ele que vale.
 */
export function dateInFull(date: Date): string {
	const day = date.getDate()
	return `${day === 1 ? "1º" : day} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`
}

export type ShortDateStyle = "ponto" | "barra" | "mes" | "mes-maiusculo"

/** Art. 12 § 5º — formas abreviadas admitidas em texto interno. Maio nunca é abreviado. */
export function shortDate(date: Date, style: ShortDateStyle = "mes"): string {
	const day = String(date.getDate()).padStart(2, "0")
	const year = date.getFullYear()
	if (style === "ponto" || style === "barra") {
		const month = String(date.getMonth() + 1).padStart(2, "0")
		return [day, month, String(year)].join(style === "ponto" ? "." : "/")
	}
	const name = MONTHS[date.getMonth()]
	// "excetuando-se o mês de maio, que é escrito sempre por extenso"
	const abbreviated = name === "maio" ? name : `${name.slice(0, 3)}.`
	return style === "mes-maiusculo" ? `${day} ${abbreviated.replace(".", "").toUpperCase()} ${year}` : `${day} ${abbreviated} ${year}`
}

/** NUP / Protocolo COMAER: 17 dígitos. Entrada já mascarada ou crua. */
export function formatNup(entry: string): string {
	const digits = entry.replace(/\D/g, "")
	if (digits.length !== 17) return entry.trim()
	return `${digits.slice(0, 5)}.${digits.slice(5, 11)}/${digits.slice(11, 15)}-${digits.slice(15)}`
}

export function isValidNup(entry: string): boolean {
	return entry.replace(/\D/g, "").length === 17
}

const CLASSIFICATION_PREFIX: Record<Classification, string> = { ostensivo: "", reservado: "R-", secreto: "S-", ultrassecreto: "US-" }

/** Escopo da linha de numeração — muda com a espécie e com o âmbito (art. 31 e art. 51 § 5º). */
export type NumberingScope = "completa" | "interna" | "parecer" | "nenhuma"

/**
 * Art. 31 — `Ofício nº 34/GAB/255`; com sigilo, `Ofício R-34/GAB/255` (a norma troca o
 * "nº" pelo prefixo do grau, não o acumula). No trâmite interno à OM a numeração é só
 * sequencial e setor (art. 51 § 5º, I, d), e o assunto de interesse particular recebe
 * "s/nº" (art. 51 § 6º e § 7º, b).
 */
export function numberingLine(
	kind: string,
	numbering: Numbering,
	classification: Classification = "ostensivo",
	numberingScope: NumberingScope = "completa"
): string {
	if (numberingScope === "nenhuma") return ""
	// O Despacho já se numera por "Nº 183/GABGEP/2377" (art. 48 § 3º, II, d): tratar o
	// rótulo como ordinal aqui e no fim evita tanto "Nº nº 183" quanto "Nº s/nº".
	const rotuloOrdinal = kind.trim() === "Nº"
	if (numbering.sequence === null) {
		// Art. 51 § 6º: "s/nº" no lugar do sequencial. O grau de sigilo não prefixa este
		// caso — o art. 31 § 2º define o prefixo sobre um sequencial, e não há sequencial.
		return rotuloOrdinal ? "s/nº" : `${kind} s/nº`
	}
	const parts: string[] = [String(numbering.sequence)]
	if (numberingScope === "parecer") {
		if (numbering.organizationNumber) parts.push(numbering.organizationNumber)
		parts.push(String(numbering.year ?? new Date().getFullYear()))
	} else {
		if (numbering.sector) parts.push(numbering.sector)
		if (numberingScope === "completa" && numbering.organizationNumber) parts.push(numbering.organizationNumber)
	}
	const body = parts.join("/")
	const prefix = CLASSIFICATION_PREFIX[classification]
	if (rotuloOrdinal) return `Nº ${prefix}${body}`
	return prefix ? `${kind} ${prefix}${body}` : `${kind} nº ${body}`
}

/** Art. 21 § 3º — A…Z e, esgotado o alfabeto, letras dobradas (AA, AB…). */
export function annexLetter(index: number): string {
	const letra = (n: number) => String.fromCharCode(65 + n)
	if (index < 26) return letra(index)
	return letra(Math.floor(index / 26) - 1) + letra(index % 26)
}

/**
 * Art. 37 § 2º, III e V — itens de referência e de anexo: ponto e vírgula em todos,
 * "; e" no penúltimo, ponto final no último.
 */
export function formatEnumeration(items: string[], marker: (index: number) => string): string[] {
	const cleaned = items.map((t) => t.trim().replace(/[;.]+$/, "")).filter((t) => t.length > 0)
	return cleaned.map((text, i) => {
		const ending = i === cleaned.length - 1 ? "." : i === cleaned.length - 2 ? "; e" : ";"
		return `${marker(i)} ${text}${ending}`
	})
}

/**
 * Art. 30 — o fecho de cortesia só existe quando o destinatário é externo ao COMAER.
 * Entre OM do COMAER, o parágrafo único proíbe: devolver "Atenciosamente" aqui seria
 * inserir no documento uma linha que a norma manda não existir.
 */
export function courtesyClosing(scope: Scope, precedence: Precedence = "igual"): string | null {
	if (scope !== "externo") return null
	return precedence === "superior" ? "Respeitosamente," : "Atenciosamente,"
}

function joinWithAnd(items: string[]): string {
	if (items.length <= 1) return items[0] ?? ""
	return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`
}

/** Art. 36 — preâmbulo pelo CARGO; "via" quando há autoridade intermediária. */
export function preambuloLines(sender: Party | undefined, rawRecipients: Party[]): string[] {
	const lines: string[] = []
	// Parte sem cargo não vira linha: "Do" sozinho no preâmbulo é o tipo de sobra que se
	// copia para o SIGADAER sem ninguém reler.
	const recipients = rawRecipients.filter((d) => d.position.trim() !== "")
	if (sender?.position.trim()) lines.push(`${sender.gender === "f" ? "Da" : "Do"} ${sender.position}`)
	if (recipients.length === 1) {
		const d = recipients[0]
		lines.push(`${d.gender === "f" ? "À" : "Ao"} ${d.position}${d.via ? `, via ${d.via}` : ""}`)
	} else if (recipients.length > 1) {
		// Art. 36, parágrafo único, I: siglas em ordem de antiguidade, vírgula entre elas e
		// "e" antes da última. A ordem vem de quem preenche — a norma não a deriva de nada
		// que o app conheça, e reordenar sozinho seria inventar antiguidade.
		const plural = recipients.every((d) => d.gender === "f") ? "Às" : "Aos"
		lines.push(`${plural} ${joinWithAnd(recipients.map((d) => d.position))}`)
	}
	return lines
}

/** Art. 51 § 9º, VIII — bloco de endereçamento do ofício externo. */
export function addressingLines(e: Addressing): string[] {
	const artigo = e.gender === "f" ? "a Senhora" : "o Senhor"
	const lines = [`A Sua ${e.formOfAddress === "excelencia" ? "Excelência" : "Senhoria"} ${artigo}`]
	if (e.name) lines.push(e.name.toUpperCase())
	if (e.position) lines.push(e.position)
	for (const l of e.addressLines ?? []) lines.push(l)
	return lines
}

/** Art. 10 — vocativo: "Senhor" + cargo, salvo tratamento especial. */
export function defaultVocativo(e: Addressing | undefined): string {
	if (!e) return "Senhor,"
	const pronome = e.gender === "f" ? "Senhora" : "Senhor"
	return e.position ? `${pronome} ${e.position},` : `${pronome},`
}

/**
 * Art. 40 — identificação do signatário.
 * Oficial-General leva o posto ANTES do nome; os demais, depois. Documento externo grafa
 * posto, quadro, cargo e OM por extenso (art. 26 e art. 40 § 2º).
 */
export function signerIdentification(s: Signer, scope: Scope): string[] {
	const externo = scope === "externo"
	const buildRankLabel = (rank?: string, quadro?: string) =>
		[rank ? (externo ? rankInFull(rank) : rank) : "", quadro ? (externo ? quadroInFull(quadro) : quadro) : ""].filter(Boolean).join(" ")

	const rankLabel = buildRankLabel(s.rank, s.quadro)
	const name = s.name.toUpperCase()
	const main = s.rank && isGeneralOfficer(s.rank) ? [rankLabel, name].filter(Boolean).join(" ") : [name, rankLabel].filter(Boolean).join(" ")

	const positionLine = (() => {
		if (!s.position && !s.om) return null
		if (!s.position) return s.om ?? null
		if (!s.om || s.position.toLowerCase().includes(s.om.toLowerCase())) return s.position
		return `${s.position} - ${s.om}`
	})()

	// Art. 40 § 7º: o substituto assina ACIMA do nome da autoridade substituída, e o cargo
	// aparece só sob a substituída.
	if (s.noImp) {
		const substitute = (() => {
			const p = buildRankLabel(s.noImp.rank, s.noImp.quadro)
			const n = s.noImp.name.toUpperCase()
			return s.noImp.rank && isGeneralOfficer(s.noImp.rank) ? [p, n].filter(Boolean).join(" ") : [n, p].filter(Boolean).join(" ")
		})()
		return [`No Imp ${main}`, ...(positionLine ? [positionLine] : []), substitute]
	}

	return [main, ...(positionLine ? [positionLine] : [])]
}

/** Art. 40 § 9º — o texto do documento assinado por ordem tem abertura obrigatória. */
export const BY_ORDER_OPENINGS = ["Por ordem d", "Incumbiu-me "] as const

export function hasByOrderOpening(primeiroParagrafo: string): boolean {
	return BY_ORDER_OPENINGS.some((abertura) => primeiroParagrafo.trimStart().startsWith(abertura))
}

/**
 * Art. 39 — divisões do texto: parágrafo (1.), item (1.1), alínea (a) e subalínea (-).
 * Documento de parágrafo único dispensa a numeração (art. 39, parágrafo único, I).
 */
export function renderDivisions(paragraphs: Paragraph[], shouldNumber = true): Line[] {
	const lines: Line[] = []
	// Art. 39, parágrafo único, I: a numeração é facultativa no documento de parágrafo
	// único — mas só enquanto ele não tiver itens. Item é "1.1", e sem o "1." impresso o
	// número do item aponta para um parágrafo que o documento não mostra.
	const hasItems = paragraphs.some((p) => (p.items?.length ?? 0) > 0)
	const numberParagraphs = shouldNumber && (paragraphs.length > 1 || hasItems)
	paragraphs.forEach((p, i) => {
		lines.push({ text: numberParagraphs ? `${i + 1}. ${p.text}` : p.text, alignment: "justificado", indentCm: 2.5 })
		p.items?.forEach((item, j) => {
			// Espécie que não numera parágrafo (carta e despacho decisório, art. 45 e 49)
			// também não pode numerar item por parágrafo: sobra o travessão.
			const marker = numberParagraphs ? `${i + 1}.${j + 1}` : "-"
			lines.push({ text: `${marker} ${item.text}`, alignment: "justificado", indentCm: 3.5 })
			item.alineas?.forEach((alinea, k) => {
				lines.push({ text: `${String.fromCharCode(97 + k)}) ${alinea.text}`, alignment: "justificado", indentCm: 4.5 })
				for (const sub of alinea.subalineas ?? []) lines.push({ text: `- ${sub.text}`, alignment: "justificado", indentCm: 5.5 })
			})
		})
	})
	return lines
}
