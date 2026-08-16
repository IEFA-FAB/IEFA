/**
 * Folder review operations: registro de conferência + leitura da última revisão.
 * Espelha ingredient-reviews.ts (Drizzle query layer).
 *
 * `FolderLastReview` projeta a view kitchen.folder_last_review (DISTINCT ON por pasta).
 */

import { folderLastReviewInKitchen, folderReviewInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { eq } from "drizzle-orm"
import { requireAnyPermission, requirePermission } from "../guards/require-permission.ts"
import type { ListFolderLastReviews, RecordFolderReview, VersionActor } from "../schemas/ingredients.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, runQuery } from "../utils/index.ts"

export interface FolderReviewRow {
	id: string
	folder_id: string
	reviewed_by: string | null
	reviewed_by_name: string | null
	note: string | null
	reviewed_at: string
}

/** Última revisão registrada para uma pasta (projeção da view kitchen.folder_last_review). */
export interface FolderLastReview {
	folder_id: string
	reviewed_at: string
	reviewed_by: string | null
	reviewed_by_name: string | null
}

/**
 * Registra um evento de revisão (conferência) da pasta.
 * Cada chamada cria uma nova linha — o histórico de revisões é preservado.
 */
export async function recordFolderReview(db: SisubDb, ctx: UserContext, input: RecordFolderReview, actor?: VersionActor): Promise<FolderReviewRow> {
	// `kitchen.folder` não tem `kitchen_id`: a árvore de pastas é o catálogo da SDAB,
	// uma estrutura só, compartilhada por todas as unidades. Não existe "revisar a
	// própria pasta" — então é global:2 direto, igual a recordIngredientReview.
	// Aceitar `kitchen` aqui deixaria qualquer detentor de escopo local carimbar
	// conferência no catálogo da FAB inteira.
	requirePermission(ctx, "global", 2)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(folderReviewInKitchen)
			.values({
				folderId: input.folderId,
				reviewedBy: actor?.id ?? ctx.userId ?? null,
				reviewedByName: actor?.name ?? null,
				note: input.note ?? null,
			})
			.returning()
	)
	return {
		id: row.id,
		folder_id: row.folderId,
		reviewed_by: row.reviewedBy,
		reviewed_by_name: row.reviewedByName,
		note: row.note,
		reviewed_at: row.reviewedAt,
	}
}

/**
 * Lê a última revisão por pasta.
 * Sem `folderId` → todas as pastas revisadas (para a árvore de insumos).
 * Com `folderId` → apenas a pasta informada.
 */
export async function listFolderLastReviews(db: SisubDb, ctx: UserContext, input: ListFolderLastReviews): Promise<FolderLastReview[]> {
	requireAnyPermission(ctx, ["kitchen", "global"], 1)

	const where = input.folderId ? eq(folderLastReviewInKitchen.folderId, input.folderId) : undefined
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({
				folder_id: folderLastReviewInKitchen.folderId,
				reviewed_at: folderLastReviewInKitchen.reviewedAt,
				reviewed_by: folderLastReviewInKitchen.reviewedBy,
				reviewed_by_name: folderLastReviewInKitchen.reviewedByName,
			})
			.from(folderLastReviewInKitchen)
			.where(where)
	)
	// A view garante folder_id/reviewed_at não-nulos (DISTINCT ON sobre linhas reais).
	return rows as FolderLastReview[]
}
