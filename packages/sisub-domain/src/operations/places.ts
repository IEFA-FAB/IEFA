/**
 * Org-hierarchy + mess-hall operations. Drizzle query layer.
 *
 * Auth: leituras da hierarquia são apenas autenticadas (catálogo visível a qualquer sessão);
 * `addOtherPresence` escreve presença de terceiro e exige `messhall:2` no refeitório.
 *
 * `units`/`mess_halls` têm PK bigserial → o id volta BigInt no Drizzle; `toWire`
 * coage para number (contrato), e updates por id usam `BigInt(input.id)`.
 */

import {
	kitchenInKitchen,
	mealForecastsInKitchen,
	messHallsInKitchen,
	otherPresencesInKitchen,
	type SisubDb,
	unitsInCore,
	vUserIdentityInCore,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, count, eq, inArray, or } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { requireMessHall, requirePermission } from "../guards/require-permission.ts"
import type {
	AddOtherPresence,
	ApplyPlacesDiff,
	FetchMessHallByCode,
	FetchOtherPresencesCount,
	FetchUserMealForecast,
	ListPlaces,
	ResolveDisplayName,
	UpdateEntityInput,
} from "../schemas/places.ts"
import type { UserContext } from "../types/context.ts"
import { driverFailure, runQuery, toWire } from "../utils/index.ts"

type Unit = Tables<"units">
type Kitchen = Tables<"kitchen">
type MessHall = Tables<"mess_halls">

// ─── Reference reads ────────────────────────────────────────────────────────

/**
 * Unidades para seleção. Exclui o escopo de treino por padrão — ver `ListPlaces`.
 */
/**
 * Filtro de escopo de treino, ponto ÚNICO por entidade.
 *
 * As sentinelas de treino saem de toda listagem de produção por padrão; incluí-las é opt-in
 * explícito (`includeTraining`), usado só pelo painel da SDAB. Centralizar aqui é o que
 * impede o modo de falha real: um seletor novo esquecer o filtro e vazar a cozinha de treino
 * para todo mundo — ou pior, deixar dado de treino entrar num indicador.
 */
function trainingFilter(column: PgColumn, input?: ListPlaces) {
	return input?.includeTraining ? undefined : eq(column, false)
}

/**
 * Ids que a sessão alcança por grant ESCOPADO explícito (allow, nível > 0) numa das colunas.
 *
 * É a única exceção ao filtro de treino: quem tem o "Conjunto Treino" recebe `unit:2` NA
 * sentinela, e sem isto os seletores de Gestão Unidade, Análises da Unidade e Refeitório
 * voltavam "Nenhuma unidade disponível" — o aluno tinha a permissão e não tinha a tela. Grant
 * global (sem escopo) NÃO conta: é exatamente o caso em que o treino não pode vazar.
 */
function explicitScopeIds(ctx: UserContext, key: "unit_id" | "kitchen_id" | "mess_hall_id"): number[] {
	const ids = new Set<number>()
	for (const p of ctx.permissions) {
		const id = p[key]
		if (p.level > 0 && id != null) ids.add(Number(id))
	}
	return [...ids]
}

/**
 * Só as unidades COMPRADORAS (`type = 'purchase'`) — mais a sentinela de treino, quando
 * pedida.
 *
 * `core.units` deixou de ser só a lista das compradoras do sisub: o Projeto α cadastra as
 * OMs APOIADAS (IAE, DCTA, IEFA-SJ…) como `consumption`, sem cozinha, sem refeitório e sem
 * UASG, para escopar acesso por OM (20260918…_alpha_role_modules_unit_scope). Este é o
 * seletor de unidade do sisub inteiro (módulo Unidade, Análises da Unidade, escopo de
 * permissão) — sem o filtro, as apoiadas apareceriam ali como unidades vazias. A sentinela
 * de treino é `consumption` também, e entra pelo `or` quando o chamador a pede.
 */
function unitListFilter(ctx: UserContext, input?: ListPlaces) {
	const purchase = eq(unitsInCore.type, "purchase")
	if (input?.includeTraining) return or(purchase, eq(unitsInCore.isTraining, true))
	const production = and(purchase, eq(unitsInCore.isTraining, false))
	const granted = explicitScopeIds(ctx, "unit_id")
	return granted.length > 0 ? or(production, and(eq(unitsInCore.isTraining, true), inArray(unitsInCore.id, granted.map(BigInt)))) : production
}

