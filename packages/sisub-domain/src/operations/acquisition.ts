/**
 * Contratação de origem (change `sisub-flexible-expense-execution`, D1 e D7): regras puras.
 *
 * A contratação diz de onde vem o direito de gastar — ata de registro de preços, licitação com
 * contrato, dispensa, inexigibilidade, Contrata+Brasil, suprimento de fundos. Ela NASCE
 * INCOMPLETA: só a OM e o tipo são obrigatórios, e o que falta vira pendência com o que fazer,
 * nunca recusa. O sisub registra o que já aconteceu no SIAFI e no Compras.gov.br.
 *
 * Dispensa por valor (Lei 14.133/2021, art. 75, I e II): o limite vem da tabela
 * `procurement.direct_contract_limit` (atualizada por decreto, art. 182), e a aferição soma o que
 * a unidade gestora despende no exercício com objetos do mesmo ramo de atividade (art. 75, § 1º;
 * IN SEGES/ME 67/2021, art. 4º, §§ 1º e 2º). Passar do limite é AVISO com a composição e pede
 * justificativa; o registro nunca é recusado.
 */

export const ACQUISITION_KINDS = ["registro_precos", "licitacao", "dispensa", "inexigibilidade", "contrata_mais_brasil", "suprimento_fundos", "outra"] as const
export type AcquisitionKind = (typeof ACQUISITION_KINDS)[number]

export const SRP_ROLES = ["gerenciador", "participante", "nao_participante"] as const
export type SrpRole = (typeof SRP_ROLES)[number]

export const ACQUISITION_INSTRUMENTS = ["ata", "contrato", "nota_empenho", "outro"] as const
export type AcquisitionInstrument = (typeof ACQUISITION_INSTRUMENTS)[number]

/** Incisos do art. 75 com limite por valor (os demais incisos não entram no somatório). */
export const DIRECT_CONTRACT_VALUE_CLAUSES = ["I", "II"] as const
export type DirectContractValueClause = (typeof DIRECT_CONTRACT_VALUE_CLAUSES)[number]

export const ARP_SOURCES = ["compras_gov", "manual"] as const
export type ArpSource = (typeof ARP_SOURCES)[number]

export const ACQUISITION_KIND_LABEL: Record<AcquisitionKind, string> = {
	registro_precos: "Registro de preços",
	licitacao: "Licitação",
	dispensa: "Dispensa",
	inexigibilidade: "Inexigibilidade",
	contrata_mais_brasil: "Contrata+Brasil",
	suprimento_fundos: "Suprimento de fundos",
	outra: "Outra",
}

export const SRP_ROLE_LABEL: Record<SrpRole, string> = {
	gerenciador: "Gerenciador",
	participante: "Participante",
	nao_participante: "Não participante (adesão)",
}

export const ACQUISITION_INSTRUMENT_LABEL: Record<AcquisitionInstrument, string> = {
	ata: "Ata de registro de preços",
	contrato: "Contrato",
	nota_empenho: "Nota de empenho (art. 95)",
	outro: "Outro",
}

/** Fundamento sugerido por tipo — texto de partida, editável. */
export const DEFAULT_LEGAL_BASIS: Partial<Record<AcquisitionKind, string>> = {
	registro_precos: "Lei 14.133/2021, arts. 82 a 86 (sistema de registro de preços)",
	dispensa: "Lei 14.133/2021, art. 75",
	inexigibilidade: "Lei 14.133/2021, art. 74",
	contrata_mais_brasil: "Lei 14.133/2021, art. 75, II (Contrata+Brasil)",
	suprimento_fundos: "Lei 4.320/1964, arts. 68 e 69",
}

/** O que a contratação precisa ter para ser usada sem pendência. */
export interface AcquisitionFacts {
	kind: AcquisitionKind
	srpRole: SrpRole | null
	legalBasis: string | null
	directContractClause: string | null
	nd: string | null
	activityLine: string | null
	object: string | null
	supplierCnpj: string | null
	supplierName: string | null
	validFrom: string | null
	validTo: string | null
	estimatedValue: number | null
	overLimitJustification: string | null
}

export type AcquisitionGapCode =
	| "legal_basis"
	| "supplier"
	| "validity"
	| "object"
	| "srp_role"
	| "direct_contract_clause"
	| "activity_line"
	| "value"
	| "over_limit_justification"

export interface AcquisitionGap {
	code: AcquisitionGapCode
	/** Complemento de "sem …" ("fundamento legal"), para compor a frase da pendência. */
	missing: string
}

const blank = (value: string | null | undefined) => value == null || value.trim() === ""

/** Tipos cujo fornecedor é um só e precisa estar na contratação. A ata tem um por item. */
const SINGLE_SUPPLIER_KINDS: ReadonlySet<AcquisitionKind> = new Set(["licitacao", "dispensa", "inexigibilidade", "contrata_mais_brasil"])

/**
 * Pendências de completude da contratação.
 *
 * `overLimit` vem do somatório (quem chama sabe se a dispensa passou do limite): acima dele, a
 * contratação só fica completa com a justificativa gravada.
 */
