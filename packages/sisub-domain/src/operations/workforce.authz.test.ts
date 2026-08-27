/**
 * Contrato de autorização da matriz de efetivo.
 *
 * O erro fácil aqui é o mesmo que deixou `kitchen:2` mutar ativo global: autorizar pelo
 * escopo que veio no INPUT em vez do escopo da LINHA. Como `saveWorkforceSubmission` recebe
 * um `ranchoId` e nenhum `unitId`, a tentação é confiar no que o cliente mandar; este teste
 * prova que a unidade dona sai do banco e que a recusa acontece ANTES de qualquer escrita.
 *
 * Também trava a separação de papéis: o gestor do ELO preenche (nível 2 na própria unidade),
 * mas abrir competência e mexer no roster é `admin:2` — governança de plataforma.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import {
	addWorkforceNote,
	closeWorkforceSurvey,
	createRancho,
	createWorkforceSurvey,
	deleteWorkforceNote,
	fetchWorkforceMatrix,
	fetchWorkforceNetwork,
	saveWorkforceSubmission,
	updateRancho,
} from "./workforce.ts"

const OWNER_UNIT = 8
const OTHER_UNIT = 13
const RANCHO_ID = 42
const SURVEY_ID = "11111111-1111-4111-8111-111111111111"
const NOTE_ID = "22222222-2222-4222-8222-222222222222"

const ctx = (permissions: UserContext["permissions"]): UserContext => ({ userId: "user-1", permissions })
const perm = (module: UserContext["permissions"][number]["module"], level: number, unitId: number | null = null) =>
	ctx([{ module, level, kitchen_id: null, mess_hall_id: null, unit_id: unitId }])

const localCtx = (unitId: number, level = 2) => perm("local-analytics", level, unitId)
const unitCtx = (unitId: number, level = 2) => perm("unit", level, unitId)
const analyticsCtx = (level = 2) => perm("analytics", level)
const adminCtx = (level = 2) => perm("admin", level)

/**
 * Stub do handle Drizzle. `rows` alimenta qualquer `select(...)`; `writes` registra as
 * escritas, para provar que a recusa vem antes delas.
 */
function fakeDb(rows: unknown[] = []) {
	const writes: string[] = []
	const chain: Record<string, unknown> = {}
	const settle = () => Object.assign(Promise.resolve(rows), chain)
	chain.from = () => chain
	chain.innerJoin = () => chain
	chain.where = () => settle()
	chain.groupBy = () => settle()
	chain.orderBy = () => settle()
	chain.limit = () => settle()

	const written = (kind: string) => {
		writes.push(kind)
		const w: Record<string, unknown> = {}
		w.values = () => w
		w.set = () => w
		w.where = () => w
		w.onConflictDoUpdate = () => w
		w.onConflictDoNothing = () => w
		w.returning = () => Promise.resolve(rows)
		return w
	}

	const db = {
		select: () => chain,
		insert: () => written("insert"),
		update: () => written("update"),
		delete: () => written("delete"),
	}
	return { db: db as unknown as SisubDb, writes }
}

/** Linha do rancho como o guard a lê: dona é OWNER_UNIT, ativa. */
const ownedRancho = [{ unitId: OWNER_UNIT, active: true }]

