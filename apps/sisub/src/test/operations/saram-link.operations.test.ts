/**
 * Integração — vínculo de SARAM verificado e conta institucional no banco REAL.
 *
 * REQUER 20261003100000 (saram_verified_link) APLICADA no banco compartilhado. Antes disso este
 * arquivo falha — é o teste que o orquestrador roda depois do apply, não um teste para a CI do PR
 * que a declara (o PR registra isso). O Postgres descartável
 * (`packages/database/scripts/access-audit/saram-link.test.sql`) prova a regra num esqueleto; aqui
 * fica o que só o banco real prova: o índice de expressão sobre o espelho de verdade, as
 * operações de domínio que as telas usam, o log de auditoria na mesma transação e os triggers de
 * arranchamento/presença.
 *
 * Tudo dentro de `inRollback`: o espelho (`insertRosterRowInTx`), o log e as tentativas não ficam
 * no banco compartilhado. SARAM de 6 dígitos e nomes de guerra aleatórios: o espelho real só tem
 * SARAM de 7 dígitos, e a chave aleatória não bate com e-mail real.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	confirmSaramCandidate,
	decideSaramRequest,
	fetchMySaramStatus,
	fetchVisibleSaram,
	insertPresence,
	linkUserSaram,
	listSaramReviewQueue,
	requestSaramLink,
	type SaramSession,
	setOwnAccountKind,
	setUserAccountKind,
	unlinkUserSaram,
	upsertArranchamento,
	verifySaramByCpf,
	withdrawSaramRequest,
} from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, insertRosterRowInTx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

class Rollback extends Error {}

async function inRollback(db: SisubDb, fn: (tx: SisubDb) => Promise<void>): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			await fn(tx)
			throw new Rollback()
		})
	} catch (e) {
		if (!(e instanceof Rollback)) throw e
	}
}

const letters = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
const digits = (n: number) => Array.from({ length: n }, () => String(Math.floor(Math.random() * 10))).join("")

/** Militar sintético: SARAM de 6 dígitos, CPF de 11, chave `zq<aleatório>tis` (nome "Teste Integracao Silva"). */
function syntheticMilitary() {
	const guerra = `ZQ${letters(8).toUpperCase()}`
	return { saram: `0${digits(5)}`, cpf: `000${digits(8)}`, nomeGuerra: guerra, nomeCompleto: "Teste Integração da Silva", key: `${guerra.toLowerCase()}tis` }
}

/** Linha de `core.user_data` já vinculada, montada como o banco montaria (contexto de vínculo aberto). */
async function seedLinkInTx(tx: SisubDb, userId: string, email: string, saram: string, verifiedBy: "email" | "legacy") {
	await tx.execute(sql`select set_config('iefa.saram_link', 'test', true)`)
	await tx.execute(sql`
		insert into core.user_data (id, email, saram, saram_verified_by) values (${userId}::uuid, ${email}, ${saram}, ${verifiedBy})
		on conflict (id) do update set saram = excluded.saram, saram_verified_by = excluded.saram_verified_by
	`)
	await tx.execute(sql`select set_config('iefa.saram_link', '', true)`)
}

async function logRow(tx: SisubDb, logId: string) {
	const rows = (await tx.execute(
		sql`select actor_id, operation, assurance, target from access_control.sensitive_operation_log where id = ${logId}::uuid`
	)) as unknown as Array<{ actor_id: string; operation: string; assurance: string; target: Record<string, unknown> }>
	return rows[0] ?? null
}

