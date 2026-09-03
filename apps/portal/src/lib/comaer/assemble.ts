/**
 * @module comaer/montar
 * Monta o documento: entrada do usuário + espécie ⇒ blocos prontos para renderizar,
 * imprimir ou copiar para o SIGADAER.
 *
 * É o único lugar que sabe a ordem e a forma dos blocos. A tela desenha o que sai daqui, e
 * o serializador copia o que sai daqui — se a folha e a área de transferência tivessem
 * cada uma a sua montagem, o que o usuário confere na tela não seria o que ele cola no
 * sistema, e o erro só apareceria depois do despacho.
 */

import { type DocumentKind, findKind } from "./catalog"
import {
	addressingLines,
	annexLetter,
	courtesyClosing,
	dateInFull,
	defaultVocativo,
	formatEnumeration,
	formatNup,
	hasByOrderOpening,
	isValidNup,
	numberingLine,
	preambuloLines,
	renderDivisions,
	signerIdentification,
} from "./format"
import { rankInFull } from "./ranks"
import type { AssembledBlock, AssembledDocument, BlockId, DocumentInput, Line } from "./types"

const BLOCK_LABELS: Record<BlockId, string> = {
	timbre: "Timbre",
	epigrafe: "Epígrafe",
	titulo: "Título",
	numeracao: "Numeração",
	nup: "Protocolo COMAER (NUP)",
	"localidade-data": "Localidade e data",
	processo: "Processo de origem",
	enderecamento: "Endereçamento",
	preambulo: "Preâmbulo",
	ementa: "Ementa",
	vocativo: "Vocativo",
	texto: "Texto",
	fecho: "Fecho de cortesia",
	signatario: "Identificação do signatário",
	"rodape-om": "Dados da organização emitente",
}

function cityAndDate(input: DocumentInput): string {
	// Sem localidade preenchida a linha começaria por vírgula (", 2 de setembro de 2026.").
	return input.city.trim() ? `${input.city}, ${dateInFull(input.date)}.` : `${dateInFull(input.date)}.`
}

function timbreBlock(kind: DocumentKind): Line[] {
	// Art. 8º § 1º: o timbre 7 é uma linha só, sem emblema; o timbre 5 leva o emblema S2.
	if (kind.timbre === 7) return [{ text: "MINISTÉRIO DA DEFESA - COMANDO DA AERONÁUTICA", alignment: "centro", bold: true }]
	return [
		{ text: "MINISTÉRIO DA DEFESA", alignment: "centro", bold: true },
		{ text: "COMANDO DA AERONÁUTICA", alignment: "centro", bold: true },
	]
}

function epigrafeBlock(input: DocumentInput, kind: DocumentKind): Line[] {
	const lines: Line[] = [{ text: input.om.name.trim().toUpperCase(), alignment: "centro", bold: true }]
	// Art. 51 § 5º, I, c: só o ofício de trâmite interno acrescenta o setor emissor.
	if (kind.id === "oficio-interno-om" && input.om.sector) lines.push({ text: input.om.sector.toUpperCase(), alignment: "centro" })
	// Art. 51 § 9º, III: no ofício externo, os dados de contato vêm logo abaixo da epígrafe.
	if (kind.id === "oficio-externo") {
		const contato = [input.om.address, input.om.phone, input.om.email].filter(Boolean).join(" - ")
		if (contato) lines.push({ text: contato, alignment: "centro" })
	}
	return lines
}

function titleBlock(input: DocumentInput, kind: DocumentKind): Line[] {
	if (kind.id === "despacho") {
		const ordem = input.despachoOrder ?? 1
		return [{ text: `${ordem}º DESPACHO`, alignment: "centro", bold: true }]
	}
	if (!kind.title) return []
	// Art. 46 § 4º, III: na Certidão a numeração acompanha o título, não uma linha própria.
	const sufixo = kind.id === "certidao" ? numberingLine("", input.numbering, input.classification, kind.numbering).trim() : ""
	return [{ text: [kind.title, sufixo].filter(Boolean).join(" ").trim(), alignment: "centro", bold: true }]
}

