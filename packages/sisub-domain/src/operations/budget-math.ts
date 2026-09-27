/**
 * Matemática pura do crédito orçamentário (Fase 2 da execução).
 *
 * Regra central, herdada do painel de ARP: saldo OFICIAL (snapshot do SIAFI)
 * e COMPROMETIMENTO LOCAL (empenhos do sisub posteriores ao snapshot) são
 * grandezas de origens diferentes e NUNCA se somam. O "saldo projetado" é uma
 * terceira grandeza derivada, sempre exibida com rótulo próprio.
 */

import { empenhoEventSign } from "./empenho-events.ts"
import { roundToCents } from "./liquidacao-math.ts"

export interface BudgetCreditSnapshot {
	dotacao: number
	empenhadoSiafi: number
	saldoSiafi: number
	/** ISO timestamp do momento do dado no SIAFI. */
	snapshotAt: string
}

export interface LocalEmpenhoEntry {
	/** ISO date/timestamp do empenho no sisub. */
	dataEmpenho: string
	valor: number
	status: string
}

export interface BudgetProjection {
	dotacao: number
	empenhadoSiafi: number
	saldoSiafi: number
	/** Σ empenhos ATIVOS lançados no sisub após o snapshot. */
	comprometimentoLocal: number
	/** saldoSiafi − comprometimentoLocal (nunca abaixo de zero na exibição). */
	saldoProjetado: number
	snapshotAt: string
	snapshotAgeDays: number
	/** Snapshot com mais de 7 dias merece destaque na UI. */
	snapshotStale: boolean
}

const STALE_AFTER_DAYS = 7

/**
 * Soma apenas os empenhos ATIVOS posteriores ao snapshot — os anteriores já
 * estão refletidos no `empenhadoSiafi`, somá-los contaria duas vezes.
 */
export function localCommitmentAfterSnapshot(entries: readonly LocalEmpenhoEntry[], snapshotAt: string): number {
	const snapshot = Date.parse(snapshotAt)
	if (Number.isNaN(snapshot)) return 0
	const total = entries.reduce((acc, entry) => {
		if (entry.status !== "ativo") return acc
		const when = Date.parse(entry.dataEmpenho)
		if (Number.isNaN(when) || when <= snapshot) return acc
		return acc + Number(entry.valor ?? 0)
	}, 0)
	return roundToCents(total)
}

export function projectBudget(snapshot: BudgetCreditSnapshot, entries: readonly LocalEmpenhoEntry[], now: number = Date.now()): BudgetProjection {
	const comprometimentoLocal = localCommitmentAfterSnapshot(entries, snapshot.snapshotAt)
	const parsed = Date.parse(snapshot.snapshotAt)
	const ageDays = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : Math.floor((now - parsed) / 86_400_000)
	return {
		dotacao: snapshot.dotacao,
		empenhadoSiafi: snapshot.empenhadoSiafi,
		saldoSiafi: snapshot.saldoSiafi,
		comprometimentoLocal,
		saldoProjetado: roundToCents(snapshot.saldoSiafi - comprometimentoLocal),
		snapshotAt: snapshot.snapshotAt,
		snapshotAgeDays: ageDays,
		snapshotStale: ageDays > STALE_AFTER_DAYS,
	}
}

export type CreditCheckStatus = "ok" | "insufficient" | "no_data"

export interface CreditCheck {
	status: CreditCheckStatus
	/** Quanto excede o saldo projetado (0 quando cabe). */
	excedente: number
	message: string
}

/**
 * Verificação ANTES de empenhar. É alerta, nunca bloqueio: o snapshot pode
 * estar defasado e a decisão é do ordenador — por isso a mensagem sempre
 * carrega a idade do dado.
 */
export function checkCreditForEmpenho(valor: number, projection: BudgetProjection | null): CreditCheck {
	if (projection == null) {
		return {
			status: "no_data",
			excedente: 0,
			message: "Sem dado de crédito importado para esta classificação — o empenho será registrado sem verificação de crédito",
		}
	}
	const excedente = roundToCents(valor - projection.saldoProjetado)
	const idade = projection.snapshotAgeDays === 0 ? "hoje" : `há ${projection.snapshotAgeDays} dia(s)`
	if (excedente > 0) {
		return {
			status: "insufficient",
			excedente,
			message: `Valor excede o saldo projetado em R$ ${excedente.toFixed(2)} (crédito do SIAFI capturado ${idade}). Confirme para prosseguir.`,
		}
	}
	return { status: "ok", excedente: 0, message: `Saldo projetado suficiente (crédito do SIAFI capturado ${idade})` }
}

