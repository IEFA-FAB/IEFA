/**
 * Previsão de demanda da cozinha: ciclo pending → sent da previsão que a
 * cozinha envia à unidade para o anexo quantitativo do TR. Camada de query Drizzle.
 *
 * Auth: LEITURA exige `kitchen:1` na cozinha OU `unit:1` numa OM dela (a gestão lê a previsão
 * enviada no wizard do anexo) — ver `requireKitchenOrItsUnit`. ESCRITA exige `kitchen:2` na
 * cozinha dona da previsão, resolvida do banco quando a operação recebe só o id
 * (`authorizeForecast`), e os cardápios citados precisam ser da própria cozinha ou globais.
 *
 * Status: "pending" (editable by kitchen) → "sent". Mensagens de erro especiais
 * (`Erro ao ...: message`) preservadas (prefixo + mensagem do driver).
 */

import {
	kitchenDemandForecastImportInProcurement,
	kitchenDemandForecastInProcurement,
	kitchenDemandForecastSelectionInProcurement,
	kitchenInKitchen,
	menuTemplateInKitchen,
	quantityEstimateInProcurement,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, desc, eq, inArray } from "drizzle-orm"
import { kitchenBelongsToUnit, requireKitchenOrItsUnit } from "../guards/kitchen-unit.ts"
import { requireKitchen, requireUnit } from "../guards/require-permission.ts"
import type {
	CreateDemandForecast,
	DeleteDemandForecast,
	FetchDemandForecasts,
	FetchPendingDemandForecast,
	SendDemandForecast,
	UpdateDemandForecast,
} from "../schemas/procurement.ts"
import { TEMPLATE_TYPE_VOCABULARY } from "../schemas/templates.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toColumns, toWire } from "../utils/index.ts"

type Forecast = Tables<"kitchen_demand_forecast">
type ForecastTemplateRef = { id: string; name: string; template_type: string }
type ForecastSelectionWire = Tables<"kitchen_demand_forecast_selection"> & { template: ForecastTemplateRef | null }
/** Anexo quantitativo em que a previsão entrou (uma previsão serve a várias contratações). */
export type DemandForecastImportWire = { quantity_estimate_id: string; title: string; imported_at: string }
type DemandForecastWithSelections = Forecast & { selections: ForecastSelectionWire[]; imports: DemandForecastImportWire[] }

const FORECAST_RELATIONS: Record<string, string> = { kitchenDemandForecastSelectionInProcurements: "selections", menuTemplateInKitchen: "template" }

type ForecastRow = typeof kitchenDemandForecastInProcurement.$inferSelect

/**
 * Pendura seleções → template nas previsões em queries SEPARADAS, juntadas em JS.
 *
 * A relational query aninhada (previsão → seleções → template) gerava o alias
 * `kitchenAtaDraftInProcurement_kitchenAtaDraftSelectionInProcurements` (69 chars, com os nomes de antes do rename 20260927010000): o Postgres
 * trunca em NAMEDATALEN (63) e o SQL emitido segue citando o nome inteiro → 42703 `column
 * ....template_id does not exist`. Toda leitura de previsão quebrava — inclusive o aviso de
 * previsão enviada no wizard do anexo. É o mesmo bug que `fetchQuantityEstimateDetails` já contornava.
 * Chaves iguais às da relational query, para `FORECAST_RELATIONS` mapear o contrato de wire.
 */