function ementaBlock(input: DocumentInput, kind: DocumentKind): Line[] {
	const lines: Line[] = []
	if (input.subject) {
		// Art. 51 § 9º, IX: no ofício externo o assunto vai em negrito e sozinho.
		lines.push({
			text: `Assunto: ${input.subject.replace(/\.?$/, ".")}`,
			bold: kind.id === "oficio-externo",
			edit: { target: { field: "subject" }, value: input.subject },
		})
	}
	if (kind.id !== "oficio-externo") {
		// Art. 37 § 2º, II: a primeira linha leva o rótulo; as seguintes alinham sob ela.
		const refItems = formatEnumeration(input.references ?? [], (i) => `${i + 1}.`)
		for (const [i, text] of refItems.entries())
			lines.push({
				text: i === 0 ? `Referência: ${text}` : text,
				indentCm: i === 0 ? 0 : 2.5,
				edit: { target: { field: "reference", index: i }, value: (input.references ?? [])[i] ?? "" },
			})
		const annexes = formatEnumeration(input.annexes ?? [], (i) => `${annexLetter(i)}.`)
		for (const [i, text] of annexes.entries())
			lines.push({
				text: i === 0 ? `Anexo: ${text}` : text,
				indentCm: i === 0 ? 0 : 2.5,
				edit: { target: { field: "annex", index: i }, value: (input.annexes ?? [])[i] ?? "" },
			})
	}
	return lines
}

function preambuloBlock(input: DocumentInput, kind: DocumentKind): Line[] {
	// Art. 51 § 7º, c: no ofício de interesse particular, o preâmbulo traz o NOME do
	// signatário no lugar do cargo — é o que separa o expediente pessoal do institucional.
	if (kind.id === "oficio-particular") {
		const s = input.signer
		const identificacao = [s.rank, s.quadro, s.name.toUpperCase()].filter(Boolean).join(" ")
		return [{ text: `Do ${identificacao}` }, ...preambuloLines(undefined, input.recipients).map((text) => ({ text }))]
	}
	return preambuloLines(input.sender, input.recipients).map((text) => ({ text }))
}

function bodyBlock(input: DocumentInput, kind: DocumentKind): Line[] {
	const lines = renderDivisions(input.paragraphs, kind.numberedParagraphs)
	// Art. 49 § 2º, III: o despacho decisório abre pela decisão, em caixa alta, seguida de vírgula.
	if (kind.id === "despacho-decisorio" && input.decision && lines.length > 0) {
		lines[0] = { ...lines[0], text: `${input.decision}, ${lines[0].text}` }
	}
	return lines
}

function signerBlock(input: DocumentInput, kind: DocumentKind): Line[] {
	// Art. 51 § 7º, d: no ofício de interesse particular omitem-se cargo e função.
	const signer = kind.id === "oficio-particular" ? { ...input.signer, position: undefined, om: undefined } : input.signer
	return signerIdentification(signer, input.scope).map((text) => ({ text, alignment: "centro" as const }))
}

function footerBlock(input: DocumentInput): Line[] {
	const dados = [input.om.address, input.om.phone, input.om.email].filter(Boolean)
	return dados.length > 0 ? [{ text: dados.join(" - ") }] : []
}

/** Conferências que a norma faz e o formulário sozinho não faz. */
function checkCompliance(input: DocumentInput, kind: DocumentKind): string[] {
	const warnings: string[] = []

	if (kind.blocks.includes("nup") && !(input.nup && isValidNup(input.nup))) {
		warnings.push("Protocolo COMAER (NUP) ausente ou incompleto — são 17 dígitos (art. 48 § 4º).")
	}
	if (input.paragraphs.length === 0) warnings.push("O documento está sem texto (art. 38).")

	if (input.signer.byOrderOf && input.paragraphs.length > 0 && !hasByOrderOpening(input.paragraphs[0].text)) {
		warnings.push('Documento assinado por ordem: o texto deve começar por "Por ordem do…" ou "Incumbiu-me o…" (art. 40 § 9º).')
	}
	if (input.scope === "externo" && input.signer.rank && rankInFull(input.signer.rank) === input.signer.rank) {
		warnings.push(`Posto "${input.signer.rank}" não está na tabela do art. 18 — em documento externo ele precisa sair por extenso (art. 26).`)
	}
	if (kind.id === "oficio-externo" && ((input.references?.length ?? 0) > 0 || (input.annexes?.length ?? 0) > 0)) {
		warnings.push("No ofício externo, referências e anexos são citados no texto, não na ementa (art. 51 § 9º, IX).")
	}
	if (input.distribution) {
		if (input.recipients.some((d) => /cmtaer|comandante da aeron[áa]utica/i.test(d.position))) {
			warnings.push("Ofício circular não pode ser endereçado ao CMTAER — confeccione documento específico (art. 51 § 8º, IV).")
		}
		warnings.push("Ofício circular ou DIFRAL não inaugura processo (art. 51 § 8º, III).")
	}
	if (kind.suggestedOpening && input.paragraphs.length > 0 && !input.paragraphs[0].text.trimStart().startsWith(kind.suggestedOpening.trim())) {
		warnings.push(`${kind.label}: o texto deve começar por “${kind.suggestedOpening.trim()}…” (${kind.legalBasis}).`)
	}
	// A Ata não tem linha de data: o art. 44 § 3º, I manda data, hora e local nas linhas
	// INICIAIS DO TEXTO. O campo Data do formulário não tem para onde ir, e sem este aviso
	// o usuário o preenche achando que apareceu em algum lugar.
	if (kind.id === "ata") {
		warnings.push("Na Ata, data, hora e local abrem o próprio texto (art. 44 § 3º, I) — o campo Data não é impresso.")
	}
	// Minuta importada é o caso clássico de número herdado: o texto vem do documento antigo
	// e a identidade, não. O aviso fica até o redator preencher.
	if (input.derivedFromDraft && (input.numbering.sequence === null || !input.nup)) {
		warnings.push("Documento derivado de minuta: numeração, NUP e data não foram herdados do original — preencha os do expediente novo.")
	}
	if (kind.allowsClosing === false && input.scope === "externo") {
		warnings.push(`${kind.label} não é a espécie para destinatário externo ao COMAER — o fecho de cortesia não se aplica (art. 30).`)
	}
	return warnings
}

