/**
 * Segmentação das contratações da OM (change `sisub-procurement-planning-flows`, D3).
 *
 * A OM monta as próprias contratações ("Carnes", "Estocáveis"), cada uma com regras de pasta do
 * catálogo ou de item de compra, e a resolução pura de `segment-resolution.ts` decide a
 * contratação de cada linha do anexo. "Grupo" e "lote" ficam reservados ao sentido da Lei
 * 14.133: grupo de itens é critério de julgamento (art. 82, § 1º) e lote é divisão do objeto
 * (art. 40, § 2º, I).
 *
 * Auth: ler exige `unit:1` na OM; escrever, `unit:2`. A OM de uma contratação sai da linha
 * gravada, nunca do corpo.
 */

import {
	folderInKitchen,
	procurementSegmentInProcurement,
	procurementSegmentRuleInProcurement,
	purchaseItemInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"
import { folderChain, indexSegmentRules, resolveSegment, type SegmentResolution, type SegmentRuleInput, type SegmentRuleMode } from "./segment-resolution.ts"

type TxClient = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]
type Client = SisubDb | TxClient

export interface ProcurementSegmentRule {
	id: string
	mode: SegmentRuleMode
	folderId: string | null
	/** Caminho legível da pasta ("Gêneros de Alimentação › Proteínas"). */
	folderPath: string | null
	purchaseItemId: string | null
	purchaseItemDescription: string | null
}

export interface ProcurementSegment {
	id: string
	unitId: number
	name: string
	description: string | null
	plannedMonth: number | null
	leadTimeMonths: number
	validityMonths: number
	pcaIdentifier: string | null
	rules: ProcurementSegmentRule[]
}

export interface SegmentationLine {
	/** Item de compra, ou `ing:<insumo>` quando o insumo ainda não tem item de compra. */
	key: string
	purchaseItemId: string | null
	description: string
	catmat: number | null
	ingredientNames: string[]
	/** Caminho da pasta do primeiro insumo, para localizar a linha no catálogo. */
	folderPath: string | null
	resolution: SegmentResolution
}

export interface SegmentationOverview {
	segments: Array<ProcurementSegment & { lineCount: number }>
	/** Pastas vivas do catálogo, com o caminho legível, para o editor de regras. */
	folders: Array<{ id: string; path: string }>
	lines: SegmentationLine[]
	unassignedCount: number
	conflictCount: number
}

// ─── Leitura base ───────────────────────────────────────────────────────────────

/** Árvore de pastas do catálogo: pai e caminho legível de cada pasta. */
export async function loadFolderTree(
	client: Client
): Promise<{ parentOf: Map<string, string | null>; pathOf: (id: string | null) => string | null; activeIds: string[] }> {
	const folders = await runQuery(
		"QUERY_FAILED",
		() =>
			client
				.select({ id: folderInKitchen.id, parentId: folderInKitchen.parentId, description: folderInKitchen.description, deletedAt: folderInKitchen.deletedAt })
				.from(folderInKitchen),
		{ prefix: "Erro ao buscar pastas do catálogo" }
	)
	const parentOf = new Map(folders.map((f) => [f.id, f.parentId]))
	const nameOf = new Map(folders.map((f) => [f.id, f.description ?? "Sem nome"]))
	const pathOf = (id: string | null) => {
		if (!id) return null
		return folderChain(id, parentOf)
			.map((f) => nameOf.get(f) ?? "?")
			.reverse()
			.join(" › ")
	}
	return { parentOf, pathOf, activeIds: folders.filter((f) => !f.deletedAt).map((f) => f.id) }
}

