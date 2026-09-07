/**
 * @module comaer/sigadaer
 * Entrega do documento ao SIGADAER — o caminho principal desta ferramenta.
 *
 * O documento não termina em papel: ele é digitado no SIGADAER, e o SIGADAER **não é uma
 * folha em branco**. A tela "Editor" da versão 7.14 é um formulário com campos próprios
 * (`examples/sigadaer pages`), e o sistema monta sozinho o cabeçalho do expediente a
 * partir deles e do cadastro da UO. Daí as decisões deste módulo:
 *
 * 1. **A unidade de cópia é o CAMPO DO SIGADAER, não o bloco do documento.** Copiar o
 *    documento inteiro colava timbre, epígrafe, numeração, preâmbulo e signatário DENTRO
 *    da caixa de texto — tudo isso o SIGADAER já imprime, e o resultado era o cabeçalho
 *    duplicado no meio do corpo do ofício.
 * 2. **O que o SIGADAER gera fica visível, sem botão.** Sumir com a epígrafe da lista
 *    faria a pessoa procurar onde colá-la; listada como "o sistema preenche" ela vira
 *    conferência — é o valor que tem de bater com o cadastro da UO.
 * 3. **Texto puro com escape de Markdown, não HTML.** A caixa de texto é um
 *    `<textarea>` com editor Markdown (`MarkdownEditor-…` no HTML salvo), não um editor
 *    rico: HTML colado ali aparece como marcação crua. E é justamente em Markdown que
 *    `1. ` e `- ` no início da linha viram lista automática — que é como a numeração de
 *    parágrafo da norma (art. 39) seria renumerada pelo próprio sistema, quebrando a
 *    correspondência entre o que se conferiu na tela e o que foi despachado.
 */

import { resolveKind } from "./catalog"
import { dateInFull, privateInterestSender, signerForKind, signerIdentification } from "./format"
import type { AssembledBlock, AssembledDocument, BlockId, DocumentInput, Line, Party } from "./types"

/**
 * Blocos que o SIGADAER imprime por conta própria.
 *
 * Timbre e epígrafe saem do cadastro da UO; numeração, NUP e a linha de localidade e data
 * são atribuídas no protocolo; preâmbulo e signatário são montados dos campos "Do/Da",
 * "Ao/À" e "Signatário". Nenhum deles se cola: colar é duplicar.
 *
 * `rodape-om` NÃO está aqui, e a ausência é o ponto: o SIGADAER não imprime contato da OM
 * em lugar nenhum — o rodapé com endereço, telefone e e-mail é acréscimo desta ferramenta.
 * Ou ele viaja no campo "Texto", ou não chega ao papel.
 */
const GENERATED_BY_SIGADAER: readonly BlockId[] = ["timbre", "epigrafe", "numeracao", "nup", "localidade-data", "preambulo", "signatario"]

/** `maxlength` do campo "Assunto / Título do documento" no formulário. */
export const SUBJECT_MAX_LENGTH = 255

function plainLine(l: Line): string {
	// Alinhamento à direita não existe em texto puro: a localidade e a data descem para a
	// linha seguinte em vez de virar espaçamento fake, que qualquer editor destrói.
	return l.rightOnSameLine ? `${l.text}\n${l.rightOnSameLine}` : l.text
}

export function blockToPlainText(bloco: AssembledBlock): string {
	return bloco.lines.map(plainLine).join("\n")
}

export function toPlainText(doc: AssembledDocument): string {
	return doc.blocks.map(blockToPlainText).join("\n\n")
}

/**
 * Neutraliza o que o Markdown leria como ESTRUTURA no início da linha.
 *
 * Só o começo da linha, e só o que muda a forma do documento: `1. ` vira lista ordenada e
 * o editor renumera sozinho; `- ` vira marcador e come a subalínea do art. 39; `#` e `>`
 * viram título e citação. O item "1.1 " não é atingido de propósito — o Markdown exige
 * espaço logo após o ponto, e escapar ali sujaria a numeração à toa.
 *
 * Ênfase no MEIO da linha (`*`, `_`) fica intocada: documento oficial quase não os usa, e
 * escapar tudo devolveria contra-barra no texto que a pessoa digitou.
 */
