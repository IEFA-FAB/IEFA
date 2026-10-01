/**
 * Como cada leitura de saldo esconde o item que está numa contagem cega aberta.
 *
 * `hiddenByBlindCount` (`blind-count.server.ts`) diz QUAIS itens se escondem; estas funções dizem
 * COMO, por tela. Ficam fora do `.server.ts` porque teste unitário não importa servidor.
 *
 * O critério de cada uma é não apagar o fato de que o item existe quando isso importa para o
 * trabalho do dia (a nutricionista precisa saber que o iogurte vence na quarta), e sempre apagar o
 * número que a contagem precisa que ninguém tenha visto.
 */

type ItemRef = { ingredientId: string | null; frozenPreparationId: string | null }

function itemKey(row: ItemRef): string {
	return row.ingredientId ?? row.frozenPreparationId ?? ""
}

/**
 * Painel de vencimentos: o lote do item em contagem sai da lista (e dos totais), como sai do
 * painel de estoque; a tela diz quantos lotes ficaram de fora e por quê.
 */
export function withoutBlindCountLots<T extends ItemRef>(rows: readonly T[], hidden: ReadonlySet<string>): { visible: T[]; hiddenLots: number } {
	if (hidden.size === 0) return { visible: [...rows], hiddenLots: 0 }
	const visible = rows.filter((row) => !hidden.has(itemKey(row)))
	return { visible, hiddenLots: rows.length - visible.length }
}

/**
 * "Vence no período": o item fica (a validade é o que o planejamento usa), sem quantidade nem
 * valor.
 */
export function maskBlindCountQuantities<T extends ItemRef & { quantity: number | null; value: number | null }>(
	items: readonly T[],
	hidden: ReadonlySet<string>
): Array<T & { blindCount: boolean }> {
	return items.map((item) => (hidden.has(itemKey(item)) ? { ...item, quantity: null, value: null, blindCount: true } : { ...item, blindCount: false }))
}

/**
 * Baixa por produção, para quem só lê: a linha do insumo em contagem fica (é a tarefa que está
 * pendente), sem o disponível — e sem o "suficiente", que é o mesmo número visto por um limiar.
 */
export function maskBlindCountIssueLines<T extends { ingredientId: string; available: number | null; sufficient: boolean | null }>(
	lines: readonly T[],
	hidden: ReadonlySet<string>
): Array<T & { blindCount: boolean }> {
	return lines.map((line) =>
		hidden.has(line.ingredientId) ? { ...line, available: null, sufficient: null, blindCount: true } : { ...line, blindCount: false }
	)
}