/** Contratações não apagadas da OM, com as regras. */
export async function loadUnitSegments(client: Client, unitId: number, pathOf: (id: string | null) => string | null): Promise<ProcurementSegment[]> {
	const segments = await runQuery(
		"QUERY_FAILED",
		() =>
			client
				.select()
				.from(procurementSegmentInProcurement)
				.where(and(eq(procurementSegmentInProcurement.unitId, unitId), isNull(procurementSegmentInProcurement.deletedAt)))
				.orderBy(asc(procurementSegmentInProcurement.plannedMonth), asc(procurementSegmentInProcurement.name)),
		{ prefix: "Erro ao buscar contratações" }
	)
	if (segments.length === 0) return []

	const rules = await runQuery(
		"QUERY_FAILED",
		() =>
			client
				.select({
					id: procurementSegmentRuleInProcurement.id,
					segmentId: procurementSegmentRuleInProcurement.segmentId,
					mode: procurementSegmentRuleInProcurement.mode,
					folderId: procurementSegmentRuleInProcurement.folderId,
					purchaseItemId: procurementSegmentRuleInProcurement.purchaseItemId,
					purchaseItemDescription: purchaseItemInProcurement.description,
				})
				.from(procurementSegmentRuleInProcurement)
				.leftJoin(purchaseItemInProcurement, eq(purchaseItemInProcurement.id, procurementSegmentRuleInProcurement.purchaseItemId))
				.where(
					inArray(
						procurementSegmentRuleInProcurement.segmentId,
						segments.map((s) => s.id)
					)
				)
				.orderBy(asc(procurementSegmentRuleInProcurement.createdAt)),
		{ prefix: "Erro ao buscar regras das contratações" }
	)

	return segments.map((s) => ({
		id: s.id,
		unitId: s.unitId,
		name: s.name,
		description: s.description,
		plannedMonth: s.plannedMonth,
		leadTimeMonths: s.leadTimeMonths,
		validityMonths: s.validityMonths,
		pcaIdentifier: s.pcaIdentifier,
		rules: rules
			.filter((r) => r.segmentId === s.id)
			.map((r) => ({
				id: r.id,
				mode: r.mode as SegmentRuleMode,
				folderId: r.folderId,
				folderPath: pathOf(r.folderId),
				purchaseItemId: r.purchaseItemId,
				purchaseItemDescription: r.purchaseItemDescription,
			})),
	}))
}

export function segmentRuleInputs(segments: readonly ProcurementSegment[]): SegmentRuleInput[] {
	return segments.flatMap((s) => s.rules.map((r) => ({ segmentId: s.id, mode: r.mode, folderId: r.folderId, purchaseItemId: r.purchaseItemId })))
}

/**
 * Resolve linhas agregando, por item de compra, as pastas de todos os insumos que o usam. É por
 * item que o anexo entra na ata: dois insumos do mesmo item vão juntos, ou são conflito.
 */
export function resolveLines<T extends { ingredientId: string; folderId: string | null; purchaseItemId: string | null }>(
	rows: readonly T[],
	rules: readonly SegmentRuleInput[],
	parentOf: ReadonlyMap<string, string | null>
): Map<string, SegmentResolution> {
	const chainsByKey = new Map<string, { purchaseItemId: string | null; chains: string[][] }>()
	for (const row of rows) {
		const key = lineKey(row)
		const entry = chainsByKey.get(key) ?? { purchaseItemId: row.purchaseItemId, chains: [] }
		entry.chains.push(folderChain(row.folderId, parentOf))
		chainsByKey.set(key, entry)
	}
	const indexed = indexSegmentRules(rules)
	const result = new Map<string, SegmentResolution>()
	for (const [key, entry] of chainsByKey) {
		result.set(key, resolveSegment({ purchaseItemId: entry.purchaseItemId, folderChains: entry.chains }, indexed))
	}
	return result
}

export function lineKey(row: { ingredientId: string; purchaseItemId: string | null }): string {
	return row.purchaseItemId ?? `ing:${row.ingredientId}`
}

/**
 * Universo avaliado: os insumos alcançáveis pelos cardápios (semanais, eventos e apoios, não
 * apagados) das cozinhas da OM, onde ela está (`unit_id`) ou para quem compra
 * (`purchase_unit_id`), mais os planos globais que algum anexo dela já usou, com o item de compra
 * padrão. É o universo que o cálculo do anexo percorre.
 */
async function loadUnitUniverse(client: Client, unitId: number) {
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			client.execute(sql`
				select distinct
					i.id as ingredient_id,
					i.description as ingredient_name,
					i.folder_id,
					pi.id as purchase_item_id,
					pi.description as purchase_item_description,
					pi.catmat_item_codigo
				from kitchen.menu_template t
				join kitchen.menu_template_items ti on ti.menu_template_id = t.id
				join kitchen.recipe_ingredients ri on ri.recipe_id = ti.recipe_id and ri.deleted_at is null
				join kitchen.ingredient i on i.id = ri.ingredient_id
				left join procurement.purchase_item_ingredient pii on pii.ingredient_id = i.id and pii.is_default
				left join procurement.purchase_item pi on pi.id = pii.purchase_item_id and pi.deleted_at is null
				where t.deleted_at is null
					and (
						-- cardápios das cozinhas da OM: onde ela está ou para quem ela compra
						t.kitchen_id in (select k.id from kitchen.kitchen k where k.unit_id = ${unitId} or k.purchase_unit_id = ${unitId})
						-- planos globais que algum anexo da OM já usou
						or t.id in (
							select s.template_id
							from procurement.procurement_list_selection s
							join procurement.procurement_list_kitchen lk on lk.id = s.list_kitchen_id
							join procurement.procurement_list l on l.id = lk.list_id
							where l.unit_id = ${unitId} and l.deleted_at is null
						)
					)
			`),
		{ prefix: "Erro ao buscar os itens dos cardápios da OM" }
	)) as unknown as Array<{
		ingredient_id: string
		ingredient_name: string | null
		folder_id: string | null
		purchase_item_id: string | null
		purchase_item_description: string | null
		catmat_item_codigo: number | null
	}>
	return rows.map((r) => ({
		ingredientId: r.ingredient_id,
		ingredientName: r.ingredient_name ?? "",
		folderId: r.folder_id,
		purchaseItemId: r.purchase_item_id,
		purchaseItemDescription: r.purchase_item_description,
		catmat: r.catmat_item_codigo == null ? null : Number(r.catmat_item_codigo),
	}))
}