async function attachSelections(db: SisubDb, forecasts: ForecastRow[], prefix: string): Promise<DemandForecastWithSelections[]> {
	if (forecasts.length === 0) return []
	const selections = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select()
				.from(kitchenDemandForecastSelectionInProcurement)
				.where(
					inArray(
						kitchenDemandForecastSelectionInProcurement.forecastId,
						forecasts.map((d) => d.id)
					)
				),
		{ prefix }
	)
	const templateIds = [...new Set(selections.map((s) => s.templateId))]
	const templates =
		templateIds.length > 0
			? await runQuery(
					"FETCH_FAILED",
					() =>
						db
							.select({ id: menuTemplateInKitchen.id, name: menuTemplateInKitchen.name, templateType: menuTemplateInKitchen.templateType })
							.from(menuTemplateInKitchen)
							.where(inArray(menuTemplateInKitchen.id, templateIds)),
					{ prefix }
				)
			: []
	// Tipo no vocabulário do glossário: até o contract do lote 5 o banco ainda tem `exception`.
	const templateById = new Map(templates.map((t) => [t.id, { ...t, templateType: TEMPLATE_TYPE_VOCABULARY.normalize(t.templateType) ?? t.templateType }]))
	const imports = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select({
					forecastId: kitchenDemandForecastImportInProcurement.forecastId,
					quantityEstimateId: kitchenDemandForecastImportInProcurement.quantityEstimateId,
					title: quantityEstimateInProcurement.title,
					importedAt: kitchenDemandForecastImportInProcurement.importedAt,
				})
				.from(kitchenDemandForecastImportInProcurement)
				.innerJoin(quantityEstimateInProcurement, eq(quantityEstimateInProcurement.id, kitchenDemandForecastImportInProcurement.quantityEstimateId))
				.where(
					inArray(
						kitchenDemandForecastImportInProcurement.forecastId,
						forecasts.map((d) => d.id)
					)
				)
				.orderBy(desc(kitchenDemandForecastImportInProcurement.importedAt)),
		{ prefix }
	)
	return forecasts.map((d) => ({
		...toWire<Omit<DemandForecastWithSelections, "imports">>(
			{
				...d,
				kitchenDemandForecastSelectionInProcurements: selections
					.filter((s) => s.forecastId === d.id)
					.map((s) => ({ ...s, menuTemplateInKitchen: templateById.get(s.templateId) ?? null })),
			},
			FORECAST_RELATIONS
		),
		imports: imports
			.filter((i) => i.forecastId === d.id)
			.map((i) => ({ quantity_estimate_id: i.quantityEstimateId, title: i.title, imported_at: i.importedAt })),
	}))
}

/** Previsões de demanda da cozinha, com os cardápios escolhidos, da mais recente para a mais antiga. */
export async function fetchDemandForecasts(db: SisubDb, ctx: UserContext, input: FetchDemandForecasts) {
	await requireKitchenOrItsUnit(db, ctx, 1, input.kitchenId)
	const prefix = "Erro ao buscar previsões de demanda"
	const forecasts = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select()
				.from(kitchenDemandForecastInProcurement)
				.where(eq(kitchenDemandForecastInProcurement.kitchenId, input.kitchenId))
				.orderBy(desc(kitchenDemandForecastInProcurement.createdAt)),
		{ prefix }
	)
	return attachSelections(db, forecasts, prefix)
}

/**
 * A previsão mais recente enviada pela cozinha: `sent` ou já `reviewed`. Recebida pela unidade
 * num anexo, ela continua disponível para os anexos das outras contratações (cada importação
 * fica em `imports`).
 */
export async function fetchPendingDemandForecast(db: SisubDb, ctx: UserContext, input: FetchPendingDemandForecast) {
	// O wizard do anexo chama isto para CADA cozinha da OM: quem compõe o anexo é a gestão da
	// unidade, que não precisa ter a cozinha.
	await requireKitchenOrItsUnit(db, ctx, 1, input.kitchenId)
	const prefix = "Erro ao buscar a previsão de demanda enviada"
	const forecasts = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select()
				.from(kitchenDemandForecastInProcurement)
				.where(and(eq(kitchenDemandForecastInProcurement.kitchenId, input.kitchenId), inArray(kitchenDemandForecastInProcurement.status, ["sent", "reviewed"])))
				.orderBy(desc(kitchenDemandForecastInProcurement.createdAt))
				.limit(1),
		{ prefix }
	)
	const [forecast] = await attachSelections(db, forecasts, prefix)
	return forecast ?? null
}

/**
 * Autoriza pela cozinha DONA da previsão, lida da linha.
 *
 * A entrada dessas operações traz só o `forecastId` — sem resolver o dono, qualquer detentor de
 * `kitchen:2` em uma cozinha editava, enviava ou apagava a previsão de demanda de outra.
 */
async function authorizeForecast(db: SisubDb, ctx: UserContext, forecastId: string): Promise<number> {
	const [row] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ kitchenId: kitchenDemandForecastInProcurement.kitchenId })
			.from(kitchenDemandForecastInProcurement)
			.where(eq(kitchenDemandForecastInProcurement.id, forecastId))
			.limit(1)
	)
	if (!row?.kitchenId) throw new NotFoundError("previsão de demanda", forecastId)
	requireKitchen(ctx, 2, row.kitchenId)
	return row.kitchenId
}