export function escapeMarkdownStructure(text: string): string {
	// Linha a linha: uma `Line` da montagem pode trazer duas linhas físicas
	// (`rightOnSameLine`), e um `^` sem `m` deixaria a segunda passar sem escape.
	return text
		.split("\n")
		.map((line) => line.replace(/^(\s*)(\d+)([.)])(\s)/, "$1$2\\$3$4").replace(/^(\s*)([-+*>#])(\s)/, "$1\\$2$3"))
		.join("\n")
}

function blockToMarkdown(bloco: AssembledBlock): string {
	return bloco.lines.map((l) => escapeMarkdownStructure(plainLine(l))).join("\n")
}

/**
 * Os blocos que sobram para a caixa de texto, na ordem do documento.
 *
 * A ementa entra pela metade: o assunto tem campo próprio no formulário e o SIGADAER
 * imprime o rótulo "Assunto:"; referência e anexo não têm campo nenhum, e só chegam ao
 * papel se forem digitados aqui.
 */
function bodyBlocks(doc: AssembledDocument): AssembledBlock[] {
	return doc.blocks.flatMap((bloco) => {
		if (GENERATED_BY_SIGADAER.includes(bloco.id)) return []
		if (bloco.id !== "ementa") return [bloco]
		const semAssunto = bloco.lines.filter((l) => l.edit?.target.field !== "subject")
		return semAssunto.length > 0 ? [{ ...bloco, lines: semAssunto }] : []
	})
}

export interface SigadaerField {
	id: string
	/** Rótulo como está escrito no formulário do SIGADAER. */
	label: string
	value: string
	/** Campo de escolha: o valor é a opção a marcar, não texto a colar. */
	choice?: boolean
	/** Acima disso o SIGADAER trunca em silêncio. */
	maxLength?: number
	hint?: string
}

export interface SigadaerGenerated {
	id: BlockId
	label: string
	value: string
}

export interface SigadaerHandoff {
	fields: SigadaerField[]
	/** Só para conferir com o que o SIGADAER imprimir — nada aqui se cola. */
	generated: SigadaerGenerated[]
}

/**
 * A data como o campo do SIGADAER a espera.
 *
 * O `<input>` tem `ngbdatepicker` e placeholder "&lt;dd&gt; de &lt;mês por extenso&gt; de
 * &lt;AAAA&gt;": é lido de volta como data. O ordinal do primeiro dia (art. 12 § 4º) é da
 * NOSSA folha, e o SIGADAER escreve a própria linha de localidade e data — mandar "1º" ali
 * arrisca o dia 1 de cada mês não ser reconhecido.
 */
function dateForSigadaer(date: Date): string {
	return dateInFull(date).replace(/^1º /, "1 ")
}

/** O assunto como o campo do SIGADAER o recebe — a mesma medida que a conferência usa. */
export function subjectFieldValue(subject: string | undefined): string {
	// Sem o rótulo "Assunto: " e sem o ponto final que a folha acrescenta: o SIGADAER
	// imprime o rótulo, e o art. 37 § 2º, II quer o assunto sem ponto.
	return (subject ?? "").trim().replace(/\.$/, "")
}

/**
 * As partes como o formulário do SIGADAER as pede.
 *
 * O preâmbulo não é a única origem delas. No ofício de interesse particular quem envia é a
 * pessoa, pelo nome (art. 51 § 7º, c); no ofício externo e na carta não há preâmbulo, e o
 * destinatário mora no endereçamento (art. 51 § 9º, VIII) — sem esta queda o painel não
 * oferecia destinatário NENHUM justamente nas espécies que saem do COMAER.
 */
function partiesForForm(input: DocumentInput, privateInterest: boolean): { sender: Party; recipients: Party[] } {
	const sender: Party = privateInterest
		? { position: privateInterestSender(input.signer) }
		: { position: input.sender?.position.trim() || (input.signer.position ?? ""), gender: input.sender?.gender }

	const fromPreambulo = input.recipients.filter((d) => d.position.trim() !== "")
	if (fromPreambulo.length > 0) return { sender, recipients: fromPreambulo }

	const addressed = input.addressing?.position?.trim() || input.addressing?.name?.trim()
	return { sender, recipients: addressed ? [{ position: addressed, gender: input.addressing?.gender }] : [] }
}

/** O que digitar em cada campo do formulário, na ordem em que a tela os apresenta. */
export function sigadaerHandoff(input: DocumentInput, doc: AssembledDocument): SigadaerHandoff {
	const fields: SigadaerField[] = []
	const privateInterest = resolveKind(input.kind).id === "oficio-particular"
	const { sender, recipients } = partiesForForm(input, privateInterest)

	fields.push({
		id: "assunto",
		label: "Assunto / Título do documento",
		value: subjectFieldValue(input.subject),
		maxLength: SUBJECT_MAX_LENGTH,
	})

	fields.push({ id: "data", label: "Data", value: dateForSigadaer(input.date) })

	fields.push({ id: "remetente-artigo", label: "Do / Da", value: sender.gender === "f" ? "Da" : "Do", choice: true })
	fields.push({
		id: "remetente-cargo",
		label: privateInterest ? "Remetente (art. 51 § 7º, c: nome, não cargo)" : "Cargo ou função do remetente",
		value: sender.position,
	})

	const several = recipients.length > 1
	recipients.forEach((d, i) => {
		const ordinal = several ? ` ${i + 1}` : ""
		fields.push({
			id: `destinatario-artigo-${i}`,
			label: `Ao / À${ordinal}`,
			value: d.gender === "f" ? "À" : "Ao",
			choice: true,
			hint: several ? 'Use o botão "+" do formulário para abrir o destinatário seguinte.' : undefined,
		})
		fields.push({
			id: `destinatario-cargo-${i}`,
			label: `Cargo ou função do destinatário${ordinal}`,
			// O formulário não tem campo para a autoridade intermediária: o "via" do art. 36,
			// parágrafo único, III só existe no papel se for digitado junto do cargo.
			value: d.via?.trim() ? `${d.position}, via ${d.via}` : d.position,
		})
	})

	const body = bodyBlocks(doc)
	fields.push({
		id: "texto",
		label: "Texto",
		value: body.map(blockToMarkdown).join("\n\n"),
		hint: body.some((b) => b.id === "rodape-om")
			? // O SIGADAER imprime o signatário DEPOIS da caixa de texto, então o contato que vai
				// junto do texto sai acima da assinatura, e não abaixo dela como na folha.
				"Caixa em Markdown: a numeração vai escapada para o editor não renumerar sozinho. O contato da OM vai no fim do texto — o SIGADAER não tem campo para ele e imprime a assinatura depois."
			: "Caixa em Markdown: a numeração vai escapada para o editor não renumerar sozinho.",
	})

	// O SIGADAER tem campo separado para o impedimento e monta o "No Imp" sozinho: mandar a
	// forma já montada da folha (art. 40 § 7º) escreveria "No Imp" duas vezes.
	fields.push({
		id: "signatario",
		label: "Signatário",
		value: signerIdentification(signerForKind({ ...input.signer, noImp: undefined }, privateInterest), input.scope).join("\n"),
	})
	if (input.signer.noImp) {
		fields.push({
			id: "signatario-impedimento",
			label: "Signatário no Impedimento",
			value: signerIdentification(input.signer.noImp, input.scope).join("\n"),
		})
	}

	const generated = doc.blocks.filter((b) => GENERATED_BY_SIGADAER.includes(b.id)).map((b) => ({ id: b.id, label: b.label, value: blockToPlainText(b) }))

	return { fields, generated }
}

/**
 * Escreve na área de transferência.
 *
 * Só `text/plain`: todo destino é `<input>` ou `<textarea>` — inclusive a caixa do texto,
 * que é um editor Markdown. O sabor `text/html` que existia aqui virava marcação crua
 * dentro da caixa.
 */
export async function copyField(text: string): Promise<void> {
	await navigator.clipboard.writeText(text)
}