// ============================================================================
// Crédito por CLASSIFICAÇÃO (achado F4 da auditoria de 2026-09-26)
// ============================================================================
// `localCommitmentAfterSnapshot` soma TODOS os empenhos da unidade contra cada
// linha de crédito, pelo valor original. Uma NE de gêneros (33903007) consumia
// o crédito de serviços de terceiros (339039), e reforço ou anulação posterior
// ao snapshot não aparecia. As funções abaixo filtram pela chave da linha (UG,
// ND, PTRES, fonte, exercício) e usam o valor VIGENTE.

/** Chave de classificação de uma linha de `finance.budget_credit` (nulo = linha não segmentada por aquele campo). */
export interface CreditLineKey {
	ug: string | null
	nd: string
	ptres: string | null
	fonte: string | null
	/** Competência da linha (`YYYY-MM-DD`): o ano é o exercício do crédito. */
	competencia: string
}

/** Classificação de um empenho, como gravada em `finance.empenho`. */
export interface EmpenhoClassification {
	ug: string | null
	nd: string | null
	ptres: string | null
	fonte: string | null
	exercicio: number | null
}

export interface EmpenhoEventEntry {
	tipo: string
	valor: number
	/** `YYYY-MM-DD` do evento. */
	data: string
}

export interface ClassifiedEmpenhoEntry extends EmpenhoClassification {
	id: string
	/** `YYYY-MM-DD` (ou ISO) do empenho. */
	dataEmpenho: string
	status: string
	/** Valor vigente (`finance.v_empenho_vigente`): original + reforços − anulações. */
	valorVigente: number
	events: readonly EmpenhoEventEntry[]
}

/** Só os dígitos da ND; `33903000` (subelemento genérico) vale como o elemento `339030`. */
export function normalizeNdPrefix(nd: string): string {
	const digits = nd.replace(/\D/g, "")
	if (digits.length === 8 && digits.endsWith("00")) return digits.substring(0, 6)
	return digits
}

function isBlank(value: string | null | undefined): boolean {
	return value == null || value.trim() === ""
}

/**
 * Campo nulo na LINHA é "linha não segmentada por ele". Nulo no empenho é
 * "desconhecido", não "diferente": conta. É alerta, e deixar de avisar é o erro
 * caro (Lei 4.320, art. 59).
 */
function sameOrOpen(line: string | null, other: string | null): boolean {
	if (isBlank(line) || isBlank(other)) return true
	return (line as string).trim() === (other as string).trim()
}

function yearOf(isoDate: string): number | null {
	const year = Number(isoDate.substring(0, 4))
	return Number.isInteger(year) && year > 1900 ? year : null
}

/**
 * Dia civil de Brasília (`YYYY-MM-DD`). Data pura (`2026-09-26`) já é dia civil e passa como
 * está; instante (o `snapshot_at`, um timestamp) é convertido para o fuso de Brasília. Comparar
 * `Date.parse` de uma data pura (meia-noite UTC) com um timestamp jogava a NE do próprio dia do
 * snapshot para "antes" dele.
 */
export function brasiliaCivilDay(value: string): string | null {
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
	const ms = Date.parse(value)
	if (Number.isNaN(ms)) return null
	return new Date(ms).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).substring(0, 10)
}

/**
 * O empenho consome esta linha de crédito?
 *
 * - ND por prefixo: a linha costuma vir no elemento (`339030`) e o empenho no
 *   subelemento (`33903007`). Empenho SEM ND não é atribuível a linha nenhuma:
 *   somá-lo a todas contaria o mesmo valor N vezes.
 * - UG, PTRES e fonte: ver `sameOrOpen`.
 * - Exercício: crédito de 2025 não é consumido por NE de 2026.
 */
export function empenhoConsumesCreditLine(line: CreditLineKey, empenho: EmpenhoClassification & { dataEmpenho: string }): boolean {
	if (isBlank(empenho.nd)) return false
	const lineNd = normalizeNdPrefix(line.nd)
	if (lineNd === "" || !normalizeNdPrefix(empenho.nd as string).startsWith(lineNd)) return false
	const lineYear = yearOf(line.competencia)
	const empenhoYear = empenho.exercicio ?? yearOf(empenho.dataEmpenho)
	if (lineYear != null && empenhoYear != null && lineYear !== empenhoYear) return false
	return sameOrOpen(line.ug, empenho.ug) && sameOrOpen(line.ptres, empenho.ptres) && sameOrOpen(line.fonte, empenho.fonte)
}

/**
 * Comprometimento local de UMA linha: o que o sisub empenhou nela depois do snapshot.
 *
 * A comparação é por DIA CIVIL de Brasília (`brasiliaCivilDay`): a NE só tem data, sem hora.
 * - NE de dia posterior ao do snapshot: entra pelo valor VIGENTE (reforço e anulação
 *   inclusos); anulada, não entra (o SIAFI nunca a viu empenhada).
 * - NE do MESMO dia do snapshot: entra também. Sem hora não há como saber se o snapshot já a
 *   viu; a escolha é avisar a mais (o risco é contar duas vezes) em vez de deixar passar um
 *   empenho sem crédito (Lei 4.320, art. 59). O aviso diz a idade do snapshot.
 * - NE de dia anterior: o valor dela já está no empenhado do SIAFI; entram só os eventos do
 *   dia do snapshot em diante (reforço consome, anulação devolve crédito), pela mesma regra.
 */
