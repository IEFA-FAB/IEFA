/**
 * Pastas do catálogo global de eventos e cardápios de apoio (`kitchen.menu_template_folder`,
 * 20261005120000).
 *
 * A SDAB organiza os modelos em dois níveis (Padrão B → Coquetel; Lanche de Bordo → Classe A), na
 * ordem dela. A pasta é só organização: o sistema não deriva padrão, classe nem horário dela.
 *
 * Leitura com `kitchen:1` ou `global:1` (a cozinha vê a árvore dos modelos da SDAB); escrita com
 * `global:2`, como o resto do catálogo global.
 */

import { menuTemplateFolderInKitchen, menuTemplateInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireAnyPermission, requirePermission } from "../guards/require-permission.ts"
import {
	type CreateTemplateFolder,
	type DeleteTemplateFolder,
	type ListTemplateFolders,
	MAX_TEMPLATE_FOLDER_DEPTH,
	type MoveTemplateFolder,
	type SetTemplateFolder,
	type UpdateTemplateFolder,
} from "../schemas/template-folders.ts"
import { isOccasionTemplateType } from "../schemas/templates.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, runQuery, toWire, unwrapPgError } from "../utils/index.ts"

type FolderTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]
type FolderDb = SisubDb | FolderTx

/** Pasta no contrato de leitura (snake_case, como o resto do catálogo). */
export type TemplateFolderWire = {
	id: string
	template_type: "event" | "apoio"
	parent_id: string | null
	name: string
	description: string | null
	sort_order: number
	created_at: string
	deleted_at: string | null
}

/**
 * Violação de um índice único, procurada na cadeia de `cause`: o `runQuery` embrulha o erro do
 * driver num `QueryFailedError` (código de negócio no topo), e o `23505` fica embaixo.
 */
function isUniqueViolationOf(error: unknown, constraintPrefix: string): boolean {
	let current = error as { code?: string; constraint_name?: string; cause?: unknown } | undefined
	for (let depth = 0; current && depth < 10; depth++) {
		const pg = unwrapPgError(current)
		if (pg.code === "23505" && (pg.constraint_name ?? "").startsWith(constraintPrefix)) return true
		current = current.cause as typeof current
	}
	return false
}

/** Violação da unicidade de nome entre pastas irmãs ativas. */
function isDuplicateFolderName(error: unknown): boolean {
	return isUniqueViolationOf(error, "menu_template_folder_sibling_name")
}

/** Violação da unicidade de nome entre modelos ativos da mesma pasta. */
export function isTemplateNameTakenInFolder(error: unknown): boolean {
	return isUniqueViolationOf(error, "menu_template_folder_model_name")
}

/** Mensagem única da recusa de nome repetido na pasta: duas opções precisam ser distinguíveis. */
export function templateNameTakenError(name: string): DomainError {
	return new DomainError(
		"TEMPLATE_NAME_TAKEN_IN_FOLDER",
		`Já existe um modelo chamado "${name.trim()}" nesta pasta. Duas opções na mesma pasta precisam de nomes diferentes.`
	)
}

/** Chave de comparação do nome, igual à do índice único (`lower(btrim(name))`). */
export function folderNameKey(name: string | null | undefined): string {
	return (name ?? "").trim().toLowerCase()
}

/**
 * Primeiro nome livre a partir de `base`: "Brunch (cópia)", "Brunch (cópia 2)"… `taken` traz as
 * chaves ({@link folderNameKey}) dos nomes já usados.
 */
export function firstFreeName(base: string, taken: ReadonlySet<string>, suffix: string): string {
	const trimmed = base.trim()
	for (let n = 1; n < 1000; n++) {
		const candidate = n === 1 ? `${trimmed} (${suffix})` : `${trimmed} (${suffix} ${n})`
		if (!taken.has(folderNameKey(candidate))) return candidate
	}
	return `${trimmed} (${suffix} ${crypto.randomUUID().slice(0, 8)})`
}

