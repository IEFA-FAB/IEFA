/**
 * Painel de subsistência de uma unidade: previsão, presença e o diretório das pessoas que
 * aparecem nelas. Camada Drizzle.
 *
 * ANTES isto era um cliente HTTP contra `api.iefa.com.br`, chamado do NAVEGADOR: as rotas
 * `/api/rancho_previsoes`, `/api/wherewhowhen`, `/api/user-data` e `/api/user-military-data`
 * eram anônimas, então o painel funcionava sem sessão — e qualquer um na internet baixava o
 * mesmo dado com um GET. Ler do banco pelo servidor, atrás de um guard de PBAC, é o que
 * permite fechar aquelas rotas.
 *
 * Duas correções de escopo vêm junto, e não são acidentais:
 *   - o recorte é a UNIDADE da rota. A versão HTTP ignorava `unitId` e trazia todos os
 *     refeitórios da FAB, inclusive para quem só tinha acesso a um.
 *   - o diretório de pessoas sai das linhas encontradas, nunca de uma lista de ids vinda do
 *     cliente. Um endpoint que aceita `id=` de terceiro é um enumerador de gente.
 */

import {
	mealForecastsInKitchen,
	mealPresencesInKitchen,
	messHallsInKitchen,
	type SisubDb,
	userDataInCore,
	userMilitaryDataInCore,
} from "@iefa/database/drizzle/sisub"
import { and, asc, between, eq, inArray } from "drizzle-orm"
import type { UnitDashboard } from "../schemas/dashboard.ts"
import type { DashboardPresenceRecord, ForecastRecord, MessHallAPI, UserDataAPI, UserMilitaryDataAPI } from "../types/dashboard.ts"
import { NotFoundError } from "../types/errors.ts"
import type { MealKey } from "../types/meal.ts"
import { runQuery } from "../utils/index.ts"

export interface UnitDashboardData {
	/** Todos os refeitórios da unidade — a lista alimenta o filtro, então não segue `messHallId`. */
	messHalls: MessHallAPI[]
	forecasts: ForecastRecord[]
	presences: DashboardPresenceRecord[]
	users: UserDataAPI[]
	militaries: UserMilitaryDataAPI[]
}

export async function getUnitDashboard(db: SisubDb, input: UnitDashboard): Promise<UnitDashboardData> {
	const messHallRows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: messHallsInKitchen.id,
				unit_id: messHallsInKitchen.unitId,
				code: messHallsInKitchen.code,
				display_name: messHallsInKitchen.displayName,
			})
			.from(messHallsInKitchen)
			.where(eq(messHallsInKitchen.unitId, input.unitId))
			.orderBy(asc(messHallsInKitchen.code))
	)

	// `mess_halls.id` é bigint no Drizzle e `meal_*.mess_hall_id` é bigint-53 (number). O
	// contrato da tela é `number`, então a conversão acontece aqui, uma vez, e não espalhada
	// por cada comparação.
	const messHalls: MessHallAPI[] = messHallRows.map((m) => ({
		id: Number(m.id),
		unit_id: m.unit_id,
		code: m.code,
		display_name: m.display_name ?? "",
	}))

	// Refeitório de outra unidade não é "sem resultado": é pedido fora do escopo que o guard
	// autorizou. Devolver vazio aqui deixaria a tela afirmar que não houve movimento.
	if (input.messHallId !== undefined && !messHalls.some((m) => m.id === input.messHallId)) {
		throw new NotFoundError("mess_hall", String(input.messHallId))
	}

	const scopedIds = input.messHallId !== undefined ? [input.messHallId] : messHalls.map((m) => m.id)
	if (scopedIds.length === 0) return { messHalls: [], forecasts: [], presences: [], users: [], militaries: [] }

	const [forecastRows, presenceRows] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					user_id: mealForecastsInKitchen.userId,
					date: mealForecastsInKitchen.date,
					meal: mealForecastsInKitchen.meal,
					will_eat: mealForecastsInKitchen.willEat,
					mess_hall_id: mealForecastsInKitchen.messHallId,
					created_at: mealForecastsInKitchen.createdAt,
					updated_at: mealForecastsInKitchen.updatedAt,
				})
				.from(mealForecastsInKitchen)
				.where(and(inArray(mealForecastsInKitchen.messHallId, scopedIds), between(mealForecastsInKitchen.date, input.startDate, input.endDate)))
		),
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					user_id: mealPresencesInKitchen.userId,
					date: mealPresencesInKitchen.date,
					meal: mealPresencesInKitchen.meal,
					mess_hall_id: mealPresencesInKitchen.messHallId,
					created_at: mealPresencesInKitchen.createdAt,
					updated_at: mealPresencesInKitchen.updatedAt,
				})
				.from(mealPresencesInKitchen)
				.where(and(inArray(mealPresencesInKitchen.messHallId, scopedIds), between(mealPresencesInKitchen.date, input.startDate, input.endDate)))
		),
	])

	const forecasts: ForecastRecord[] = forecastRows.map((r) => ({
		user_id: r.user_id,
		date: r.date,
		meal: r.meal as MealKey,
		will_eat: r.will_eat,
		mess_hall_id: r.mess_hall_id,
		created_at: r.created_at ?? "",
		updated_at: r.updated_at ?? "",
	}))

	const presences: DashboardPresenceRecord[] = presenceRows.map((r) => ({
		user_id: r.user_id,
		date: r.date,
		meal: r.meal as MealKey,
		mess_hall_id: r.mess_hall_id,
		created_at: r.created_at,
		updated_at: r.updated_at ?? "",
	}))

	// O diretório é derivado das linhas: só entra quem aparece na previsão ou na presença da
	// unidade, no intervalo pedido.
	const userIds = [...new Set([...forecasts.map((f) => f.user_id), ...presences.map((p) => p.user_id)])]
	if (userIds.length === 0) return { messHalls, forecasts, presences, users: [], militaries: [] }

	const userRows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: userDataInCore.id,
				created_at: userDataInCore.createdAt,
				email: userDataInCore.email,
				nrOrdem: userDataInCore.nrOrdem,
			})
			.from(userDataInCore)
			.where(inArray(userDataInCore.id, userIds))
	)

	const nrOrdens = [...new Set(userRows.map((u) => u.nrOrdem).filter((n): n is string => typeof n === "string" && n.length > 0))]
	const militaryRows = nrOrdens.length
		? await runQuery("FETCH_FAILED", () =>
				db
					.select({
						nrOrdem: userMilitaryDataInCore.nrOrdem,
						nmGuerra: userMilitaryDataInCore.nmGuerra,
						nmPessoa: userMilitaryDataInCore.nmPessoa,
						sgPosto: userMilitaryDataInCore.sgPosto,
						sgOrg: userMilitaryDataInCore.sgOrg,
						dataAtualizacao: userMilitaryDataInCore.dataAtualizacao,
					})
					.from(userMilitaryDataInCore)
					.where(inArray(userMilitaryDataInCore.nrOrdem, nrOrdens))
			)
		: []

	return {
		messHalls,
		forecasts,
		presences,
		users: userRows,
		militaries: militaryRows
			.filter((m): m is typeof m & { nrOrdem: string } => typeof m.nrOrdem === "string")
			.map((m) => ({
				nrOrdem: m.nrOrdem,
				nmGuerra: m.nmGuerra,
				nmPessoa: m.nmPessoa,
				sgPosto: m.sgPosto,
				sgOrg: m.sgOrg,
				dataAtualizacao: m.dataAtualizacao ?? "",
			})),
	}
}
