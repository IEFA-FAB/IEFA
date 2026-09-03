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

import { type DocumentKind, EXTERNAL_OFICIO_LABEL, findKind } from "./catalog"
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
import type { AssembledBlock, AssembledDocument, BlockId, ComplianceFinding, DocumentInput, Line } from "./types"

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

/**
 * Conferência do documento: o que falta preencher e o que contraria a norma.
 *
 * Duas regras de convívio, aprendidas na auditoria:
 *
 * 1. **Documento intocado não recebe achado nenhum.** Antes, um documento em branco já
 *    abria com alerta vermelho de NUP ausente — o aviso mais grave da ferramenta era
 *    também o primeiro, sempre, e virava paisagem.
 * 2. **Campo vazio é `pending`, norma contrariada é `nonCompliant`.** São duas conversas:
 *    "ainda falta" e "está errado". Misturá-las gasta o vermelho no que é rotina.
 */
function checkCompliance(input: DocumentInput, kind: DocumentKind): ComplianceFinding[] {
	const findings: ComplianceFinding[] = []
	const pending = (text: string, block?: BlockId) => findings.push({ text, severity: "pending", block })
	const nonCompliant = (text: string, block?: BlockId) => findings.push({ text, severity: "nonCompliant", block })

	// Documento em que ninguém escreveu nada ainda não tem o que conferir.
	const started =
		input.om.name.trim() !== "" || input.subject?.trim() !== "" || input.signer.name.trim() !== "" || input.paragraphs.some((p) => p.text.trim() !== "")
	if (!started) return findings

	// ── O que falta preencher ────────────────────────────────────────────────
	// A montagem NÃO renderiza bloco vazio: sem estes avisos, a OM some da epígrafe e o
	// signatário some do fim, e a folha continua parecendo um documento plausível.
	if (input.om.name.trim() === "") pending("Falta o nome da OM expedidora: sem ele a epígrafe não é impressa (art. 35, I).", "epigrafe")
	if (input.signer.name.trim() === "") pending("Falta o nome do signatário: sem ele o documento sai sem assinatura (art. 40).", "signatario")
	if (input.city.trim() === "") pending("Falta a localidade, que abre a linha da data (art. 35, III, b).", "numeracao")
	if (kind.blocks.includes("preambulo") && input.recipients.every((r) => r.position.trim() === "")) {
		pending("Falta o destinatário: o preâmbulo diz a quem o expediente se dirige (art. 36).", "preambulo")
	}
	if (kind.blocks.includes("ementa") && !input.subject?.trim()) {
		pending("Falta o assunto: é o resumo que permite reconhecer o documento de imediato (art. 37).", "ementa")
	}
	if (kind.blocks.includes("nup") && !(input.nup && isValidNup(input.nup))) {
		pending("Falta o NUP. Peça ao protocolo da OM ou copie o do processo no SIGADAER: são 17 dígitos (art. 48 § 4º).", "nup")
	}
	if (kind.numbering !== "nenhuma" && input.numbering.sequence === null && kind.id !== "oficio-particular") {
		pending(
			'Falta o número sequencial da seção. Sem ele o documento sai como "s/nº", forma que a norma reserva ao expediente de interesse particular (art. 51 § 6º).',
			"numeracao"
		)
	}
	if (input.paragraphs.every((p) => p.text.trim() === "")) pending("O documento está sem texto (art. 38).", "texto")

	// ── O que contraria a norma ──────────────────────────────────────────────
	if (input.signer.byOrderOf && input.paragraphs.length > 0 && !hasByOrderOpening(input.paragraphs[0].text)) {
		nonCompliant('Documento assinado por ordem: o texto deve começar por "Por ordem do…" ou "Incumbiu-me o…" (art. 40 § 9º).', "texto")
	}
	if (input.scope === "externo" && input.signer.rank && rankInFull(input.signer.rank) === input.signer.rank) {
		nonCompliant(
			`Não sei escrever "${input.signer.rank}" por extenso, e em documento externo o posto vai por extenso (art. 26). Escolha o posto na lista do campo "Posto ou graduação".`,
			"signatario"
		)
	}
	if (kind.id === "oficio-externo" && ((input.references?.length ?? 0) > 0 || (input.annexes?.length ?? 0) > 0)) {
		nonCompliant("No ofício externo, referências e anexos são citados no texto, não na ementa (art. 51 § 9º, IX).", "ementa")
	}
	if (input.distribution) {
		if (input.recipients.some((d) => /cmtaer|comandante da aeron[áa]utica/i.test(d.position))) {
			nonCompliant("Ofício circular não pode ser endereçado ao CMTAER. Confeccione documento específico para essa autoridade (art. 51 § 8º, IV).", "preambulo")
		}
		nonCompliant(
			"Ofício a vários destinatários não pode ser a peça que abre o processo (art. 51 § 8º, III). Se o assunto exige processo novo, expeça um ofício individual ao destinatário principal e mande o circular depois.",
			"preambulo"
		)
	}
	if (kind.suggestedOpening && input.paragraphs.length > 0 && !input.paragraphs[0].text.trimStart().startsWith(kind.suggestedOpening.trim())) {
		nonCompliant(`${kind.label}: o texto deve começar por “${kind.suggestedOpening.trim()}…” (${kind.legalBasis}).`, "texto")
	}
	// A Ata não tem linha de data: o art. 44 § 3º, I manda data, hora e local nas linhas
	// INICIAIS DO TEXTO. O campo Data do formulário não tem para onde ir.
	if (kind.id === "ata") {
		pending("Na Ata, data, hora e local abrem o próprio texto (art. 44 § 3º, I); o campo Data não é impresso.", "texto")
	}
	if (input.derivedFromDraft && (input.numbering.sequence === null || !input.nup)) {
		pending(
			"Documento vindo de minuta: numeração, NUP e data continuam em branco de propósito. Preencha os do expediente novo antes de despachar.",
			"numeracao"
		)
	}
	// O catálogo oferece a Certidão em âmbito externo; acusar a escolha que a própria
	// ferramenta ofereceu seria culpar o usuário pelo cardápio. O que cabe é explicar.
	if (kind.allowsClosing === false && input.scope === "externo") {
		pending(
			`${kind.label} não leva fecho de cortesia: a folha termina no signatário (art. 30). Se o destinatário externo espera "Atenciosamente", a espécie é o “${EXTERNAL_OFICIO_LABEL}”.`,
			"signatario"
		)
	}
	return findings
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