/** Nomes (chave) dos modelos ativos de uma pasta. */
export async function fetchTakenTemplateNames(db: FolderDb, folderId: string, exceptTemplateId?: string): Promise<Set<string>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: menuTemplateInKitchen.id, name: menuTemplateInKitchen.name })
			.from(menuTemplateInKitchen)
			.where(and(eq(menuTemplateInKitchen.folderId, folderId), isNull(menuTemplateInKitchen.deletedAt)))
	)
	return new Set(rows.filter((r) => r.id !== exceptTemplateId).map((r) => folderNameKey(r.name)))
}

async function fetchActiveFolder(db: FolderDb, folderId: string) {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateFolderInKitchen.findFirst({
			where: and(eq(menuTemplateFolderInKitchen.id, folderId), isNull(menuTemplateFolderInKitchen.deletedAt)),
		})
	)
	if (!row) throw new NotFoundError("menu_template_folder", folderId)
	return row
}

/**
 * Confere que um modelo pode ficar na pasta: modelo global, do mesmo tipo da pasta, e pasta ativa.
 * A FK sozinha aceitaria pasta removida, e o modelo sumiria num nó que nenhuma tela mostra.
 */
export async function assertTemplateFolderFits(
	db: FolderDb,
	folderId: string,
	template: { kitchenId: number | null; templateType: string | null }
): Promise<void> {
	if (template.kitchenId != null) {
		throw new DomainError(
			"TEMPLATE_FOLDER_ONLY_GLOBAL",
			"Só modelo do catálogo global fica em pasta. O cardápio da cozinha aparece agrupado pela pasta do modelo de origem."
		)
	}
	if (!isOccasionTemplateType(template.templateType)) {
		throw new DomainError("TEMPLATE_FOLDER_ONLY_OCCASIONS", "Pastas existem só para eventos e cardápios de apoio.")
	}
	const folder = await fetchActiveFolder(db, folderId)
	if (folder.templateType !== template.templateType) {
		throw new DomainError(
			"TEMPLATE_FOLDER_TYPE_MISMATCH",
			folder.templateType === "event"
				? "Esta pasta é de eventos; o modelo é um cardápio de apoio."
				: "Esta pasta é de cardápios de apoio; o modelo é um evento."
		)
	}
}

export async function listTemplateFolders(db: SisubDb, ctx: UserContext, input: ListTemplateFolders): Promise<TemplateFolderWire[]> {
	// A cozinha vê a árvore dos modelos da SDAB; a SDAB vê a própria.
	requireAnyPermission(ctx, ["kitchen", "global"], 1)
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(menuTemplateFolderInKitchen)
			.where(
				and(isNull(menuTemplateFolderInKitchen.deletedAt), input.templateType ? eq(menuTemplateFolderInKitchen.templateType, input.templateType) : undefined)
			)
			.orderBy(asc(menuTemplateFolderInKitchen.sortOrder), asc(menuTemplateFolderInKitchen.name))
	)
	return rows.map((r) => toWire<TemplateFolderWire>(r))
}

export async function createTemplateFolder(db: SisubDb, ctx: UserContext, input: CreateTemplateFolder): Promise<TemplateFolderWire> {
	requirePermission(ctx, "global", 2)
	return db.transaction(async (tx) => {
		const parentId = input.parentId ?? null
		if (parentId) {
			const parent = await fetchActiveFolder(tx, parentId)
			if (parent.templateType !== input.templateType) {
				throw new DomainError("TEMPLATE_FOLDER_TYPE_MISMATCH", "A subpasta precisa ser do mesmo tipo da pasta de cima.")
			}
			// Dois níveis: a pasta de cima não pode ser, ela mesma, subpasta.
			if (parent.parentId != null) {
				throw new DomainError("TEMPLATE_FOLDER_TOO_DEEP", `O catálogo tem ${MAX_TEMPLATE_FOLDER_DEPTH} níveis: pasta e subpasta.`)
			}
		}
		// Nova pasta entra no fim das irmãs. Trava por tipo+pai para duas criações juntas não
		// pegarem a mesma posição.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`template-folder:${input.templateType}:${parentId ?? "root"}`}))`)
		const [last] = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ max: sql<number | null>`max(${menuTemplateFolderInKitchen.sortOrder})` })
				.from(menuTemplateFolderInKitchen)
				.where(
					and(
						eq(menuTemplateFolderInKitchen.templateType, input.templateType),
						parentId ? eq(menuTemplateFolderInKitchen.parentId, parentId) : isNull(menuTemplateFolderInKitchen.parentId),
						isNull(menuTemplateFolderInKitchen.deletedAt)
					)
				)
		)
		try {
			const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
				tx
					.insert(menuTemplateFolderInKitchen)
					.values({
						templateType: input.templateType,
						parentId,
						name: input.name,
						description: input.description?.trim() || null,
						sortOrder: (last?.max ?? -1) + 1,
					})
					.returning()
			)
			return toWire<TemplateFolderWire>(row)
		} catch (error) {
			if (isDuplicateFolderName(error)) throw new DomainError("TEMPLATE_FOLDER_DUPLICATE", `Já existe uma pasta "${input.name}" neste nível.`)
			throw error
		}
	})
}