export async function listUnits(
	db: SisubDb,
	ctx: UserContext,
	input?: ListPlaces
): Promise<Array<{ id: number; code: string | null; display_name: string | null; type: null }>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.unitsInCore.findMany({
			columns: { id: true, code: true, displayName: true },
			where: unitListFilter(ctx, input),
			orderBy: (u, { asc }) => [asc(u.displayName)],
		})
	)
	return rows.map((r) => {
		const w = toWire<{ id: number; code: string | null; display_name: string | null }>(r)
		return { id: w.id, code: w.code, display_name: w.display_name, type: null }
	})
}

export async function listAllMessHalls(
	db: SisubDb,
	ctx: UserContext,
	input?: ListPlaces
): Promise<Array<Pick<MessHall, "id" | "unit_id" | "code" | "display_name" | "kitchen_id">>> {
	// Refeitório de treino: visível a quem tem grant escopado nele, na unidade ou na cozinha dele.
	const grantedHall = [
		inArray(messHallsInKitchen.id, explicitScopeIds(ctx, "mess_hall_id").map(BigInt)),
		inArray(messHallsInKitchen.unitId, explicitScopeIds(ctx, "unit_id")),
		inArray(messHallsInKitchen.kitchenId, explicitScopeIds(ctx, "kitchen_id")),
	]
	const where = input?.includeTraining
		? undefined
		: or(eq(messHallsInKitchen.isTraining, false), and(eq(messHallsInKitchen.isTraining, true), or(...grantedHall)))
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInKitchen.findMany({
			columns: { id: true, unitId: true, code: true, displayName: true, kitchenId: true },
			where,
			orderBy: (m, { asc }) => [asc(m.displayName)],
		})
	)
	return rows.map((r) => toWire(r))
}

export async function fetchPlacesGraph(
	db: SisubDb,
	_ctx: UserContext,
	input?: ListPlaces
): Promise<{ units: Unit[]; kitchens: Kitchen[]; messHalls: MessHall[] }> {
	const [units, kitchens, messHalls] = await runQuery("FETCH_FAILED", () =>
		Promise.all([
			db.select().from(unitsInCore).where(trainingFilter(unitsInCore.isTraining, input)).orderBy(asc(unitsInCore.displayName)),
			db.select().from(kitchenInKitchen).where(trainingFilter(kitchenInKitchen.isTraining, input)).orderBy(asc(kitchenInKitchen.displayName)),
			db.select().from(messHallsInKitchen).where(trainingFilter(messHallsInKitchen.isTraining, input)).orderBy(asc(messHallsInKitchen.displayName)),
		])
	)
	return {
		units: units.map((r) => toWire<Unit>(r)),
		kitchens: kitchens.map((r) => toWire<Kitchen>(r)),
		messHalls: messHalls.map((r) => toWire<MessHall>(r)),
	}
}

// ─── Org-graph mutations ────────────────────────────────────────────────────

export async function updatePlacesEntity(db: SisubDb, ctx: UserContext, input: UpdateEntityInput) {
	// A estrutura organizacional (OM, cozinha, refeitório) é da SDAB — sem este gate
	// qualquer usuário autenticado renomeava unidades e refeitórios da FAB inteira.
	requirePermission(ctx, "global", 2)

	await runQuery("UPDATE_FAILED", () => {
		if (input.entityType === "unit") {
			return db
				.update(unitsInCore)
				.set({ displayName: input.display_name, code: input.code, type: input.type })
				.where(eq(unitsInCore.id, BigInt(input.id)))
		}
		if (input.entityType === "kitchen") {
			return db.update(kitchenInKitchen).set({ displayName: input.display_name, type: input.type }).where(eq(kitchenInKitchen.id, input.id))
		}
		return db
			.update(messHallsInKitchen)
			.set({ displayName: input.display_name, code: input.code })
			.where(eq(messHallsInKitchen.id, BigInt(input.id)))
	})
	return { ok: true as const }
}

// Mapeia a coluna (snake, validada pelo Zod) → prop camelCase do Drizzle. `satisfies` garante,
// em compile-time, que cada destino é uma coluna real da tabela (sem o silent-drop do cast genérico).
const KITCHEN_DIFF_KEY = { unit_id: "unitId", purchase_unit_id: "purchaseUnitId", kitchen_id: "kitchenId" } satisfies Record<
	string,
	keyof typeof kitchenInKitchen.$inferInsert
>
const MESS_HALL_DIFF_KEY = { unit_id: "unitId", kitchen_id: "kitchenId" } satisfies Record<string, keyof typeof messHallsInKitchen.$inferInsert>