/**
 * Os cardápios citados na previsão são da própria cozinha ou globais. O guard da cozinha prova
 * só a cozinha; o `templateId` vinha do corpo, e uma previsão enviada à OM levava o cardápio
 * LOCAL de outra cozinha — que o wizard do anexo depois abria e calculava.
 */
async function assertTemplatesOfKitchen(db: SisubDb, kitchenId: number, templateIds: readonly string[]): Promise<void> {
	const ids = [...new Set(templateIds)]
	if (ids.length === 0) return
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: menuTemplateInKitchen.id, kitchenId: menuTemplateInKitchen.kitchenId })
			.from(menuTemplateInKitchen)
			.where(inArray(menuTemplateInKitchen.id, ids))
	)
	const ownerById = new Map(rows.map((r) => [r.id, r.kitchenId]))
	const foreign = ids.filter((id) => !ownerById.has(id) || (ownerById.get(id) != null && ownerById.get(id) !== kitchenId))
	if (foreign.length > 0) {
		throw new DomainError("TEMPLATE_ACCESS_DENIED", `Plano(s) de cardápio que não são desta cozinha nem globais: ${foreign.join(", ")}`)
	}
}

/** Cria a previsão de demanda em "pending" com os cardápios escolhidos, numa transação só. */
export async function createDemandForecast(db: SisubDb, ctx: UserContext, input: CreateDemandForecast) {
	requireKitchen(ctx, 2, input.kitchenId)
	await assertTemplatesOfKitchen(
		db,
		input.kitchenId,
		input.selections.map((s) => s.templateId)
	)

	const forecast = await db.transaction(async (tx) => {
		const inserted = await insertOneOrFail(
			"INSERT_FAILED",
			"Erro ao criar previsão de demanda: no row returned",
			() =>
				tx
					.insert(kitchenDemandForecastInProcurement)
					.values({ kitchenId: input.kitchenId, title: input.title, notes: input.notes || null, status: "pending" })
					.returning(),
			{ prefix: "Erro ao criar previsão de demanda" }
		)

		if (input.selections.length > 0) {
			const rows = input.selections.map((s) => ({ forecastId: inserted.id, templateId: s.templateId, repetitions: s.repetitions }))
			await runQuery("INSERT_FAILED", () => tx.insert(kitchenDemandForecastSelectionInProcurement).values(rows), {
				prefix: "Erro ao salvar seleções da previsão de demanda",
			})
		}
		return inserted
	})
	return toWire<Forecast>(forecast)
}

/**
 * Atualiza título e observações da previsão e, se vierem, troca todos os cardápios escolhidos
 * (apaga e insere de novo, numa transação só). `selections` ausente = só os metadados; os
 * cardápios já escolhidos ficam.
 */
export async function updateDemandForecast(db: SisubDb, ctx: UserContext, input: UpdateDemandForecast) {
	const kitchenId = await authorizeForecast(db, ctx, input.forecastId)
	if (input.selections !== undefined) {
		await assertTemplatesOfKitchen(
			db,
			kitchenId,
			input.selections.map((s) => s.templateId)
		)
	}

	const forecast = await db.transaction(async (tx) => {
		const set = { ...toColumns(input.updates), updatedAt: new Date().toISOString() } as Partial<typeof kitchenDemandForecastInProcurement.$inferInsert>
		const updated = await insertOneOrFail(
			"UPDATE_FAILED",
			`Erro ao atualizar previsão de demanda: ${input.forecastId} não encontrada`,
			() => tx.update(kitchenDemandForecastInProcurement).set(set).where(eq(kitchenDemandForecastInProcurement.id, input.forecastId)).returning(),
			{ prefix: "Erro ao atualizar previsão de demanda" }
		)

		if (input.selections !== undefined) {
			await tx.delete(kitchenDemandForecastSelectionInProcurement).where(eq(kitchenDemandForecastSelectionInProcurement.forecastId, input.forecastId))
			if (input.selections.length > 0) {
				const rows = input.selections.map((s) => ({ forecastId: input.forecastId, templateId: s.templateId, repetitions: s.repetitions }))
				await runQuery("UPDATE_FAILED", () => tx.insert(kitchenDemandForecastSelectionInProcurement).values(rows), { prefix: "Erro ao atualizar seleções" })
			}
		}
		return updated
	})
	return toWire<Forecast>(forecast)
}

