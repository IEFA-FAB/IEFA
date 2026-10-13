/**
 * Derivações puras da tela "Saída do dia" (`storage/$kitchenId/issue`).
 */

export const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export type IssueOrigin = "production" | "ad_hoc"

type IssueRequestLike<L> = {
	request: { id: string; status: string; issue_date: string }
	lines: L[]
}

/** Estado da requisição que a página usa antes e depois de ela existir. */
export function deriveIssueState<L extends { requiresReason: boolean; hasReason: boolean }>(request: IssueRequestLike<L> | null, today: string) {
	return {
		open: request?.request.status === "open",
		pending: request?.lines.filter((line) => line.requiresReason && !line.hasReason) ?? [],
		issueDate: request?.request.issue_date ?? today,
		requestId: request?.request.id ?? null,
		requestStatus: request?.request.status ?? null,
	}
}

export type IssueStock = { description: string; measureUnit: string | null; available: number; gtins: string[] }

type BalanceRowLike = {
	ingredientId: string | null
	description: string
	measureUnit: string | null
	balance: number
	quarantinedBalance: number
	expiredBalance: number
}

/** Ingredientes com saldo, para leitura e para a saída fora da sugestão. */
export function buildStockByIngredient(balance: BalanceRowLike[]): Map<string, IssueStock> {
	return new Map(
		balance
			.filter((item) => item.ingredientId != null)
			.map((item) => [
				item.ingredientId as string,
				{
					description: item.description,
					measureUnit: item.measureUnit,
					// Vencido sai da conta junto com a quarentena: a alocação pula os
					// dois. Descontar só um oferecia saldo que `issue_stock` nunca
					// tocaria, e a baixa saía inteira como movimento sem lote.
					available: item.balance - item.quarantinedBalance - item.expiredBalance,
					gtins: [] as string[],
				},
			])
	)
}

/** Insumo escolhido fora da sugestão sem saldo registrado: a saída entra como falta. */
export function isExtraWithoutStock(stockByIngredient: ReadonlyMap<string, IssueStock>, extraIngredientId: string): boolean {
	return extraIngredientId !== "" && (stockByIngredient.get(extraIngredientId)?.available ?? 0) <= 0
}

/** Título e descrição do cabeçalho da requisição aberta. */
export function describeIssueHeader(origin: IssueOrigin, request: { issue_date: string; purpose?: string | null }): { title: string; description: string } {
	return {
		title: `${origin === "ad_hoc" ? "Saída avulsa" : "Saída do dia"} — ${request.issue_date}`,
		description:
			origin === "ad_hoc"
				? `Saída sem cardápio atrás: ${request.purpose ?? "sem motivo registrado"}. Ela não entra na variância do dia.`
				: "A produção sugere; você decide a quantidade. O motivo do desvio é pedido só no fechamento, e apenas onde ele é relevante.",
	}
}

/** Campos do fechamento automático, que o tipo da requisição não declara. */
export function readUnexplainedDay(request: object): { autoClosedAt: string | null; explainedAt: string | null; explanation: string | null } {
	return {
		autoClosedAt: (request as { auto_closed_at?: string | null }).auto_closed_at ?? null,
		explainedAt: (request as { explained_at?: string | null }).explained_at ?? null,
		explanation: (request as { explanation?: string | null }).explanation ?? null,
	}
}