export async function updateTemplateFolder(db: SisubDb, ctx: UserContext, input: UpdateTemplateFolder): Promise<TemplateFolderWire> {
	requirePermission(ctx, "global", 2)
	await fetchActiveFolder(db, input.folderId)
	const updates: Partial<typeof menuTemplateFolderInKitchen.$inferInsert> = {}
	if (input.name !== undefined) updates.name = input.name
	if (input.description !== undefined) updates.description = input.description?.trim() || null
	try {
		const [row] = await runQuery("UPDATE_FAILED", () =>
			Object.keys(updates).length > 0
				? db.update(menuTemplateFolderInKitchen).set(updates).where(eq(menuTemplateFolderInKitchen.id, input.folderId)).returning()
				: db.select().from(menuTemplateFolderInKitchen).where(eq(menuTemplateFolderInKitchen.id, input.folderId))
		)
		if (!row) throw new NotFoundError("menu_template_folder", input.folderId)
		return toWire<TemplateFolderWire>(row)
	} catch (error) {
		if (isDuplicateFolderName(error)) throw new DomainError("TEMPLATE_FOLDER_DUPLICATE", `Já existe uma pasta "${input.name}" neste nível.`)
		throw error
	}
}

/**
 * Troca a pasta de lugar com a irmã vizinha. As irmãs são renumeradas de 0 a n na nova ordem:
 * pasta criada por fora (migration, outra tela) pode ter `sort_order` repetido, e trocar só os dois
 * números deixaria a ordem igual.
 */