export function acquisitionGaps(facts: AcquisitionFacts, options: { overLimit?: boolean } = {}): AcquisitionGap[] {
	const gaps: AcquisitionGap[] = []
	if (blank(facts.legalBasis)) gaps.push({ code: "legal_basis", missing: "fundamento legal" })
	if (facts.kind === "registro_precos" && facts.srpRole == null) gaps.push({ code: "srp_role", missing: "papel da unidade na ata" })
	if (facts.kind === "dispensa" && blank(facts.directContractClause)) gaps.push({ code: "direct_contract_clause", missing: "inciso do art. 75" })
	if (SINGLE_SUPPLIER_KINDS.has(facts.kind) && blank(facts.supplierCnpj) && blank(facts.supplierName)) gaps.push({ code: "supplier", missing: "fornecedor" })
	if (facts.kind !== "suprimento_fundos" && (facts.validFrom == null || facts.validTo == null)) gaps.push({ code: "validity", missing: "vigência" })
	if (blank(facts.object)) gaps.push({ code: "object", missing: "objeto" })
	if (isValueDispensa(facts)) {
		if (blank(facts.activityLine)) gaps.push({ code: "activity_line", missing: "ramo de atividade" })
		if (facts.estimatedValue == null) gaps.push({ code: "value", missing: "valor" })
		if (options.overLimit && blank(facts.overLimitJustification))
			gaps.push({ code: "over_limit_justification", missing: "justificativa do somatório acima do limite" })
	}
	return gaps
}

export function isAcquisitionComplete(facts: AcquisitionFacts, options: { overLimit?: boolean } = {}): boolean {
	return acquisitionGaps(facts, options).length === 0
}

/** Dispensa dos incisos I ou II: a que entra no somatório do § 1º. */
export function isValueDispensa(facts: Pick<AcquisitionFacts, "kind" | "directContractClause">): boolean {
	return facts.kind === "dispensa" && (facts.directContractClause === "I" || facts.directContractClause === "II")
}

