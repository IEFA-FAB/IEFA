/**
 * Painel de subsistência de uma unidade: arranchamento, presença e o diretório das pessoas que
 * aparecem nelas. Camada Drizzle.
 *
 * ANTES isto era um cliente HTTP contra `api.iefa.com.br`, chamado do NAVEGADOR: as rotas
 * `/api/rancho_previsoes` (hoje `/api/arranchamentos`), `/api/wherewhowhen`, `/api/user-data` e `/api/user-military-data`
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
	arranchamentoInKitchen,
	mealPresencesInKitchen,
	messHallsInKitchen,
	militaryIdentityInCore,
	type SisubDb,
	userDataInCore,
} from "@iefa/database/drizzle/sisub"
import { and, asc, between, eq, inArray, sql } from "drizzle-orm"
import type { UnitDashboard } from "../schemas/dashboard.ts"
import type { ArranchamentoRecord, DashboardPresenceRecord, MessHallAPI, UserDataAPI, UserMilitaryDataAPI } from "../types/dashboard.ts"
import { NotFoundError } from "../types/errors.ts"
import type { MealKey } from "../types/meal.ts"
import { runQuery } from "../utils/index.ts"

export interface UnitDashboardData {
	/** Todos os refeitórios da unidade — a lista alimenta o filtro, então não segue `messHallId`. */
	messHalls: MessHallAPI[]
	arranchamentos: ArranchamentoRecord[]
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

	// O contrato da tela é `number`; o `Number()` fica como cinto — o id já chega number
	// desde que o patcher do pull uniformizou os `bigserial`.
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
	if (scopedIds.length === 0) return { messHalls: [], arranchamentos: [], presences: [], users: [], militaries: [] }

	const [arranchamentoRows, presenceRows] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					user_id: arranchamentoInKitchen.userId,
					date: arranchamentoInKitchen.date,
					meal: arranchamentoInKitchen.meal,
					will_eat: arranchamentoInKitchen.willEat,
					mess_hall_id: arranchamentoInKitchen.messHallId,
					created_at: arranchamentoInKitchen.createdAt,
					updated_at: arranchamentoInKitchen.updatedAt,
				})
				.from(arranchamentoInKitchen)
				.where(and(inArray(arranchamentoInKitchen.messHallId, scopedIds), between(arranchamentoInKitchen.date, input.startDate, input.endDate)))
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

	const arranchamentos: ArranchamentoRecord[] = arranchamentoRows.map((r) => ({
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

	// O diretório é derivado das linhas: só entra quem aparece no arranchamento ou na presença da
	// unidade, no intervalo pedido.
	const userIds = [...new Set([...arranchamentos.map((a) => a.user_id), ...presences.map((p) => p.user_id)])]
	if (userIds.length === 0) return { messHalls, arranchamentos, presences, users: [], militaries: [] }

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
						nrOrdem: militaryIdentityInCore.saram,
						nmGuerra: militaryIdentityInCore.nomeGuerra,
						sgPosto: militaryIdentityInCore.posto,
						sgOrg: militaryIdentityInCore.sgOrg,
						dataAtualizacao: militaryIdentityInCore.dataAtualizacao,
					})
					.from(militaryIdentityInCore)
					.where(inArray(militaryIdentityInCore.saram, nrOrdens))
					// Quem consome procura com `find`: a primeira linha do SARAM vence, a carga mais recente.
					.orderBy(sql`${militaryIdentityInCore.dataAtualizacao} desc nulls last`)
			)
		: []

	return {
		messHalls,
		arranchamentos,
		presences,
		users: userRows,
		militaries: militaryRows
			.filter((m): m is typeof m & { nrOrdem: string } => typeof m.nrOrdem === "string")
			.map((m) => ({
				nrOrdem: m.nrOrdem,
				nmGuerra: m.nmGuerra,
				sgPosto: m.sgPosto,
				sgOrg: m.sgOrg,
				dataAtualizacao: m.dataAtualizacao ?? "",
			})),
	}
}