export async function applyPlacesDiff(db: SisubDb, ctx: UserContext, input: ApplyPlacesDiff) {
	// Idem: o diff reparenteia cozinhas e refeitórios. Sem gate, qualquer sessão válida
	// remontava a hierarquia.
	requirePermission(ctx, "global", 2)

	await Promise.all(
		input.diffs.map(async (diff) => {
			try {
				if (diff.table === "kitchen") {
					await db
						.update(kitchenInKitchen)
						.set({ [KITCHEN_DIFF_KEY[diff.column]]: diff.newValue })
						.where(eq(kitchenInKitchen.id, diff.recordId))
				} else {
					await db
						.update(messHallsInKitchen)
						.set({ [MESS_HALL_DIFF_KEY[diff.column]]: diff.newValue })
						.where(eq(messHallsInKitchen.id, BigInt(diff.recordId)))
				}
			} catch (e) {
				throw driverFailure("UPDATE_FAILED", e, `Falha ao atualizar ${diff.table} (id ${diff.recordId})`, `Falha ao atualizar ${diff.table}`)
			}
		})
	)
	return { ok: true as const, count: input.diffs.length }
}

// ─── Mess-hall lookups + diner presence ─────────────────────────────────────

export async function fetchMessHallByCode(
	db: SisubDb,
	_ctx: UserContext,
	input: FetchMessHallByCode
): Promise<Pick<MessHall, "id" | "unit_id" | "code" | "display_name"> | null> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInKitchen.findFirst({
			columns: { id: true, unitId: true, code: true, displayName: true },
			where: eq(messHallsInKitchen.code, input.code),
		})
	)
	return row ? toWire(row) : null
}

export async function fetchMessHallIdByCode(db: SisubDb, _ctx: UserContext, input: FetchMessHallByCode): Promise<number | null> {
	if (!input.code) return null
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInKitchen.findFirst({ columns: { id: true }, where: eq(messHallsInKitchen.code, input.code) })
	)
	return row ? Number(row.id) : null
}

export async function fetchUserMealForecast(db: SisubDb, _ctx: UserContext, input: FetchUserMealForecast): Promise<{ will_eat: boolean | null } | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ will_eat: mealForecastsInKitchen.willEat })
			.from(mealForecastsInKitchen)
			.where(
				and(
					eq(mealForecastsInKitchen.userId, input.userId),
					eq(mealForecastsInKitchen.date, input.date),
					eq(mealForecastsInKitchen.meal, input.meal),
					eq(mealForecastsInKitchen.messHallId, input.messHallId)
				)
			)
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchOtherPresencesCount(db: SisubDb, _ctx: UserContext, input: FetchOtherPresencesCount): Promise<number> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ value: count() })
			.from(otherPresencesInKitchen)
			.where(
				and(
					eq(otherPresencesInKitchen.date, input.date),
					eq(otherPresencesInKitchen.meal, input.meal),
					eq(otherPresencesInKitchen.messHallId, input.messHallId)
				)
			)
	)
	return rows[0]?.value ?? 0
}

export async function addOtherPresence(db: SisubDb, ctx: UserContext, input: AddOtherPresence) {
	// Presença de não-cadastrado lançada pelo fiscal do rancho.
	requireMessHall(ctx, 2, input.messHallId)

	await runQuery("INSERT_FAILED", () =>
		db.insert(otherPresencesInKitchen).values({ adminId: input.adminId, date: input.date, meal: input.meal, messHallId: input.messHallId })
	)
}

/**
 * Nome de exibição de uma pessoa, para o fiscal conferir quem ele acabou de ler no QR.
 *
 * O próprio nome é livre; o de TERCEIRO exige `messhall:1` no rancho informado — o guard
 * vivia só na server fn, e esta operação descartava o contexto. A pessoa NÃO precisa ser da
 * OM do rancho, e isso é deliberado: o comensal de outra OM é atendido em qualquer rancho, e
 * restringir ao efetivo da unidade deixaria o fiscal sem saber quem entrou. O que se entrega
 * é o nome de exibição e só — e só a quem opera a fiscalização de um rancho.
 */
export async function resolveDisplayName(db: SisubDb, ctx: UserContext, input: ResolveDisplayName): Promise<string | null> {
	if (input.userId !== ctx.userId) requireMessHall(ctx, 1, input.messHallId)
	try {
		const rows = await db
			.select({ display_name: vUserIdentityInCore.displayName })
			.from(vUserIdentityInCore)
			.where(eq(vUserIdentityInCore.id, input.userId))
			.limit(1)
		return rows[0]?.display_name ?? null
	} catch {
		return null
	}
}