export function commitmentForCreditLine(
	line: CreditLineKey,
	snapshotAt: string,
	empenhos: readonly ClassifiedEmpenhoEntry[],
	options: { excludeEmpenhoId?: string } = {}
): { comprometimento: number; empenhoIds: string[] } {
	const snapshotDay = brasiliaCivilDay(snapshotAt)
	if (snapshotDay == null) return { comprometimento: 0, empenhoIds: [] }
	let total = 0
	const empenhoIds: string[] = []
	for (const empenho of empenhos) {
		if (empenho.id === options.excludeEmpenhoId) continue
		if (!empenhoConsumesCreditLine(line, empenho)) continue
		const empenhoDay = brasiliaCivilDay(empenho.dataEmpenho)
		if (empenhoDay == null) continue
		let contribution = 0
		if (empenhoDay >= snapshotDay) {
			if (empenho.status !== "ativo") continue
			contribution = Number(empenho.valorVigente ?? 0)
		} else {
			for (const event of empenho.events) {
				const eventDay = brasiliaCivilDay(event.data)
				if (eventDay == null || eventDay < snapshotDay) continue
				contribution += empenhoEventSign(event.tipo) * Number(event.valor ?? 0)
			}
		}
		if (contribution !== 0) {
			total += contribution
			empenhoIds.push(empenho.id)
		}
	}
	return { comprometimento: roundToCents(total), empenhoIds }
}

export interface CreditLineSnapshot extends CreditLineKey, BudgetCreditSnapshot {}

/** Projeção de uma linha com o comprometimento filtrado pela classificação dela. */
export function projectCreditLine(
	line: CreditLineSnapshot,
	empenhos: readonly ClassifiedEmpenhoEntry[],
	now: number = Date.now(),
	options: { excludeEmpenhoId?: string } = {}
): BudgetProjection {
	const { comprometimento } = commitmentForCreditLine(line, line.snapshotAt, empenhos, options)
	const parsed = Date.parse(line.snapshotAt)
	const ageDays = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : Math.floor((now - parsed) / 86_400_000)
	return {
		dotacao: line.dotacao,
		empenhadoSiafi: line.empenhadoSiafi,
		saldoSiafi: line.saldoSiafi,
		comprometimentoLocal: comprometimento,
		saldoProjetado: roundToCents(line.saldoSiafi - comprometimento),
		snapshotAt: line.snapshotAt,
		snapshotAgeDays: ageDays,
		snapshotStale: ageDays > STALE_AFTER_DAYS,
	}
}

function lineSpecificity(line: CreditLineKey): number {
	return normalizeNdPrefix(line.nd).length * 10 + [line.ug, line.ptres, line.fonte].filter((v) => !isBlank(v)).length
}

/**
 * A linha contra a qual uma NE é conferida: a da competência mais recente, entre
 * as que a NE consumiria, e dentre essas a mais específica (ND mais longa, mais
 * campos preenchidos).
 */
export function pickCreditLineForEmpenho<T extends CreditLineKey>(lines: readonly T[], empenho: EmpenhoClassification & { dataEmpenho: string }): T | null {
	const candidates = lines.filter((line) => empenhoConsumesCreditLine(line, empenho))
	if (candidates.length === 0) return null
	return [...candidates].sort((a, b) => b.competencia.localeCompare(a.competencia) || lineSpecificity(b) - lineSpecificity(a))[0] ?? null
}

export type CreditNoteKind = "descentralizacao" | "anulacao"

/** Nota de crédito resumida para a soma por linha (`finance.credit_note`). */
export interface CreditNoteEntry {
	tipo: string
	valor: number
	/** `YYYY-MM-DD`. */
	dataEmissao: string
	ugFavorecida: string | null
	nd: string | null
	ptres: string | null
	fonte: string | null
}

/** Sinal da NC: descentralização traz crédito; anulação (ou devolução) o devolve. */
export function creditNoteSign(tipo: string): 1 | -1 {
	return tipo === "anulacao" ? -1 : 1
}

