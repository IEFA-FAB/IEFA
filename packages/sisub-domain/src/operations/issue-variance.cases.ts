/**
 * Tabela de casos-contrato da regra de tolerância do dia.
 *
 * A mesma regra vive em DOIS lugares: `evaluateVariance`/`checkDayClosure` (TS, que a tela e o
 * fechamento manual usam) e `inventory.close_stale_issue_requests` (SQL, o fechamento automático
 * das 03h, migration 20260926217000). Duas implementações divergem em silêncio — por isso as duas
 * passam por ESTA tabela:
 *  - TS: `issue-variance.test.ts › contrato com o fechamento automático` (unitário);
 *  - SQL: `apps/sisub/src/test/operations/execution-never-blocks.operations.test.ts › contrato da
 *    tolerância` (banco real), que monta cada caso numa requisição e confere o status do fechamento.
 *
 * Caso novo entra aqui, nunca num dos dois testes só. `pending` = a linha pede motivo e não tem
 * (no SQL: o dia fecha `closed_unexplained`).
 */

import type { IssueToleranceSettings, IssueVarianceReason } from "./issue-variance.ts"

export interface IssueVarianceContractCase {
	name: string
	/** Tolerância da cozinha; ausente = os defaults (10 % e R$ 20), iguais no TS e no banco. */
	settings?: IssueToleranceSettings
	suggestedQty: number | null
	issuedQty: number
	returnedQty?: number
	/** Custo da saída; sem saída, o custo médio da cozinha. `null` = sem custo nenhum. */
	unitCost: number | null
	reason?: IssueVarianceReason
	pending: boolean
}

export const DEFAULT_ISSUE_TOLERANCE: IssueToleranceSettings = { tolerancePct: 10, toleranceFloorValue: 20 }

export const ISSUE_VARIANCE_CONTRACT_CASES: readonly IssueVarianceContractCase[] = [
	{ name: "dentro das duas tolerâncias", suggestedQty: 10, issuedQty: 10.5, unitCost: 10, pending: false },
	{ name: "acima do percentual, abaixo do piso", suggestedQty: 10, issuedQty: 12, unitCost: 5, pending: false },
	{ name: "acima do piso, dentro do percentual", suggestedQty: 100, issuedQty: 105, unitCost: 10, pending: false },
	{ name: "acima das duas: nada saiu do planejado", suggestedQty: 10, issuedQty: 0, unitCost: 10, pending: true },
	{ name: "acima das duas: saiu a mais", suggestedQty: 10, issuedQty: 15, unitCost: 10, pending: true },
	{ name: "exatamente no limite das duas não pede motivo", suggestedQty: 10, issuedQty: 11, unitCost: 20, pending: false },
	{ name: "sugestão zero com saída pede motivo (o plano disse nada disto)", suggestedQty: 0, issuedQty: 5, unitCost: 10, pending: true },
	{ name: "sugestão zero sem saída", suggestedQty: 0, issuedQty: 0, unitCost: 10, pending: false },
	{ name: "sem sugestão (nunca esteve no plano) não pede motivo", suggestedQty: null, issuedQty: 50, unitCost: 10, pending: false },
	{ name: "motivo já registrado", suggestedQty: 10, issuedQty: 0, unitCost: 10, reason: "production_loss", pending: false },
	{ name: "a devolução compensa a saída", suggestedQty: 10, issuedQty: 15, returnedQty: 5, unitCost: 10, pending: false },
	{ name: "sem custo, o piso nunca é passado", suggestedQty: 10, issuedQty: 0, unitCost: null, pending: false },
	{
		name: "tolerância própria da cozinha: dentro",
		settings: { tolerancePct: 50, toleranceFloorValue: 0 },
		suggestedQty: 10,
		issuedQty: 14,
		unitCost: 1,
		pending: false,
	},
	{
		name: "tolerância própria da cozinha: fora",
		settings: { tolerancePct: 50, toleranceFloorValue: 0 },
		suggestedQty: 10,
		issuedQty: 16,
		unitCost: 1,
		pending: true,
	},
]