// ─── Operações ─────────────────────────────────────────────────────────────────

/** Contratações da OM e a resolução de cada item que os cardápios dela usam. */
export async function fetchSegmentationOverview(db: SisubDb, ctx: UserContext, input: { unitId: number }): Promise<SegmentationOverview> {
	requireUnit(ctx, 1, input.unitId)
	const [{ parentOf, pathOf, activeIds }, universe] = await Promise.all([loadFolderTree(db), loadUnitUniverse(db, input.unitId)])
	const segments = await loadUnitSegments(db, input.unitId, pathOf)
	const resolutions = resolveLines(universe, segmentRuleInputs(segments), parentOf)

	const lines = new Map<string, SegmentationLine>()
	for (const row of universe) {
		const key = lineKey(row)
		const existing = lines.get(key)
		if (existing) {
			if (!existing.ingredientNames.includes(row.ingredientName)) existing.ingredientNames.push(row.ingredientName)
			continue
		}
		lines.set(key, {
			key,
			purchaseItemId: row.purchaseItemId,
			description: row.purchaseItemDescription ?? row.ingredientName,
			catmat: row.catmat,
			ingredientNames: [row.ingredientName],
			folderPath: pathOf(row.folderId),
			resolution: resolutions.get(key) ?? { kind: "unassigned" },
		})
	}
	const sorted = [...lines.values()].sort((a, b) => a.description.localeCompare(b.description, "pt-BR"))

	const lineCount = new Map<string, number>()
	for (const line of sorted) {
		if (line.resolution.kind === "assigned") lineCount.set(line.resolution.segmentId, (lineCount.get(line.resolution.segmentId) ?? 0) + 1)
	}

	return {
		segments: segments.map((s) => ({ ...s, lineCount: lineCount.get(s.id) ?? 0 })),
		folders: activeIds.map((id) => ({ id, path: pathOf(id) ?? "" })).sort((a, b) => a.path.localeCompare(b.path, "pt-BR")),
		lines: sorted,
		unassignedCount: sorted.filter((l) => l.resolution.kind === "unassigned").length,
		conflictCount: sorted.filter((l) => l.resolution.kind === "conflict").length,
	}
}

export interface SegmentFields {
	name: string
	description?: string | null
	plannedMonth?: number | null
	leadTimeMonths?: number
	validityMonths?: number
	pcaIdentifier?: string | null
}

/** Nome único por OM entre as contratações não apagadas (o índice parcial também cobra). */
async function assertNameAvailable(client: Client, unitId: number, name: string, exceptId?: string): Promise<void> {
	const rows = await runQuery("QUERY_FAILED", () =>
		client
			.select({ id: procurementSegmentInProcurement.id })
			.from(procurementSegmentInProcurement)
			.where(
				and(
					eq(procurementSegmentInProcurement.unitId, unitId),
					isNull(procurementSegmentInProcurement.deletedAt),
					sql`lower(btrim(${procurementSegmentInProcurement.name})) = lower(btrim(${name}))`
				)
			)
	)
	if (rows.some((r) => r.id !== exceptId)) throw new DomainError("SEGMENT_NAME_TAKEN", `Já existe uma contratação "${name.trim()}" nesta OM.`)
}

export async function createProcurementSegment(db: SisubDb, ctx: UserContext, input: { unitId: number } & SegmentFields): Promise<{ id: string }> {
	requireUnit(ctx, 2, input.unitId)
	await assertNameAvailable(db, input.unitId, input.name)
	return insertOneOrFail(
		"INSERT_FAILED",
		"Erro ao criar contratação: nenhuma linha retornada",
		() =>
			db
				.insert(procurementSegmentInProcurement)
				.values({
					unitId: input.unitId,
					name: input.name.trim(),
					description: input.description?.trim() || null,
					plannedMonth: input.plannedMonth ?? null,
					leadTimeMonths: input.leadTimeMonths ?? 5,
					validityMonths: input.validityMonths ?? 12,
					pcaIdentifier: input.pcaIdentifier?.trim() || null,
					createdBy: ctx.userId,
				})
				.returning({ id: procurementSegmentInProcurement.id }),
		{ prefix: "Erro ao criar contratação" }
	)
}