export function assembleDocument(input: DocumentInput): AssembledDocument {
	const kind = findKind(input.kind)
	if (!kind) throw new Error(`Espécie desconhecida: ${input.kind}`)

	const blocks: AssembledBlock[] = []
	const push = (id: BlockId, lines: Line[]) => {
		// Campo em branco não vira linha, e bloco sem linha não vira bloco: o painel de
		// cópia lista um botão por bloco, e um botão que copia string vazia mente.
		const filled = lines.filter((l) => l.text.trim() !== "" || (l.rightOnSameLine ?? "").trim() !== "")
		if (filled.length > 0) blocks.push({ id, label: BLOCK_LABELS[id], lines: filled })
	}

	for (const id of kind.blocks) {
		switch (id) {
			case "timbre":
				push(id, timbreBlock(kind))
				break
			case "epigrafe":
				push(id, epigrafeBlock(input, kind))
				break
			case "titulo":
				push(id, titleBlock(input, kind))
				break
			case "numeracao": {
				const text = numberingLine(kind.numberingLabel, input.numbering, input.classification, kind.numbering)
				if (text) push(id, [{ text, rightOnSameLine: kind.dateOnLine === "numeracao" ? cityAndDate(input) : undefined }])
				else if (kind.dateOnLine === "numeracao") push("localidade-data", [{ text: cityAndDate(input), alignment: "direita" }])
				break
			}
			case "nup": {
				// A data viaja na linha do NUP no requerimento (art. 55 § 2º, III) e na da
				// numeração nas demais. Quando essa linha não existe — requerimento ainda sem
				// NUP —, a data tem de cair em linha própria: antes ela sumia junto, e o
				// documento saía sem data nenhuma sem nada avisar.
				if (!input.nup) {
					if (kind.dateOnLine === "nup") push("localidade-data", [{ text: cityAndDate(input), alignment: "direita" }])
					break
				}
				push(id, [
					{
						text: `Protocolo COMAER nº ${formatNup(input.nup)}`,
						rightOnSameLine: kind.dateOnLine === "nup" ? cityAndDate(input) : undefined,
					},
				])
				break
			}
			case "localidade-data":
				push(id, [{ text: cityAndDate(input), alignment: "direita" }])
				break
			case "processo": {
				const parts = [input.process?.nup ? `Proc nº ${formatNup(input.process.nup)}` : "", input.process?.reference ? `Ref ${input.process.reference}` : ""]
					.filter(Boolean)
					.join(" - ")
				if (parts) push(id, [{ text: `(${parts})`, alignment: "centro" }])
				break
			}
			case "enderecamento":
				push(id, input.addressing ? addressingLines(input.addressing).map((text) => ({ text })) : [])
				break
			case "preambulo":
				push(id, preambuloBlock(input, kind))
				break
			case "ementa":
				push(id, ementaBlock(input, kind))
				break
			case "vocativo":
				push(id, [{ text: input.vocativo?.trim() || defaultVocativo(input.addressing) }])
				break
			case "texto":
				push(id, bodyBlock(input, kind))
				break
			case "fecho": {
				const fecho = kind.allowsClosing ? courtesyClosing(input.scope, input.precedence) : null
				if (fecho) push(id, [{ text: fecho, indentCm: 2.5 }])
				break
			}
			case "signatario":
				push(id, signerBlock(input, kind))
				break
			case "rodape-om":
				push(id, footerBlock(input))
				break
		}
	}

	return { kind: kind.label, blocks, warnings: checkCompliance(input, kind) }
}