function creditNoteFeedsLine(line: CreditLineKey, note: CreditNoteEntry): boolean {
	if (isBlank(note.nd)) return false
	// um sentido só: a NC alimenta a linha quando está no nível dela ou abaixo (NC em 33903007
	// alimenta a linha 339030). NC no elemento (339030) NÃO se reparte entre as linhas de
	// subelemento (33903007, 33903010): contada em cada uma, a mesma NC apareceria N vezes.
	if (!normalizeNdPrefix(note.nd as string).startsWith(normalizeNdPrefix(line.nd))) return false
	const lineYear = yearOf(line.competencia)
	if (lineYear != null && yearOf(note.dataEmissao) !== lineYear) return false
	return sameOrOpen(line.ug, note.ugFavorecida) && sameOrOpen(line.ptres, note.ptres) && sameOrOpen(line.fonte, note.fonte)
}

/**
 * Σ das NC registradas que alimentam uma linha, no exercício dela. É conferência, não saldo:
 * o crédito oficial continua sendo o do snapshot do SIAFI. ND num sentido só (ver
 * `creditNoteFeedsLine`); a NC num nível mais genérico que todas as linhas aparece uma vez,
 * no nível dela, por `creditNotesAboveLines`.
 */
export function sumCreditNotesForLine(line: CreditLineKey, notes: readonly CreditNoteEntry[]): number {
	const total = notes.reduce((acc, note) => (creditNoteFeedsLine(line, note) ? acc + creditNoteSign(note.tipo) * Number(note.valor ?? 0) : acc), 0)
	return roundToCents(total)
}

export interface CreditNoteGroup {
	nd: string
	ptres: string | null
	fonte: string | null
	exercicio: number | null
	total: number
	count: number
}

/**
 * As NC que não alimentam linha nenhuma (tipicamente: NC no elemento, linhas no subelemento),
 * agrupadas por ND/PTRES/fonte/exercício. É assim que a NC genérica aparece UMA vez, no nível
 * dela, em vez de somada em cada linha irmã.
 */
export function creditNotesAboveLines(lines: readonly CreditLineKey[], notes: readonly CreditNoteEntry[]): CreditNoteGroup[] {
	const groups = new Map<string, CreditNoteGroup>()
	for (const note of notes) {
		if (isBlank(note.nd) || lines.some((line) => creditNoteFeedsLine(line, note))) continue
		const nd = normalizeNdPrefix(note.nd as string)
		const exercicio = yearOf(note.dataEmissao)
		const key = [nd, note.ptres ?? "", note.fonte ?? "", exercicio ?? ""].join("|")
		const group = groups.get(key) ?? { nd, ptres: note.ptres, fonte: note.fonte, exercicio, total: 0, count: 0 }
		group.total = roundToCents(group.total + creditNoteSign(note.tipo) * Number(note.valor ?? 0))
		group.count += 1
		groups.set(key, group)
	}
	return [...groups.values()].sort((a, b) => a.nd.localeCompare(b.nd))
}

export interface ClassifiedCreditCheck extends CreditCheck {
	/** Linha usada na conferência (null sem crédito importado para a classificação). */
	line: CreditLineKey | null
	projection: BudgetProjection | null
}

/**
 * Conferência de crédito ao registrar uma NE: ALERTA, nunca bloqueio.
 *
 * O sisub registra o ato já praticado no SIAFI, que é quem recusa empenho sem
 * crédito. Aqui a vedação do art. 59 da Lei 4.320 vira aviso: ou o snapshot está
 * velho, ou a NE foi lançada com outra classificação — as duas coisas se
 * corrigem depois, sem travar o registro.
 */
export function checkCreditForClassifiedEmpenho(
	valor: number,
	empenho: EmpenhoClassification & { dataEmpenho: string },
	lines: readonly CreditLineSnapshot[],
	empenhos: readonly ClassifiedEmpenhoEntry[],
	now: number = Date.now(),
	options: { excludeEmpenhoId?: string } = {}
): ClassifiedCreditCheck {
	if (isBlank(empenho.nd)) {
		return {
			status: "no_data",
			excedente: 0,
			message: "Informe a natureza de despesa (ND) para conferir o crédito. A NE é registrada sem essa conferência.",
			line: null,
			projection: null,
		}
	}
	const line = pickCreditLineForEmpenho(lines, empenho)
	if (!line) return { ...checkCreditForEmpenho(valor, null), line: null, projection: null }
	const projection = projectCreditLine(line, empenhos, now, options)
	const check = checkCreditForEmpenho(valor, projection)
	const classification = [`ND ${line.nd}`, isBlank(line.ptres) ? null : `PTRES ${line.ptres}`, isBlank(line.fonte) ? null : `fonte ${line.fonte}`]
		.filter(Boolean)
		.join(", ")
	if (check.status === "insufficient") {
		return {
			...check,
			message: `Crédito insuficiente em ${classification}: ${check.message.replace(" Confirme para prosseguir.", "")} A NE é registrada mesmo assim; confira a classificação ou importe o crédito atualizado (Lei 4.320, art. 59).`,
			line,
			projection,
		}
	}
	return { ...check, message: `${check.message}, em ${classification}`, line, projection }
}
