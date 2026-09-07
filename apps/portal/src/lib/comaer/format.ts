/**
 * @module comaer/format
 * Formatadores puros da NSCA 5-3/2026, Anexo I. Sem React, sem I/O — cada função
 * responde por um artigo, para que a regra possa ser testada contra o texto da norma.
 */

import { isGeneralOfficer, quadroInFull, rankInFull } from "./ranks"
import type { Addressing, Classification, Line, MilitaryUnit, Numbering, Paragraph, Party, Precedence, Scope, Signer } from "./types"

/**
 * Endereço, telefone e e-mail da OM numa linha.
 *
 * Existe em um lugar só porque a composição estava duplicada, e a duplicação virou o
 * defeito: o ofício externo imprimia a mesma linha sob a epígrafe E no rodapé.
 */
export function omContactLine(om: MilitaryUnit): string {
	return [om.address, om.phone, om.email].filter(Boolean).join(" - ")
}

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

export interface EnumerationEntry {
	/** Linha pronta, com marcador e pontuação. */
	text: string
	/** Texto cru, como está no documento — é o que a edição na folha abre. */
	value: string
	/**
	 * Posição no array ORIGINAL.
	 *
	 * Entrada em branco não vira linha, então a posição impressa e a posição guardada
	 * divergem assim que a pessoa acrescenta um campo e preenche o seguinte. Sem carregar a
	 * origem, editar a referência visível gravava na entrada vazia: a linha não mudava e
	 * nascia uma referência invisível no documento.
	 */
	sourceIndex: number
}

/**
 * Art. 37 § 2º, III e V — itens de referência e de anexo: ponto e vírgula em todos,
 * "; e" no penúltimo, ponto final no último.
 */
export function enumerationEntries(items: string[], marker: (index: number) => string): EnumerationEntry[] {
	const kept = items
		.map((raw, sourceIndex) => ({ value: raw, cleaned: raw.trim().replace(/[;.]+$/, ""), sourceIndex }))
		.filter((entry) => entry.cleaned.length > 0)
	return kept.map((entry, i) => {
		const ending = i === kept.length - 1 ? "." : i === kept.length - 2 ? "; e" : ";"
		return { text: `${marker(i)} ${entry.cleaned}${ending}`, value: entry.value, sourceIndex: entry.sourceIndex }
	})
}

export function formatEnumeration(items: string[], marker: (index: number) => string): string[] {
	return enumerationEntries(items, marker).map((entry) => entry.text)
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
 * Art. 51 § 7º, c — no ofício de interesse particular quem envia é a PESSOA, identificada
 * pelo nome, e não o cargo: é o que separa o expediente pessoal do institucional.
 */
export function privateInterestSender(s: Signer): string {
	return [s.rank, s.quadro, s.name.toUpperCase()].filter(Boolean).join(" ")
}

/**
 * Art. 51 § 7º, d — o ofício de interesse particular omite cargo e função do signatário.
 *
 * Mora aqui, e não dentro da montagem da folha, porque a entrega ao SIGADAER precisa da
 * MESMA regra: sem ela, o campo "Signatário" do formulário levava o cargo que a norma
 * manda omitir, e o que se digitava no sistema não era o que se conferiu na tela.
 */
export function signerForKind(signer: Signer, privateInterest: boolean): Signer {
	return privateInterest ? { ...signer, position: undefined, om: undefined } : signer
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
		lines.push({
			text: numberParagraphs ? `${i + 1}. ${p.text}` : p.text,
			alignment: "justificado",
			indentCm: 2.5,
			edit: { target: { field: "paragraph", paragraph: i }, value: p.text },
		})
		p.items?.forEach((item, j) => {
			// Espécie que não numera parágrafo (carta e despacho decisório, art. 45 e 49)
			// também não pode numerar item por parágrafo: sobra o travessão.
			const marker = numberParagraphs ? `${i + 1}.${j + 1}` : "-"
			lines.push({
				text: `${marker} ${item.text}`,
				alignment: "justificado",
				indentCm: 3.5,
				edit: { target: { field: "item", paragraph: i, item: j }, value: item.text },
			})
			item.alineas?.forEach((alinea, k) => {
				lines.push({
					text: `${String.fromCharCode(97 + k)}) ${alinea.text}`,
					alignment: "justificado",
					indentCm: 4.5,
					edit: { target: { field: "alinea", paragraph: i, item: j, alinea: k }, value: alinea.text },
				})
				for (const [l, sub] of (alinea.subalineas ?? []).entries()) {
					lines.push({
						text: `- ${sub.text}`,
						alignment: "justificado",
						indentCm: 5.5,
						edit: { target: { field: "subalinea", paragraph: i, item: j, alinea: k, subalinea: l }, value: sub.text },
					})
				}
			})
		})
	})
	return lines
}
