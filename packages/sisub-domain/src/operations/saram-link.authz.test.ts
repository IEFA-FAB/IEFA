/**
 * Vínculo de SARAM verificado (20261003100000) — o que é do domínio:
 *
 *   - as operações de administrador exigem `admin:2` ANTES de tocar o banco, e o ator que vai para
 *     a função auditada é `ctx.userId` (com o nome e o grau do registro de garantia);
 *   - as do comensal passam conta, e-mail e e-mail confirmado da SESSÃO, nessa ordem;
 *   - o `jsonb` das funções vira o contrato tipado que a FASE 2 consome, sem SARAM de candidato;
 *   - os tokens estáveis viram mensagem legível, e o SQL cru não chega à tela.
 *
 * A regra em si (chave, homônimos, tentativas, disputa, institucional) é provada no Postgres
 * descartável (`packages/database/scripts/access-audit/saram-link.test.sql`) e no banco real
 * (`apps/sisub/src/test/operations/saram-link.operations.test.ts`, depois do apply).
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError, PermissionDeniedError, QueryFailedError } from "../types/errors.ts"
import { upsertArranchamento } from "./arranchamento.ts"
import {
	assertAccountCanEat,
	confirmSaramCandidate,
	decideSaramRequest,
	fetchMySaramStatus,
	fetchVisibleSaram,
	linkUserSaram,
	listSaramReviewQueue,
	parseSaramReviewQueue,
	parseSaramStatus,
	setUserAccountKind,
	toSaramDomainError,
	unlinkUserSaram,
	verifySaramByCpf,
	withdrawSaramRequest,
} from "./saram-link.ts"

const ADMIN = "11111111-1111-1111-1111-111111111111"
const TARGET = "22222222-2222-2222-2222-222222222222"
const REQUEST = "33333333-3333-3333-3333-333333333333"
const dialect = new PgDialect()

const adminCtx: UserContext = {
	userId: ADMIN,
	permissions: [{ module: "admin", level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null }],
	aal: 1,
	lastFactorAt: null,
	origin: "session",
} as unknown as UserContext
const plainCtx: UserContext = { userId: ADMIN, permissions: [], aal: 1, lastFactorAt: null, origin: "session" }
const kitchenAdminCtx: UserContext = {
	...plainCtx,
	permissions: [{ module: "kitchen", level: 3, mess_hall_id: null, kitchen_id: 1, unit_id: null }],
} as unknown as UserContext

function fakeDb(rows: unknown[] = [{ result: { outcome: "ok", log_id: "log-1" } }], error?: unknown) {
	const executed: Array<{ sql: string; params: unknown[] }> = []
	const db = {
		execute: (query: SQL) => {
			executed.push(dialect.sqlToQuery(query))
			if (error) return Promise.reject(error)
			return Promise.resolve(rows)
		},
	}
	return { db: db as unknown as SisubDb, executed }
}

const pgError = (message: string, code = "P0001") =>
	Object.assign(new Error(`Failed query: select core.x(...)\nparams: ${ADMIN}`), { cause: { code, message } })
const audit = (operation: string) => ({ operation, grade: "fresh" as const })

describe("operações de administrador: admin:2 antes do banco, ator da sessão", () => {
	const cases: Array<[string, (db: SisubDb, ctx: UserContext) => Promise<unknown>, string]> = [
		["listSaramReviewQueue", (db, ctx) => listSaramReviewQueue(db, ctx), "core.saram_review_queue()"],
		[
			"decideSaramRequest",
			(db, ctx) => decideSaramRequest(db, ctx, { requestId: REQUEST, decision: "approve" }, undefined, audit("decideSaramRequestFn")),
			"core.decide_saram_request(",
		],
		[
			"linkUserSaram",
			(db, ctx) =>
				linkUserSaram(db, ctx, { userId: TARGET, saram: "1234567", expectedSaram: null, reason: "Conferido na seção." }, undefined, audit("linkUserSaramFn")),
			"core.admin_link_saram(",
		],
		[
			"unlinkUserSaram",
			(db, ctx) =>
				unlinkUserSaram(db, ctx, { userId: TARGET, expectedSaram: "1234567", reason: "SARAM de outra pessoa." }, undefined, audit("unlinkUserSaramFn")),
			"core.admin_unlink_saram(",
		],
		[
			"setUserAccountKind",
			(db, ctx) =>
				setUserAccountKind(
					db,
					ctx,
					{ userId: TARGET, kind: "institucional", expectedKind: "pessoal", reason: "Conta da seção de subsistência." },
					undefined,
					audit("setUserAccountKindFn")
				),
			"core.admin_set_account_kind(",
		],
	]

	for (const [name, run, fn] of cases) {
		test(`${name}: sem admin:2 recusa sem tocar o banco`, async () => {
			for (const ctx of [plainCtx, kitchenAdminCtx]) {
				const { db, executed } = fakeDb()
				await expect(run(db, ctx)).rejects.toBeInstanceOf(PermissionDeniedError)
				expect(executed).toHaveLength(0)
			}
		})

		test(`${name}: com admin:2 chama ${fn}`, async () => {
			const { db, executed } = fakeDb([{ result: {} }])
			await run(db, adminCtx)
			expect(executed[0]?.sql).toContain(fn)
			if (name !== "listSaramReviewQueue") {
				// Ator = sessão, primeiro argumento; nome da operação e grau do registro.
				expect(executed[0]?.params[0]).toBe(ADMIN)
				expect(executed[0]?.params[1]).toBe(`${name}Fn`)
				expect(executed[0]?.params.at(-1)).toBe("fresh")
			}
		})
	}

	test("o alvo do vínculo manual e a versão vista vão para a função", async () => {
		const { db, executed } = fakeDb([{ result: { outcome: "linked", log_id: "log-9" } }])
		const result = await linkUserSaram(
			db,
			adminCtx,
			{ userId: TARGET, saram: "1234567", expectedSaram: "7654321", reason: "Legacy revisado." },
			undefined,
			audit("linkUserSaramFn")
		)
		expect(executed[0]?.params).toEqual([ADMIN, "linkUserSaramFn", TARGET, "1234567", "7654321", "Legacy revisado.", "fresh"])
		expect(result).toEqual({ outcome: "linked", logId: "log-9" })
	})

	test("conflito de versão vira CONFLICT com mensagem para atualizar", async () => {
		const { db } = fakeDb([], pgError("SARAM_LINK_CHANGED"))
		const error = await unlinkUserSaram(db, adminCtx, { userId: TARGET, expectedSaram: "1", reason: "Motivo qualquer." }).catch((e) => e)
		expect(error).toBeInstanceOf(DomainError)
		expect((error as DomainError).code).toBe("CONFLICT")
		expect((error as DomainError).message).toMatch(/Atualize/)
	})

	test("pedido já decidido: CONFLICT; ator inexistente: o token do envelope de auditoria", async () => {
		const decided = await decideSaramRequest(fakeDb([], pgError("REQUEST_NOT_PENDING")).db, adminCtx, { requestId: REQUEST, decision: "approve" }).catch(
			(e) => e
		)
		expect((decided as DomainError).code).toBe("CONFLICT")
		const actor = await decideSaramRequest(fakeDb([], pgError("ACCESS_ACTOR_NOT_FOUND", "23503")).db, adminCtx, {
			requestId: REQUEST,
			decision: "approve",
		}).catch((e) => e)
		expect((actor as DomainError).code).toBe("ACTOR_NOT_FOUND")
	})
})

describe("operações do comensal: a sessão, nunca o payload", () => {
	const session = { userId: TARGET, email: "andrealc@fab.mil.br", emailConfirmed: true }

	test("estado: conta, e-mail e e-mail confirmado, nessa ordem", async () => {
		const { db, executed } = fakeDb([{ result: { status: "suggestion", candidates: [{ ref: 7, posto: "3S", nome_guerra: "ANDRÉ", sg_org: "IEFA" }] } }])
		const status = await fetchMySaramStatus(db, session)
		expect(executed[0]?.sql).toContain("core.saram_link_status(")
		expect(executed[0]?.params).toEqual([TARGET, "andrealc@fab.mil.br", true])
		expect(status.status).toBe("suggestion")
		expect(status.candidates[0]).toEqual({ ref: 7, posto: "3S", nomeGuerra: "ANDRÉ", sgOrg: "IEFA", heldByOther: false, holderVerified: false })
	})

	test("confirmação, CPF e desistência levam a sessão e só o input legítimo", async () => {
		const { db, executed } = fakeDb([{ result: { outcome: "mismatch", attempts_left: 3, locked_until: null, status: { status: "homonyms" } } }])
		const confirmed = await confirmSaramCandidate(db, session, { candidateRef: 7, cpfSuffix: "4455" })
		expect(executed[0]?.params).toEqual([TARGET, "andrealc@fab.mil.br", true, 7, "4455"])
		expect(confirmed).toMatchObject({ outcome: "mismatch", attemptsLeft: 3, status: { status: "homonyms" } })

		await verifySaramByCpf(db, session, { saram: "1000001", cpf: "111.222.333-44" })
		expect(executed[1]?.sql).toContain("core.verify_saram_by_cpf(")
		expect(executed[1]?.params).toEqual([TARGET, "andrealc@fab.mil.br", true, "1000001", "111.222.333-44"])

		await withdrawSaramRequest(db, session, { requestId: REQUEST })
		expect(executed[2]?.params).toEqual([TARGET, "andrealc@fab.mil.br", true, REQUEST])
	})

	test("visibilidade lê core.visible_saram, nunca a coluna crua", async () => {
		const { db, executed } = fakeDb([{ saram: "1000001" }])
		expect(await fetchVisibleSaram(db, { userId: TARGET })).toBe("1000001")
		expect(executed[0]?.sql).toContain("core.visible_saram(")
		expect(await fetchVisibleSaram(fakeDb([{ saram: null }]).db, { userId: TARGET })).toBeNull()
	})

	test("pedido inexistente vira NotFound; bloqueio de tentativas não é exceção", async () => {
		const missing = await withdrawSaramRequest(fakeDb([], pgError("REQUEST_NOT_FOUND", "P0002")).db, session, { requestId: REQUEST }).catch((e) => e)
		expect(missing).toBeInstanceOf(NotFoundError)
		const locked = await verifySaramByCpf(
			fakeDb([{ result: { outcome: "locked", locked_until: "2026-10-03T15:00:00Z", status: { status: "locked_out" } } }]).db,
			session,
			{
				saram: "1000001",
				cpf: "11122233344",
			}
		)
		expect(locked).toMatchObject({ outcome: "locked", lockedUntil: "2026-10-03T15:00:00Z", status: { status: "locked_out" } })
	})
})

describe("conta institucional não come", () => {
	test("assertAccountCanEat recusa institucional e deixa pessoal passar", async () => {
		await expect(assertAccountCanEat(fakeDb([{ account_kind: "pessoal" }]).db, TARGET)).resolves.toBeUndefined()
		await expect(assertAccountCanEat(fakeDb([]).db, TARGET)).resolves.toBeUndefined()
		const refused = await assertAccountCanEat(fakeDb([{ account_kind: "institucional" }]).db, TARGET).catch((e) => e)
		expect((refused as DomainError).code).toBe("ACCOUNT_INSTITUTIONAL")
	})

	test("upsertArranchamento: arranchar recusa antes de gravar; desmarcar não consulta", async () => {
		const inserts: unknown[] = []
		const db = {
			execute: () => Promise.resolve([{ account_kind: "institucional" }]),
			insert: () => {
				inserts.push(1)
				return { values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }
			},
		} as unknown as SisubDb
		const ctx: UserContext = { ...plainCtx, userId: TARGET }
		const input = { date: "2099-01-01", meal: "almoco", willEat: true, messHallId: 1 } as Parameters<typeof upsertArranchamento>[2]
		const refused = await upsertArranchamento(db, ctx, input).catch((e) => e)
		expect((refused as DomainError).code).toBe("ACCOUNT_INSTITUTIONAL")
		expect(inserts).toHaveLength(0)

		await upsertArranchamento(db, ctx, { ...input, willEat: false })
		expect(inserts).toHaveLength(1)
	})
})

describe("contrato do jsonb", () => {
	test("estado: snake_case vira camelCase; ausentes viram defaults seguros", () => {
		const status = parseSaramStatus({
			status: "pending_request",
			account_kind: "pessoal",
			saram: null,
			verified_by: null,
			visible: false,
			has_unverified_saram: true,
			request: { id: REQUEST, kind: "link", saram: "1234567", justification: "Cheguei depois da carga.", created_at: "2026-10-03", claim_verified_by: null },
			candidates: [],
			requires_cpf_suffix: false,
			email_eligibility: "eligible",
			locked_until: null,
			attempts_left: 5,
			actions: ["withdraw_request"],
		})
		expect(status).toMatchObject({
			status: "pending_request",
			hasUnverifiedSaram: true,
			request: { id: REQUEST, kind: "link", saram: "1234567", claimVerifiedBy: null },
			attemptsLeft: 5,
			actions: ["withdraw_request"],
		})
		expect(parseSaramStatus(null)).toMatchObject({ status: "no_match", accountKind: "pessoal", visible: false, candidates: [], actions: [] })
	})

	test("fila do administrador", () => {
		const queue = parseSaramReviewQueue({
			requests: [
				{
					id: REQUEST,
					kind: "dispute",
					saram: "1234567",
					justification: "Este SARAM é meu.",
					claim_verified_by: "cpf",
					requester: { user_id: TARGET, email: "x@fab.mil.br", account_kind: "pessoal", saram: null, verified_by: null },
					holders: [{ user_id: ADMIN, email: "y@fab.mil.br", verified_by: "legacy" }],
					identity: { posto: "3S", nome_guerra: "SILVA", sg_org: "IEFA" },
				},
			],
			legacy: [{ user_id: ADMIN, email: "y@fab.mil.br", saram: "1234567", verified_elsewhere: true, shared_with: 1 }],
			institutional_candidates: [{ user_id: TARGET, email: "secao@fab.mil.br" }],
		})
		expect(queue.requests[0]).toMatchObject({ kind: "dispute", claimVerifiedBy: "cpf", holders: [{ verifiedBy: "legacy" }], identity: { nomeGuerra: "SILVA" } })
		expect(queue.legacy[0]).toMatchObject({ verifiedElsewhere: true, sharedWith: 1 })
		expect(queue.institutionalCandidates).toHaveLength(1)
		expect(queue.unverified).toEqual([])
		expect(queue.institutional).toEqual([])
	})

	test("token desconhecido não vaza SQL", () => {
		const error = toSaramDomainError(pgError("algo inesperado", "XX000"), "SARAM_LINK_FAILED")
		expect(error).toBeInstanceOf(QueryFailedError)
		expect(error.code).toBe("SARAM_LINK_FAILED")
		expect((error as QueryFailedError).publicMessage).not.toContain("select core")
	})
})