export async function moveTemplateFolder(db: SisubDb, ctx: UserContext, input: MoveTemplateFolder): Promise<void> {
	requirePermission(ctx, "global", 2)
	await db.transaction(async (tx) => {
		const folder = await fetchActiveFolder(tx, input.folderId)
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`template-folder:${folder.templateType}:${folder.parentId ?? "root"}`}))`)
		const siblings = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ id: menuTemplateFolderInKitchen.id })
				.from(menuTemplateFolderInKitchen)
				.where(
					and(
						eq(menuTemplateFolderInKitchen.templateType, folder.templateType),
						folder.parentId ? eq(menuTemplateFolderInKitchen.parentId, folder.parentId) : isNull(menuTemplateFolderInKitchen.parentId),
						isNull(menuTemplateFolderInKitchen.deletedAt)
					)
				)
				.orderBy(asc(menuTemplateFolderInKitchen.sortOrder), asc(menuTemplateFolderInKitchen.name))
		)
		const order = siblings.map((s) => s.id)
		const index = order.indexOf(folder.id)
		const target = index + input.delta
		if (index === -1 || target < 0 || target >= order.length) return
		;[order[index], order[target]] = [order[target] as string, order[index] as string]
		for (const [position, id] of order.entries()) {
			await runQuery("UPDATE_FAILED", () =>
				tx
					.update(menuTemplateFolderInKitchen)
					.set({ sortOrder: position })
					.where(eq(menuTemplateFolderInKitchen.id, id))
					.then(() => undefined)
			)
		}
	})
}

/**
 * Remove (soft) uma pasta vazia. Com subpasta ou modelo ativo dentro, recusa dizendo quantos: tirar
 * a pasta deixaria os modelos num nó que nenhuma tela mostra, e esvaziar por eles seria mexer em
 * conteúdo que a SDAB não viu.
 */
export async function deleteTemplateFolder(db: SisubDb, ctx: UserContext, input: DeleteTemplateFolder): Promise<void> {
	requirePermission(ctx, "global", 2)
	await db.transaction(async (tx) => {
		await fetchActiveFolder(tx, input.folderId)
		const [children, templates] = await Promise.all([
			runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: menuTemplateFolderInKitchen.id })
					.from(menuTemplateFolderInKitchen)
					.where(and(eq(menuTemplateFolderInKitchen.parentId, input.folderId), isNull(menuTemplateFolderInKitchen.deletedAt)))
			),
			runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: menuTemplateInKitchen.id })
					.from(menuTemplateInKitchen)
					.where(and(eq(menuTemplateInKitchen.folderId, input.folderId), isNull(menuTemplateInKitchen.deletedAt)))
			),
		])
		if (children.length > 0 || templates.length > 0) {
			const parts = [
				children.length > 0 ? `${children.length} ${children.length === 1 ? "subpasta" : "subpastas"}` : null,
				templates.length > 0 ? `${templates.length} ${templates.length === 1 ? "modelo" : "modelos"}` : null,
			].filter(Boolean)
			throw new DomainError("TEMPLATE_FOLDER_NOT_EMPTY", `A pasta ainda tem ${parts.join(" e ")}. Mova ou remova antes de apagar a pasta.`)
		}
		await runQuery("DELETE_FAILED", () =>
			tx
				.update(menuTemplateFolderInKitchen)
				.set({ deletedAt: new Date().toISOString() })
				.where(eq(menuTemplateFolderInKitchen.id, input.folderId))
				.then(() => undefined)
		)
	})
}

/** Põe um modelo global numa pasta, ou o tira de todas (`folderId: null`). */
export async function setTemplateFolder(db: SisubDb, ctx: UserContext, input: SetTemplateFolder): Promise<void> {
	requirePermission(ctx, "global", 2)
	const template = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateInKitchen.findFirst({
			columns: { id: true, kitchenId: true, templateType: true, name: true, deletedAt: true },
			where: eq(menuTemplateInKitchen.id, input.templateId),
		})
	)
	if (!template || template.deletedAt != null) throw new NotFoundError("menu_template", input.templateId)
	if (input.folderId != null) await assertTemplateFolderFits(db, input.folderId, template)
	else if (template.kitchenId != null) {
		throw new DomainError("TEMPLATE_FOLDER_ONLY_GLOBAL", "Só modelo do catálogo global fica em pasta.")
	}
	try {
		await runQuery("UPDATE_FAILED", () =>
			db
				.update(menuTemplateInKitchen)
				.set({ folderId: input.folderId })
				.where(eq(menuTemplateInKitchen.id, input.templateId))
				.then(() => undefined)
		)
	} catch (error) {
		if (isTemplateNameTakenInFolder(error)) throw templateNameTakenError(template.name ?? "")
		throw error
	}
}

/** Pastas pelo id, para quem precisa do caminho ("Padrão B › Coquetel") sem a árvore inteira. */
export async function fetchFolderPaths(db: FolderDb, folderIds: readonly string[]): Promise<Map<string, string>> {
	const ids = [...new Set(folderIds)]
	if (ids.length === 0) return new Map()
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: menuTemplateFolderInKitchen.id, name: menuTemplateFolderInKitchen.name, parentId: menuTemplateFolderInKitchen.parentId })
			.from(menuTemplateFolderInKitchen)
			.where(inArray(menuTemplateFolderInKitchen.id, ids))
	)
	const parentIds = rows.flatMap((r) => (r.parentId ? [r.parentId] : []))
	const parents =
		parentIds.length > 0
			? await runQuery("FETCH_FAILED", () =>
					db
						.select({ id: menuTemplateFolderInKitchen.id, name: menuTemplateFolderInKitchen.name })
						.from(menuTemplateFolderInKitchen)
						.where(inArray(menuTemplateFolderInKitchen.id, parentIds))
				)
			: []
	const parentName = new Map(parents.map((p) => [p.id, p.name]))
	return new Map(rows.map((r) => [r.id, r.parentId ? `${parentName.get(r.parentId) ?? "?"} › ${r.name}` : r.name]))
}
