/**
 * Matemática pura do crédito orçamentário (Fase 2 da execução).
 *
 * Regra central, herdada do painel de ARP: saldo OFICIAL (snapshot do SIAFI)
 * e COMPROMETIMENTO LOCAL (empenhos do sisub posteriores ao snapshot) são
 * grandezas de origens diferentes e NUNCA se somam. O "saldo projetado" é uma
 * terceira grandeza derivada, sempre exibida com rótulo próprio.
 */

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
	return Number(total.toFixed(2))
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
		saldoProjetado: Number((snapshot.saldoSiafi - comprometimentoLocal).toFixed(2)),
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
	const excedente = Number((valor - projection.saldoProjetado).toFixed(2))
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
