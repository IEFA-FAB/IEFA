/**
 * Versionamento do insumo no SERVIDOR, na mesma transação da escrita.
 *
 * Antes, só o save da tela de detalhe gravava versão no servidor; os itens de compra e de
 * produto pediam a versão pelo cliente, depois, "best-effort", e as ações em lote, o
 * localizar/substituir e o dialog da árvore não pediam nada — o insumo mudava sem entrar
 * no histórico. Aqui a regra é uma só: toda server fn que altera o agregado do insumo roda
 * dentro de `withIngredientVersions` e diz quais insumos tocou. A escrita e as versões são
 * uma transação: se a versão falhar, a escrita é desfeita.
 *
 * `ingredient-versioning.contract.test.ts` cobra que nenhuma server fn de escrita de
 * `ingredients.fn.ts`/`purchase_item.fn.ts` fique de fora sem motivo escrito.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { recordIngredientVersion } from "@iefa/sisub-domain"
import type { UserContext } from "@iefa/sisub-domain/types"
import { getRequestUser } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"

/** Identidade legível do autor, a partir da sessão (vai para `changed_by_name`). */
export async function resolveActor(): Promise<{ id: string | null; name: string | null }> {
	// `getRequestUser` reaproveita o getUser() que o `requireAuth` já fez nesta request: sem
	// ele, cada escrita versionada (e cada insumo de uma ação em lote) ia de novo ao GoTrue.
	const user = await getRequestUser()
	if (!user) return { id: null, name: null }
	const meta = (user.user_metadata ?? {}) as Record<string, unknown>
	const name = (meta.full_name as string) ?? (meta.name as string) ?? (meta.display_name as string) ?? user.email ?? null
	return { id: user.id, name }
}

/** Marca insumos cuja versão deve ser registrada ao fim da escrita. Ignora vazios. */
export type TouchIngredients = (...ingredientIds: (string | null | undefined)[]) => void

/**
 * Roda `work` numa transação e, antes de confirmar, registra uma versão de cada insumo que
 * ele marcou com `touch`. A versão deduplica pelo snapshot: marcar um insumo cuja parte
 * versionada não mudou não cria linha.
 */
export async function withIngredientVersions<T>(
	ctx: UserContext,
	work: (db: SisubDb, touch: TouchIngredients) => Promise<T>,
	changeSummary?: string
): Promise<T> {
	const actor = await resolveActor()
	return getDb().transaction(async (tx) => {
		const db = tx as unknown as SisubDb
		const touched = new Set<string>()
		const result = await work(db, (...ids) => {
			for (const id of ids) if (id) touched.add(id)
		})
		// Ordem estável: cada versão toma o lock consultivo do insumo até o commit. Em ordem
		// de chegada, duas escritas com insumos em comum (item de compra compartilhado) podiam
		// travar A→B e B→A e cair em deadlock.
		for (const ingredientId of [...touched].sort()) {
			await recordIngredientVersion(db, ctx, { ingredientId, changeSummary }, actor)
		}
		return result
	})
}