/** Passa a previsão de "pending" para "sent": a partir daí a unidade a vê no wizard do anexo. */
export async function sendDemandForecast(db: SisubDb, ctx: UserContext, input: SendDemandForecast) {
	await authorizeForecast(db, ctx, input.forecastId)

	await mutateOrFail(
		"UPDATE_FAILED",
		`Erro ao enviar previsão de demanda: ${input.forecastId} não encontrada`,
		() =>
			db
				.update(kitchenDemandForecastInProcurement)
				.set({ status: "sent", updatedAt: new Date().toISOString() })
				.where(eq(kitchenDemandForecastInProcurement.id, input.forecastId))
				.returning({ id: kitchenDemandForecastInProcurement.id }),
		{ prefix: "Erro ao enviar previsão de demanda" }
	)
}

/** Apaga a previsão e os cardápios escolhidos (cascata pela FK). Só a previsão em "pending" deve ser apagada. */
export async function deleteDemandForecast(db: SisubDb, ctx: UserContext, input: DeleteDemandForecast) {
	await authorizeForecast(db, ctx, input.forecastId)

	await mutateOrFail(
		"DELETE_FAILED",
		`Erro ao remover previsão de demanda: ${input.forecastId} não encontrada`,
		() =>
			db
				.delete(kitchenDemandForecastInProcurement)
				.where(eq(kitchenDemandForecastInProcurement.id, input.forecastId))
				.returning({ id: kitchenDemandForecastInProcurement.id }),
		{ prefix: "Erro ao remover previsão de demanda" }
	)
}

/**
 * A unidade importou a previsão da cozinha num anexo: registra a importação e, na primeira,
 * marca a previsão como recebida (`reviewed`) com data e autor — é o retorno que a nutricionista
 * vê. Exige `unit:2` na OM dona do anexo, e a cozinha da previsão precisa ser dessa OM.
 */
export async function recordDemandForecastImport(db: SisubDb, ctx: UserContext, input: { forecastId: string; quantityEstimateId: string }): Promise<void> {
	const [list] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ unitId: quantityEstimateInProcurement.unitId })
			.from(quantityEstimateInProcurement)
			.where(eq(quantityEstimateInProcurement.id, input.quantityEstimateId))
			.limit(1)
	)
	if (!list) throw new NotFoundError("anexo quantitativo", input.quantityEstimateId)
	requireUnit(ctx, 2, list.unitId)

	const [forecast] = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				status: kitchenDemandForecastInProcurement.status,
				unitId: kitchenInKitchen.unitId,
				purchaseUnitId: kitchenInKitchen.purchaseUnitId,
			})
			.from(kitchenDemandForecastInProcurement)
			.innerJoin(kitchenInKitchen, eq(kitchenInKitchen.id, kitchenDemandForecastInProcurement.kitchenId))
			.where(eq(kitchenDemandForecastInProcurement.id, input.forecastId))
			.limit(1)
	)
	if (!forecast) throw new NotFoundError("previsão de demanda", input.forecastId)
	if (!kitchenBelongsToUnit({ id: 0, unitId: forecast.unitId, purchaseUnitId: forecast.purchaseUnitId }, list.unitId)) {
		throw new DomainError("KITCHEN_NOT_IN_UNIT", "A previsão é de uma cozinha de outra OM.")
	}
	if (forecast.status === "pending") throw new DomainError("FORECAST_NOT_SENT", "A cozinha ainda não enviou esta previsão.")

	await runQuery(
		"TRANSACTION_FAILED",
		() =>
			db.transaction(async (tx) => {
				await tx
					.insert(kitchenDemandForecastImportInProcurement)
					.values({ forecastId: input.forecastId, quantityEstimateId: input.quantityEstimateId, importedBy: ctx.userId })
					.onConflictDoNothing({ target: [kitchenDemandForecastImportInProcurement.forecastId, kitchenDemandForecastImportInProcurement.quantityEstimateId] })
				if (forecast.status === "sent") {
					const now = new Date().toISOString()
					await tx
						.update(kitchenDemandForecastInProcurement)
						// Sem tocar updated_at: ele é a data da cozinha (edição, envio). Carimbar aqui
						// reordenava as previsões e fazia uma antiga parecer "atualizada".
						.set({ status: "reviewed", reviewedAt: now, reviewedBy: ctx.userId })
						.where(and(eq(kitchenDemandForecastInProcurement.id, input.forecastId), eq(kitchenDemandForecastInProcurement.status, "sent")))
				}
			}),
		{ prefix: "Erro ao registrar a importação da previsão" }
	)
}
