/**
 * Versão VIGENTE de uma linhagem de preparação — a regra única que a tela (aviso de versão
 * superada), `saveRecipeEdit` e os editores que gravam na própria versão (fluxo de produção,
 * equipamentos) usam. Duas cópias dela divergiriam: a tela bloquearia um Salvar válido ou
 * deixaria passar um que o servidor recusa.
 */

import { recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { eq, or, sql } from "drizzle-orm"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { pickLineageHead } from "../utils/recipe-lineage.ts"

export interface LineageRow {
	id: string
	kitchenId: number | null
	version: number
	deletedAt: string | null
	createdAt: string
}

/** Raiz da linhagem de `recipeId` e o dono da linha (cozinha, ou `null` = global). */
export async function loadRecipeLineageRoot(db: SisubDb, recipeId: string): Promise<{ rootId: string; kitchenId: number | null }> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.recipesInKitchen.findFirst({
			columns: { id: true, kitchenId: true, baseRecipeId: true },
			where: eq(recipesInKitchen.id, recipeId),
		})
	)
	if (!row) throw new NotFoundError("recipe", recipeId)
	return { rootId: row.baseRecipeId ?? row.id, kitchenId: row.kitchenId }
}

/** Todas as linhas da linhagem (raiz + versões e forks), inclusive as excluídas. */
export async function loadLineageRows(db: SisubDb, rootId: string): Promise<LineageRow[]> {
	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: recipesInKitchen.id,
				kitchenId: recipesInKitchen.kitchenId,
				version: recipesInKitchen.version,
				deletedAt: recipesInKitchen.deletedAt,
				createdAt: recipesInKitchen.createdAt,
			})
			.from(recipesInKitchen)
			.where(or(eq(recipesInKitchen.id, rootId), eq(recipesInKitchen.baseRecipeId, rootId)))
	)
}

/** A vigente para quem grava em `targetKitchenId`: só as linhas não excluídas contam, como na listagem. */
export function pickLiveLineageHead<T extends { kitchenId: number | null; version: number; deletedAt: string | null }>(
	rows: readonly T[],
	targetKitchenId: number | null
): T | null {
	return pickLineageHead(
		rows.filter((row) => row.deletedAt == null),
		targetKitchenId
	)
}

/** Serializa gravações na mesma linhagem (novas versões e edição do fluxo/equipamentos). */
export async function lockRecipeLineage(tx: SisubDb, rootId: string): Promise<void> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recipe-lineage:${rootId}`}))`)
}

export function versionConflictError(head: { id: string; version: number }): DomainError {
	return new DomainError(
		"RECIPE_VERSION_CONFLICT",
		`Esta preparação mudou depois que a versão usada como base foi aberta: a versão vigente agora é a v${head.version}. Nada foi gravado: abra a versão vigente e salve sobre ela (na tela da preparação, "Abrir a versão vigente" leva as alterações do rascunho).`,
		{ headId: head.id, headVersion: head.version }
	)
}

/**
 * Recusa gravar o fluxo de produção ou os equipamentos numa versão já superada no escopo dela.
 * Chamar DENTRO da transação da escrita: toma o lock da linhagem, o mesmo de `saveRecipeEdit`,
 * então a gravação ou entra antes da versão nova (e é copiada para ela) ou é recusada.
 */
export async function assertRecipeVersionIsHead(tx: SisubDb, recipeId: string): Promise<void> {
	const { rootId, kitchenId } = await loadRecipeLineageRoot(tx, recipeId)
	await lockRecipeLineage(tx, rootId)
	const head = pickLiveLineageHead(await loadLineageRows(tx, rootId), kitchenId)
	if (head && head.id !== recipeId) throw versionConflictError(head)
}