/**
 * A contratação viva, lida do banco: única leitura da regra "existe e não foi apagada", usada
 * pela edição, pelo rascunho do anexo e pelo cálculo por contratação.
 */
export async function loadLiveSegment(client: Client, segmentId: string): Promise<{ id: string; unitId: number; name: string }> {
	const rows = await runQuery("QUERY_FAILED", () =>
		client
			.select({
				id: procurementSegmentInProcurement.id,
				unitId: procurementSegmentInProcurement.unitId,
				name: procurementSegmentInProcurement.name,
				deletedAt: procurementSegmentInProcurement.deletedAt,
			})
			.from(procurementSegmentInProcurement)
			.where(eq(procurementSegmentInProcurement.id, segmentId))
			.limit(1)
	)
	const row = rows[0]
	if (!row || row.deletedAt) throw new DomainError("SEGMENT_NOT_FOUND", "Contratação não encontrada ou removida: escolha outra.")
	return { id: row.id, unitId: row.unitId, name: row.name }
}

/** OM dona da contratação, lida do banco; recusa a apagada. */
async function authorizeSegment(client: Client, ctx: UserContext, segmentId: string, level: 1 | 2): Promise<number> {
	const segment = await loadLiveSegment(client, segmentId)
	requireUnit(ctx, level, segment.unitId)
	return segment.unitId
}

/**
 * Itens da OM em conflito que envolvem esta contratação. Concluir o anexo dela com conflito
 * aberto deixaria o item fora de qualquer anexo, ou em dois (Lei 14.133/2021, art. 82, VIII).
 */
export async function findSegmentConflicts(client: Client, unitId: number, segmentId: string): Promise<string[]> {
	const [{ parentOf, pathOf }, universe] = await Promise.all([loadFolderTree(client), loadUnitUniverse(client, unitId)])
	const segments = await loadUnitSegments(client, unitId, pathOf)
	const resolutions = resolveLines(universe, segmentRuleInputs(segments), parentOf)
	const descriptions = new Map(universe.map((row) => [lineKey(row), row.purchaseItemDescription ?? row.ingredientName]))
	const conflicts: string[] = []
	for (const [key, resolution] of resolutions) {
		if (resolution.kind === "conflict" && resolution.segmentIds.includes(segmentId)) conflicts.push(descriptions.get(key) ?? key)
	}
	return conflicts.sort((a, b) => a.localeCompare(b, "pt-BR"))
}

export async function updateProcurementSegment(db: SisubDb, ctx: UserContext, input: { segmentId: string } & Partial<SegmentFields>): Promise<void> {
	const unitId = await authorizeSegment(db, ctx, input.segmentId, 2)
	if (input.name !== undefined) await assertNameAvailable(db, unitId, input.name, input.segmentId)
	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao atualizar contratação: ${input.segmentId} não encontrada`,
		() =>
			db
				.update(procurementSegmentInProcurement)
				.set({
					...(input.name !== undefined ? { name: input.name.trim() } : {}),
					...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
					...(input.plannedMonth !== undefined ? { plannedMonth: input.plannedMonth } : {}),
					...(input.leadTimeMonths !== undefined ? { leadTimeMonths: input.leadTimeMonths } : {}),
					...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths } : {}),
					...(input.pcaIdentifier !== undefined ? { pcaIdentifier: input.pcaIdentifier?.trim() || null } : {}),
					updatedAt: new Date().toISOString(),
				})
				.where(eq(procurementSegmentInProcurement.id, input.segmentId))
				.returning({ id: procurementSegmentInProcurement.id }),
		{ prefix: "Erro ao atualizar contratação" }
	)
}

/** Soft delete: anexos antigos guardam a referência histórica. */
export async function deleteProcurementSegment(db: SisubDb, ctx: UserContext, input: { segmentId: string }): Promise<void> {
	await authorizeSegment(db, ctx, input.segmentId, 2)
	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao remover contratação: ${input.segmentId} não encontrada`,
		() =>
			db
				.update(procurementSegmentInProcurement)
				.set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
				.where(eq(procurementSegmentInProcurement.id, input.segmentId))
				.returning({ id: procurementSegmentInProcurement.id }),
		{ prefix: "Erro ao remover contratação" }
	)
}