describeSupabaseIntegration("vínculo de SARAM verificado (banco real)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("user_data")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	})

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	})

	afterAll(async () => {
		await closeDb?.()
	})

	test("sugestão pelo e-mail → confirmar → verificado e visível; o candidato não expõe SARAM nem CPF", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		await inRollback(db, async (tx) => {
			const m = syntheticMilitary()
			await insertRosterRowInTx(tx, m)
			const me: SaramSession = { userId, email: `${m.key}@fab.mil.br`, emailConfirmed: true }

			const status = await fetchMySaramStatus(tx, me)
			expect(status.status).toBe("suggestion")
			expect(status.candidates).toHaveLength(1)
			expect(JSON.stringify(status)).not.toContain(m.saram)
			expect(JSON.stringify(status)).not.toContain(m.cpf)

			const linked = await confirmSaramCandidate(tx, me, { candidateRef: status.candidates[0]?.ref ?? 0 })
			expect(linked.outcome).toBe("linked")
			expect(linked.status).toMatchObject({ status: "verified", verifiedBy: "email", saram: m.saram, visible: true })
			expect(linked.status.identity?.nomeGuerra).toBe(m.nomeGuerra)
			expect(await fetchVisibleSaram(tx, { userId })).toBe(m.saram)

			// e-mail com dígito de homônimo: o mesmo candidato pede o sufixo do CPF
			const other = await fetchMySaramStatus(tx, { userId: crypto.randomUUID(), email: `tp.${m.key}2@fab.mil.br`, emailConfirmed: true })
			expect(other).toMatchObject({ status: "homonyms", requiresCpfSuffix: true })
		})
	})

	test("homônimos desempatam pelos 4 últimos dígitos do CPF; a falha fica registrada", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		await inRollback(db, async (tx) => {
			const a = syntheticMilitary()
			const b = { ...syntheticMilitary(), nomeGuerra: a.nomeGuerra, key: a.key }
			await insertRosterRowInTx(tx, a)
			const bRef = await insertRosterRowInTx(tx, { ...b, sgOrg: "DIRAD" })
			const me: SaramSession = { userId, email: `${a.key}@fab.mil.br`, emailConfirmed: true }

			const status = await fetchMySaramStatus(tx, me)
			expect(status).toMatchObject({ status: "homonyms", requiresCpfSuffix: true })
			expect(status.candidates.map((c) => c.sgOrg).sort()).toEqual(["DIRAD", "IEFA"])

			const wrong = await confirmSaramCandidate(tx, me, { candidateRef: bRef, cpfSuffix: a.cpf.slice(-4) === b.cpf.slice(-4) ? "0000" : a.cpf.slice(-4) })
			expect(wrong).toMatchObject({ outcome: "mismatch", attemptsLeft: 4 })
			const right = await confirmSaramCandidate(tx, me, { candidateRef: bRef, cpfSuffix: b.cpf.slice(-4) })
			expect(right.outcome).toBe("linked")
			expect(right.status.saram).toBe(b.saram)
		})
	})

	test("CPF: erro genérico, bloqueio depois de 5 falhas; titular legacy perde o SARAM com log", async () => {
		if (!reachable || !seeder || !db) return
		const brute = await seeder.seedAuthUser()
		const holder = await seeder.seedAuthUser()
		const claimant = await seeder.seedAuthUser()
		await inRollback(db, async (tx) => {
			const m = syntheticMilitary()
			await insertRosterRowInTx(tx, m)

			const bruteSession: SaramSession = { userId: brute, email: "forca@example.invalid", emailConfirmed: true }
			const ghost = await verifySaramByCpf(tx, bruteSession, { saram: `9${digits(5)}`, cpf: m.cpf })
			expect(ghost.outcome).toBe("mismatch")
			for (let i = 0; i < 4; i++) await verifySaramByCpf(tx, bruteSession, { saram: m.saram, cpf: "00000000000" })
			const locked = await verifySaramByCpf(tx, bruteSession, { saram: m.saram, cpf: m.cpf })
			expect(locked.outcome).toBe("locked")
			expect(locked.lockedUntil).not.toBeNull()

			await seedLinkInTx(tx, holder, `${letters(10)}@example.invalid`, m.saram, "legacy")
			// o bloqueio é também por SARAM: com 5 falhas nele, quem tem o CPF certo espera
			const blocked = await verifySaramByCpf(tx, { userId: claimant, email: "dono@example.invalid", emailConfirmed: true }, { saram: m.saram, cpf: m.cpf })
			expect(blocked.outcome).toBe("locked")
			await tx.execute(sql`delete from core.saram_verification_attempt where saram = ${m.saram}`)

			const linked = await verifySaramByCpf(tx, { userId: claimant, email: "dono@example.invalid", emailConfirmed: true }, { saram: m.saram, cpf: m.cpf })
			expect(linked.outcome).toBe("linked")
			expect(linked.status.verifiedBy).toBe("cpf")
			expect(await fetchVisibleSaram(tx, { userId: holder })).toBeNull()
			const transfer = (await tx.execute(sql`
				select count(*)::int as n from access_control.sensitive_operation_log
				where operation = 'claimSaramFromUnverifiedHolder' and actor_id = ${claimant}::uuid and target -> 'removed_from' -> 0 ->> 'user_id' = ${holder}
			`)) as unknown as Array<{ n: number }>
			expect(transfer[0]?.n).toBe(1)
		})
	})

	test("contestação contra titular verificado → admin aprova, com log; segunda decisão é conflito", async () => {
		if (!reachable || !seeder || !db) return
		const holder = await seeder.seedAuthUser()
		const claimant = await seeder.seedAuthUser()
		const adminId = await seeder.seedAuthUser()
		const admin = fullAccessCtx(adminId)
		await inRollback(db, async (tx) => {
			const m = syntheticMilitary()
			await insertRosterRowInTx(tx, m)
			await seedLinkInTx(tx, holder, `${m.key}@example.invalid`, m.saram, "email")

			const disputed = await verifySaramByCpf(tx, { userId: claimant, email: "c@example.invalid", emailConfirmed: true }, { saram: m.saram, cpf: m.cpf })
			expect(disputed.outcome).toBe("disputed")
			expect(disputed.status.status).toBe("contested")
			expect(await fetchVisibleSaram(tx, { userId: claimant })).toBeNull()

			const queue = await listSaramReviewQueue(tx, admin)
			const request = queue.requests.find((r) => r.requester.userId === claimant)
			expect(request).toMatchObject({ kind: "dispute", claimVerifiedBy: "cpf", holders: [{ userId: holder, verifiedBy: "email" }] })
			expect(JSON.stringify(queue)).not.toContain(m.cpf)

			const audit = { operation: "decideSaramRequestFn", grade: "fresh" as const }
			const approved = await decideSaramRequest(tx, admin, { requestId: request?.id ?? "", decision: "approve" }, undefined, audit)
			expect(approved.outcome).toBe("approved")
			expect(await fetchVisibleSaram(tx, { userId: claimant })).toBe(m.saram)
			expect(await fetchVisibleSaram(tx, { userId: holder })).toBeNull()
			expect(await logRow(tx, approved.logId ?? "")).toMatchObject({ actor_id: adminId, operation: "decideSaramRequestFn", assurance: "fresh" })

			await expect(decideSaramRequest(tx, admin, { requestId: request?.id ?? "", decision: "approve" }, undefined, audit)).rejects.toMatchObject({
				code: "CONFLICT",
			})
		})
	})

	test("pedido e desistência; vínculo manual e desvínculo conferem a versão vista", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const adminId = await seeder.seedAuthUser()
		const admin = fullAccessCtx(adminId)
		await inRollback(db, async (tx) => {
			const me: SaramSession = { userId, email: "novo@example.invalid", emailConfirmed: true }
			const saram = `0${digits(5)}`
			const requested = await requestSaramLink(tx, me, { saram, justification: "Cheguei depois da última carga do cadastro." })
			expect(requested.status.status).toMatch(/^(pending_request|contested)$/)
			await expect(requestSaramLink(tx, me, { saram, justification: "Segundo pedido enquanto o primeiro está pendente." })).rejects.toMatchObject({
				code: "REQUEST_PENDING",
			})
			const withdrawn = await withdrawSaramRequest(tx, me, { requestId: requested.requestId ?? "" })
			expect(withdrawn.outcome).toBe("withdrawn")

			const link = { operation: "linkUserSaramFn", grade: "fresh" as const }
			await expect(linkUserSaram(tx, admin, { userId, saram, expectedSaram: "1234567", reason: "Conferido na seção." }, undefined, link)).rejects.toMatchObject(
				{ code: "CONFLICT" }
			)
			// a linha de core.user_data ainda não existia: nasce do e-mail do Auth
			const linked = await linkUserSaram(tx, admin, { userId, saram, expectedSaram: null, reason: "Conferido na seção." }, undefined, link)
			expect(await logRow(tx, linked.logId ?? "")).toMatchObject({ actor_id: adminId, operation: "linkUserSaramFn" })
			expect((await fetchMySaramStatus(tx, me)).verifiedBy).toBe("admin")

			const unlink = { operation: "unlinkUserSaramFn", grade: "fresh" as const }
			await unlinkUserSaram(tx, admin, { userId, expectedSaram: saram, reason: "Vínculo feito por engano." }, undefined, unlink)
			expect(await fetchVisibleSaram(tx, { userId })).toBeNull()
		})
	})

	test("conta institucional: sem SARAM, sem arranchamento nem presença; pessoa sem verificação segue arranchando", async () => {
		if (!reachable || !seeder || !db) return
		const section = await seeder.seedAuthUser()
		const person = await seeder.seedAuthUser()
		const adminId = await seeder.seedAuthUser()
		const { id: messHallId } = await seeder.seedMessHall()
		await inRollback(db, async (tx) => {
			const sectionSession: SaramSession = { userId: section, email: `secao-${letters(6)}@example.invalid`, emailConfirmed: true }
			await upsertArranchamento(tx, fullAccessCtx(section), { date: "2099-01-02", meal: "almoco", willEat: true, messHallId })

			const declared = await setOwnAccountKind(tx, sectionSession, { kind: "institucional" })
			expect(declared.status.status).toBe("institutional")
			// o arranchamento futuro deixou de contar
			const meal = (await tx.execute(
				sql`select will_eat from kitchen.arranchamento where user_id = ${section}::uuid and date = '2099-01-02'`
			)) as unknown as Array<{ will_eat: boolean }>
			expect(meal[0]?.will_eat).toBe(false)

			await expect(upsertArranchamento(tx, fullAccessCtx(section), { date: "2099-01-03", meal: "almoco", willEat: true, messHallId })).rejects.toMatchObject({
				code: "ACCOUNT_INSTITUTIONAL",
			})
			await expect(insertPresence(tx, fullAccessCtx(adminId), { user_id: section, date: "2099-01-03", meal: "almoco", messHallId })).rejects.toMatchObject({
				code: "ACCOUNT_INSTITUTIONAL",
			})
			// o banco recusa mesmo por fora do domínio
			await expect(
				tx.transaction(async (sp) => {
					await sp.execute(
						sql`insert into kitchen.arranchamento (date, user_id, meal, will_eat, mess_hall_id) values ('2099-01-04', ${section}::uuid, 'janta', true, ${messHallId})`
					)
				})
			).rejects.toThrow()

			// pessoa sem SARAM verificado não é travada
			await upsertArranchamento(tx, fullAccessCtx(person), { date: "2099-01-02", meal: "almoco", willEat: true, messHallId })

			// o administrador desmarca, com log
			const kind = { operation: "setUserAccountKindFn", grade: "fresh" as const }
			const changed = await setUserAccountKind(
				tx,
				fullAccessCtx(adminId),
				{ userId: section, kind: "pessoal", expectedKind: "institucional", reason: "Conta de pessoa, marcada por engano." },
				undefined,
				kind
			)
			expect(await logRow(tx, changed.logId ?? "")).toMatchObject({ actor_id: adminId, operation: "setUserAccountKindFn" })
		})
	})
})