describe("leitura da matriz de uma unidade", () => {
	test("sem permissão na unidade é recusado", async () => {
		const { db } = fakeDb()
		await expect(fetchWorkforceMatrix(db, localCtx(OTHER_UNIT, 1), { unitId: OWNER_UNIT })).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("analytics global NÃO substitui a permissão da unidade", async () => {
		const { db } = fakeDb()
		await expect(fetchWorkforceMatrix(db, analyticsCtx(2), { unitId: OWNER_UNIT })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})

describe("visão de rede", () => {
	test("exige analytics:2 — nível 1 não basta", async () => {
		const { db } = fakeDb()
		await expect(fetchWorkforceNetwork(db, analyticsCtx(1), {})).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("permissão de uma única unidade não abre a rede", async () => {
		const { db } = fakeDb()
		await expect(fetchWorkforceNetwork(db, localCtx(OWNER_UNIT, 2), {})).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})

describe("preenchimento do efetivo", () => {
	const input = { surveyId: SURVEY_ID, ranchoId: RANCHO_ID, entries: [{ categoryCode: "qta", headcount: 10 }], declaredTotal: 10 }

	test("gestor de OUTRO ELO é recusado — a unidade dona vem da linha, não do input", async () => {
		const { db, writes } = fakeDb(ownedRancho)
		await expect(saveWorkforceSubmission(db, localCtx(OTHER_UNIT, 2), input)).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("nível 1 na própria unidade lê, mas não escreve", async () => {
		const { db, writes } = fakeDb(ownedRancho)
		await expect(saveWorkforceSubmission(db, localCtx(OWNER_UNIT, 1), input)).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("módulo unit nível 2 na própria unidade também autoriza", async () => {
		const { db } = fakeDb(ownedRancho)
		// Passa do guard de permissão; falha adiante por falta de fixture — o que importa
		// aqui é que o erro NÃO é de permissão.
		await expect(saveWorkforceSubmission(db, unitCtx(OWNER_UNIT, 2), input)).rejects.not.toBeInstanceOf(PermissionDeniedError)
	})

	test("observação segue a mesma dona do rancho", async () => {
		const { db, writes } = fakeDb(ownedRancho)
		await expect(
			addWorkforceNote(db, localCtx(OTHER_UNIT, 2), { surveyId: SURVEY_ID, ranchoId: RANCHO_ID, kind: "leave", quantity: 1, detail: "x" })
		).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("apagar observação resolve a dona pelo JOIN até o rancho", async () => {
		// O select devolve tanto a linha do JOIN (ranchoId) quanto a do rancho (unitId):
		// o stub serve as duas consultas, e o guard tem de recusar na segunda.
		const { db, writes } = fakeDb([{ ranchoId: RANCHO_ID, unitId: OWNER_UNIT, active: true }])
		await expect(deleteWorkforceNote(db, localCtx(OTHER_UNIT, 2), { noteId: NOTE_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("apagar observação de competência ENCERRADA é recusado", async () => {
		// Sem este guard, mexer numa coleta antiga mudaria para sempre o efetivo disponível
		// daquele mês — e `addWorkforceNote` recusaria recriar a observação apagada.
		const { db, writes } = fakeDb([{ ranchoId: RANCHO_ID, surveyId: SURVEY_ID, unitId: OWNER_UNIT, active: true, status: "closed" }])
		await expect(deleteWorkforceNote(db, localCtx(OWNER_UNIT, 2), { noteId: NOTE_ID })).rejects.toThrow(/encerrada/i)
		expect(writes).toEqual([])
	})

	test("preencher em competência ENCERRADA é recusado", async () => {
		const { db, writes } = fakeDb([{ unitId: OWNER_UNIT, active: true, status: "closed" }])
		await expect(saveWorkforceSubmission(db, localCtx(OWNER_UNIT, 2), input)).rejects.toThrow(/encerrada/i)
		expect(writes).toEqual([])
	})

	test("rancho INATIVO não aceita preenchimento, mesmo com permissão", async () => {
		const { db, writes } = fakeDb([{ unitId: OWNER_UNIT, active: false }])
		await expect(saveWorkforceSubmission(db, localCtx(OWNER_UNIT, 2), input)).rejects.toThrow(/inativo/i)
		expect(writes).toEqual([])
	})

	test("salvar TUDO em branco apaga a resposta em vez de criar uma resposta zerada", async () => {
		// Se a submission fosse criada assim, o rancho contaria como respondido com total 0:
		// entraria na taxa de resposta, puxaria o total da rede para baixo e apareceria na
		// fila de lacunas de cobertura — sem nenhum caminho de volta.
		const { db, writes } = fakeDb([{ unitId: OWNER_UNIT, active: true, status: "open" }])
		await saveWorkforceSubmission(db, localCtx(OWNER_UNIT, 2), {
			surveyId: SURVEY_ID,
			ranchoId: RANCHO_ID,
			entries: [{ categoryCode: "qta", headcount: null }],
			declaredTotal: null,
		}).catch(() => undefined)
		expect(writes).toEqual(["delete"])
		expect(writes).not.toContain("insert")
	})
})

describe("governança da competência e do roster", () => {
	const survey = { referenceDate: "2026-09-01", title: "setembro/2026" }

	test("abrir competência exige admin:2 — gestor de unidade não pode", async () => {
		const { db, writes } = fakeDb()
		await expect(createWorkforceSurvey(db, localCtx(OWNER_UNIT, 2), survey)).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("analytics:2 lê a rede mas não abre competência", async () => {
		const { db, writes } = fakeDb()
		await expect(createWorkforceSurvey(db, analyticsCtx(2), survey)).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("encerrar competência exige admin:2", async () => {
		const { db, writes } = fakeDb()
		await expect(closeWorkforceSurvey(db, localCtx(OWNER_UNIT, 2), { surveyId: SURVEY_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("criar rancho no próprio ELO ainda exige admin:2 — roster é cadastro, não preenchimento", async () => {
		const { db, writes } = fakeDb()
		await expect(
			createRancho(db, localCtx(OWNER_UNIT, 2), {
				unitId: OWNER_UNIT,
				eloCode: "BASC",
				code: "novo-rancho",
				displayName: "Novo",
				producesOwnMeals: true,
			})
		).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("editar rancho exige admin:2", async () => {
		const { db, writes } = fakeDb()
		await expect(updateRancho(db, unitCtx(OWNER_UNIT, 2), { ranchoId: RANCHO_ID, displayName: "x" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("admin:1 não basta para abrir competência", async () => {
		const { db, writes } = fakeDb()
		await expect(createWorkforceSurvey(db, adminCtx(1), survey)).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})
})