export async function addProcurementSegmentRule(
	db: SisubDb,
	ctx: UserContext,
	input: { segmentId: string; mode: SegmentRuleMode; folderId?: string | null; purchaseItemId?: string | null }
): Promise<{ id: string }> {
	await authorizeSegment(db, ctx, input.segmentId, 2)
	const folderId = input.folderId ?? null
	const purchaseItemId = input.purchaseItemId ?? null
	if ((folderId == null) === (purchaseItemId == null)) {
		throw new DomainError("VALIDATION_FAILED", "A regra aponta para uma pasta OU para um item de compra.")
	}
	// Mesma pasta/item já na contratação: troca o modo em vez de duplicar (o índice único recusaria).
	const existing = await runQuery("QUERY_FAILED", () =>
		db
			.select({ id: procurementSegmentRuleInProcurement.id })
			.from(procurementSegmentRuleInProcurement)
			.where(
				and(
					eq(procurementSegmentRuleInProcurement.segmentId, input.segmentId),
					folderId
						? eq(procurementSegmentRuleInProcurement.folderId, folderId)
						: eq(procurementSegmentRuleInProcurement.purchaseItemId, purchaseItemId as string)
				)
			)
			.limit(1)
	)
	if (existing[0]) {
		const ruleId = existing[0].id
		await mutateOrFail(
			"UPDATE_FAILED",
			`Erro ao trocar o modo da regra: ${ruleId} não encontrada`,
			() =>
				db
					.update(procurementSegmentRuleInProcurement)
					.set({ mode: input.mode })
					.where(eq(procurementSegmentRuleInProcurement.id, ruleId))
					.returning({ id: procurementSegmentRuleInProcurement.id }),
			{ prefix: "Erro ao trocar o modo da regra" }
		)
		return { id: ruleId }
	}
	return insertOneOrFail(
		"INSERT_FAILED",
		"Erro ao incluir regra: nenhuma linha retornada",
		() =>
			db
				.insert(procurementSegmentRuleInProcurement)
				.values({ segmentId: input.segmentId, mode: input.mode, folderId, purchaseItemId })
				.returning({ id: procurementSegmentRuleInProcurement.id }),
		{ prefix: "Erro ao incluir regra" }
	)
}

export async function removeProcurementSegmentRule(db: SisubDb, ctx: UserContext, input: { ruleId: string }): Promise<void> {
	const rows = await runQuery("QUERY_FAILED", () =>
		db
			.select({ segmentId: procurementSegmentRuleInProcurement.segmentId })
			.from(procurementSegmentRuleInProcurement)
			.where(eq(procurementSegmentRuleInProcurement.id, input.ruleId))
			.limit(1)
	)
	if (!rows[0]) throw new NotFoundError("regra", input.ruleId)
	await authorizeSegment(db, ctx, rows[0].segmentId, 2)
	// Regra que outra aba já apagou não é sucesso silencioso.
	await mutateOrFail(
		"DELETE_FAILED",
		"A regra já não existe: recarregue a segmentação.",
		() =>
			db
				.delete(procurementSegmentRuleInProcurement)
				.where(eq(procurementSegmentRuleInProcurement.id, input.ruleId))
				.returning({ id: procurementSegmentRuleInProcurement.id }),
		{ prefix: "Erro ao remover regra" }
	)
}

/**
 * Filtro do cálculo do anexo por contratação: recebe as linhas do cálculo (insumo → item de
 * compra) e devolve a resolução de cada uma. Usado por `calculateAtaNeeds` quando o anexo é de
 * uma contratação.
 */
export async function resolveNeedsForSegment(
	client: Client,
	unitId: number,
	needs: ReadonlyArray<{ ingredient_id: string; folder_id: string | null; purchase_item_id: string | null }>
): Promise<Map<string, SegmentResolution>> {
	const [{ parentOf, pathOf }, universe] = await Promise.all([loadFolderTree(client), loadUnitUniverse(client, unitId)])
	const segments = await loadUnitSegments(client, unitId, pathOf)
	// O universo da OM entra junto: um item cujo outro insumo está num cardápio fora deste anexo
	// continua em conflito aqui, como na tela de segmentação. Resolver só com as linhas do
	// cálculo esconderia o conflito justamente no anexo.
	const rows = [...universe, ...needs.map((n) => ({ ingredientId: n.ingredient_id, folderId: n.folder_id, purchaseItemId: n.purchase_item_id }))]
	return resolveLines(rows, segmentRuleInputs(segments), parentOf)
}