/** "a e b" / "a, b e c" */
function joinPt(parts: readonly string[]): string {
	if (parts.length <= 1) return parts[0] ?? ""
	return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`
}

/** "Dispensa sem fundamento legal, sem fornecedor e sem vigência" — ou null quando completa. */
export function describeAcquisitionGaps(kind: AcquisitionKind, gaps: readonly AcquisitionGap[]): string | null {
	if (gaps.length === 0) return null
	return `${ACQUISITION_KIND_LABEL[kind]} ${joinPt(gaps.map((gap) => `sem ${gap.missing}`))}`
}

// ─── Ramo de atividade (IN SEGES/ME 67/2021, art. 4º, § 2º) ──────────────────

/** Ramo de atividade de bens é a classe do PDM no CATMAT ("8905"); de serviço, a descrição. */
export function isMaterialClassLine(line: string | null | undefined): boolean {
	return line != null && /^\d{4}$/.test(line.trim())
}

/** Normaliza o ramo para comparar: classe pelo código; descrição de serviço sem caixa nem espaço extra. */
export function normalizeActivityLine(line: string | null | undefined): string | null {
	if (line == null) return null
	const trimmed = line.trim()
	if (trimmed === "") return null
	return isMaterialClassLine(trimmed) ? trimmed : trimmed.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ")
}

/**
 * Sugere o ramo a partir das classes dos itens (item de compra → CATMAT → PDM → classe): a classe
 * mais frequente, desempate pelo menor código. Sem classe conhecida, null — o usuário informa.
 */
export function suggestActivityLine(classCodes: ReadonlyArray<number | string | null | undefined>): string | null {
	const counts = new Map<string, number>()
	for (const raw of classCodes) {
		if (raw == null) continue
		const code = String(raw).trim()
		if (!/^\d{4}$/.test(code)) continue
		counts.set(code, (counts.get(code) ?? 0) + 1)
	}
	let best: string | null = null
	let bestCount = 0
	for (const [code, count] of counts) {
		if (count > bestCount || (count === bestCount && best != null && code < best)) {
			best = code
			bestCount = count
		}
	}
	return best
}

// ─── Limite vigente (art. 75, I e II) ─────────────────────────────────────────

export interface DirectContractLimitRow {
	clause: string
	/** "YYYY-MM-DD" */
	validFrom: string
	value: number
	sourceAct: string
}

export interface ResolvedDirectContractLimit {
	/** null quando a tabela não tem linha nenhuma para o inciso. */
	value: number | null
	validFrom: string | null
	sourceAct: string | null
	/** Não há linha com vigência iniciada no exercício: o cálculo usa o último limite conhecido. */
	isOutdated: boolean
}

/** Limite do exercício: a linha do inciso com maior `validFrom` até 31/12 do ano. */
export function resolveDirectContractLimit(rows: readonly DirectContractLimitRow[], clause: string, fiscalYear: number): ResolvedDirectContractLimit {
	const yearEnd = `${fiscalYear}-12-31`
	const yearStart = `${fiscalYear}-01-01`
	const applicable = rows
		.filter((row) => row.clause === clause && row.validFrom <= yearEnd)
		.sort((a, b) => (a.validFrom < b.validFrom ? 1 : a.validFrom > b.validFrom ? -1 : 0))[0]
	if (!applicable) return { value: null, validFrom: null, sourceAct: null, isOutdated: true }
	return { value: applicable.value, validFrom: applicable.validFrom, sourceAct: applicable.sourceAct, isOutdated: applicable.validFrom < yearStart }
}

// ─── Somatório da dispensa (art. 75, § 1º) ────────────────────────────────────

export interface DispensaEntry {
	id: string
	label: string
	kind: AcquisitionKind
	directContractClause: string | null
	fiscalYear: number
	activityLine: string | null
	nd: string | null
	estimatedValue: number | null
	/** Soma do valor vigente das NEs vinculadas a esta contratação. */
	committedValue: number
	deleted?: boolean
}

/**
 * Valor de uma dispensa no somatório: o maior entre o empenhado e o estimado. Sem nenhum dos
 * dois (estimativa ausente e nada empenhado), null — ela NÃO conta como zero: o total vira piso.
 */
export function dispensaValue(entry: Pick<DispensaEntry, "estimatedValue" | "committedValue">): number | null {
	const committed = entry.committedValue > 0 ? entry.committedValue : null
	if (committed == null && entry.estimatedValue == null) return null
	return Math.max(committed ?? 0, entry.estimatedValue ?? 0)
}

/** Ramo efetivo da dispensa: o informado; sem ele, a ND (até o subitem) faz as vezes de ramo. */
export function effectiveActivityLine(entry: Pick<DispensaEntry, "activityLine" | "nd">): string | null {
	return normalizeActivityLine(entry.activityLine) ?? (entry.nd ? `nd:${entry.nd}` : null)
}

export interface DispensaSumInput {
	candidate: DispensaEntry
	/** Outras contratações da MESMA unidade gestora (o filtro por inciso, ano e ramo é daqui). */
	others: readonly DispensaEntry[]
	limit: ResolvedDirectContractLimit
}

export interface DispensaSumPart {
	id: string
	label: string
	value: number | null
	isCandidate: boolean
}

export interface DispensaSum {
	clause: string
	fiscalYear: number
	activityLine: string | null
	/** Soma dos valores conhecidos. Com `isFloor`, o total real é pelo menos isto. */
	total: number
	/** Alguma dispensa do conjunto não tem valor: o total é um piso. */
	isFloor: boolean
	limit: number | null
	limitSource: string | null
	limitOutdated: boolean
	/** Quanto ainda cabe no limite (null sem limite conhecido). Negativo = passou. */
	remaining: number | null
	exceeded: boolean
	composition: DispensaSumPart[]
}

/**
 * Soma a dispensa candidata com as outras do mesmo inciso, exercício e ramo de atividade.
 * Contratação apagada, de outro tipo ou de inciso sem limite por valor fica fora.
 */
export function computeDispensaSum(input: DispensaSumInput): DispensaSum | null {
	const { candidate, others, limit } = input
	if (!isValueDispensa(candidate)) return null
	const clause = candidate.directContractClause as string
	const line = effectiveActivityLine(candidate)

	const peers = others.filter(
		(other) =>
			other.id !== candidate.id &&
			!other.deleted &&
			other.kind === "dispensa" &&
			other.directContractClause === clause &&
			other.fiscalYear === candidate.fiscalYear &&
			line != null &&
			effectiveActivityLine(other) === line
	)

	const composition: DispensaSumPart[] = [
		...peers.map((peer) => ({ id: peer.id, label: peer.label, value: dispensaValue(peer), isCandidate: false })),
		{ id: candidate.id, label: candidate.label, value: dispensaValue(candidate), isCandidate: true },
	]
	const total = roundCents(composition.reduce((sum, part) => sum + (part.value ?? 0), 0))
	const isFloor = composition.some((part) => part.value == null)
	const remaining = limit.value == null ? null : roundCents(limit.value - total)
	return {
		clause,
		fiscalYear: candidate.fiscalYear,
		activityLine: line,
		total,
		isFloor,
		limit: limit.value,
		limitSource: limit.sourceAct,
		limitOutdated: limit.isOutdated,
		remaining,
		exceeded: limit.value != null && total > limit.value + 0.005,
		composition,
	}
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** Aviso do somatório para a tela e para o fluxo, citando o § 1º. null quando está dentro. */
export function describeDispensaSum(sum: DispensaSum): string | null {
	const floor = sum.isFloor ? " (piso: há dispensa sem valor no conjunto)" : ""
	if (sum.limit == null) {
		return `Sem limite cadastrado para o inciso ${sum.clause} do art. 75: cadastre o limite vigente. Somatório no exercício: ${BRL.format(sum.total)}${floor}.`
	}
	if (!sum.exceeded) return null
	return `As dispensas do inciso ${sum.clause} neste ramo somam ${BRL.format(sum.total)}${floor} em ${sum.fiscalYear}, acima do limite de ${BRL.format(sum.limit)} (Lei 14.133/2021, art. 75, § 1º). Registre a justificativa na contratação.`
}

function roundCents(value: number): number {
	return Math.round(value * 100) / 100
}
