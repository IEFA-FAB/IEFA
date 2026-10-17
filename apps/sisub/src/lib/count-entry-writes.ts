/**
 * O que `postCountEntriesFn` grava para cada lançamento recebido, dado o que já existe com a
 * mesma chave (`client_event_id`) na contagem.
 *
 * A chave é uma por INTENÇÃO do operador (a linha da folha), não por tentativa. Ela volta ao
 * servidor em dois casos:
 *
 * - reenvio do mesmo valor (duplo clique, rede que caiu com o lançamento já gravado, fila
 *   offline): o que existe fica, e nada é somado;
 * - correção do valor antes de a tentativa anterior ser confirmada: se a anterior foi gravada e só
 *   a resposta se perdeu, ela é CORRIGIDA para o valor novo. Inserir com chave nova somaria os
 *   dois (15 e 16 virariam 31), e o `upsert` que ignora o conflito descartaria a correção.
 *
 * Chave já usada por outra pessoa é recusada: corrigir mudaria o lançamento de outro autor.
 *
 * A quantidade é `numeric(14,4)`: o valor recebido se normaliza a 4 casas antes de comparar e de
 * gravar. Sem isso, o reenvio de 1.23456 não batia com o 1.2346 gravado e virava correção, que
 * mexia em `counted_at` sem nada ter mudado.
 */

/** Casas decimais de `inventory_count_entry.quantity` (`numeric(14,4)`). */
export const COUNT_QUANTITY_SCALE = 4

/** A quantidade como o banco a guarda: arredondada a 4 casas. */
export function normalizeCountQuantity(quantity: number | string): number {
	const factor = 10 ** COUNT_QUANTITY_SCALE
	return Math.round(Number(quantity) * factor) / factor
}

export type ExistingCountEntry = { client_event_id: string; counted_by: string | null; quantity: number | string }

export type CountEntryWritePlan<E> = {
	/** Chave nova: insere (com o conflito ignorado, contra a corrida entre a leitura e a escrita). */
	inserts: E[]
	/** Chave do mesmo autor com outro valor: atualiza o lançamento existente. */
	corrections: E[]
}

export function planCountEntryWrites<E extends { clientEventId: string; quantity: number }>(
	entries: readonly E[],
	existing: readonly ExistingCountEntry[],
	userId: string
): CountEntryWritePlan<E> {
	const byKey = new Map(existing.map((row) => [row.client_event_id, row]))
	const plan: CountEntryWritePlan<E> = { inserts: [], corrections: [] }
	for (const entry of entries) {
		const current = byKey.get(entry.clientEventId)
		if (!current) {
			plan.inserts.push(entry)
			continue
		}
		if (current.counted_by !== userId) throw new Error("Este lançamento já foi registrado por outra pessoa: recarregue a folha e lance de novo")
		// mesmo valor: é o reenvio, e o que está gravado vale
		if (normalizeCountQuantity(current.quantity) !== normalizeCountQuantity(entry.quantity)) plan.corrections.push(entry)
	}
	return plan
}

/**
 * Inserções que o `upsert` com o conflito ignorado descartou: a chave apareceu entre a leitura e a
 * escrita (a tentativa anterior ainda gravava). O `.select()` devolve só as inseridas; as outras
 * são relidas e planejadas de novo (reenvio, correção ou chave de outro autor), em vez de virar
 * sucesso com o valor novo descartado.
 */
export function listIgnoredInserts<E extends { clientEventId: string }>(inserts: readonly E[], inserted: ReadonlyArray<{ client_event_id: string }>): E[] {
	const insertedKeys = new Set(inserted.map((row) => row.client_event_id))
	return inserts.filter((entry) => !insertedKeys.has(entry.clientEventId))
}
