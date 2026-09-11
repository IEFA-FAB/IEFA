/**
 * Contrato do piso de garantia dentro do domínio.
 *
 * Três propriedades, e as três são o motivo de o guard existir:
 *   1. **inércia** — sem exigência informada, a operation se comporta exatamente como antes;
 *   2. **ordem** — permissão primeiro, garantia depois;
 *   3. **antes da escrita** — a negativa acontece sem tocar o banco.
 *
 * A prova de (3) é um `db` que LANÇA em qualquer acesso: se o guard rodasse depois da query,
 * o teste falharia com o erro do stub, e não com o erro de garantia.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { AssuranceRequiredError } from "@iefa/pbac"
import { createUserPermission } from "../operations/permissions.ts"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { NO_ASSURANCE, requireAssurance } from "./require-assurance.ts"

const FRESH = { require: "fresh", reason: "Esta operação altera permissões de acesso." } as const

function ctx(overrides: Partial<UserContext> = {}): UserContext {
	return { userId: "user-1", permissions: [], aal: 1, lastFactorAt: null, origin: "session", ...overrides }
}

const ADMIN = [{ module: "admin", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }] as UserContext["permissions"]

/** Handle Drizzle que acusa qualquer toque no banco. Nenhuma chamada aqui deveria alcançá-lo. */
function forbiddenDb(): SisubDb {
	const explode = () => {
		throw new Error("a operação tocou o banco — o guard deveria ter rejeitado ANTES")
	}
	return { select: explode, insert: explode, update: explode, delete: explode } as unknown as SisubDb
}

/** Handle que registra a escrita, para o caso em que ela DEVE acontecer. */
function recordingDb(written: { count: number }): SisubDb {
	const chain = { values: () => Promise.resolve(undefined) }
	return {
		insert: () => {
			written.count++
			return chain
		},
	} as unknown as SisubDb
}

describe("requireAssurance", () => {
	test("sem exigência é no-op, mesmo no contexto mais fraco possível", () => {
		expect(() => requireAssurance(ctx())).not.toThrow()
		expect(() => requireAssurance(ctx({ origin: "api-key" }), NO_ASSURANCE)).not.toThrow()
	})

	test("aplica a exigência quando ela é informada", () => {
		expect(() => requireAssurance(ctx({ permissions: ADMIN }), FRESH)).toThrow(AssuranceRequiredError)
	})
})

describe("operation classificada", () => {
	test("sem o parâmetro, o comportamento é o de antes desta mudança", async () => {
		// É a inércia do grupo 4 provada no ponto que mais importa: a operação de conceder
		// permissão continua executando para quem tem `admin`, sem segundo fator nenhum.
		const written = { count: 0 }
		await createUserPermission(recordingDb(written), ctx({ permissions: ADMIN }), {
			userId: "user-2",
			module: "diner",
			level: 1,
		} as Parameters<typeof createUserPermission>[2])
		expect(written.count).toBe(1)
	})

	test("com exigência e sessão AAL1, rejeita ANTES de qualquer escrita", async () => {
		const call = createUserPermission(
			forbiddenDb(),
			ctx({ permissions: ADMIN }),
			{ userId: "user-2", module: "diner", level: 1 } as Parameters<typeof createUserPermission>[2],
			FRESH
		)
		const error = await call.then(
			() => null,
			(e) => e
		)
		expect(error).toBeInstanceOf(AssuranceRequiredError)
		expect(error.code).toBe("MFA_REQUIRED")
		expect(error.nextStep).toBe("enroll")
	})

	test("sem permissão a negativa é de PERMISSÃO, não pedido de elevação", async () => {
		// A ordem é o requisito: quem não pode conceder permissão não deve receber um desafio
		// de segundo fator — isso confirmaria a existência da operação a quem não a alcança.
		const call = createUserPermission(
			forbiddenDb(),
			ctx(),
			{ userId: "user-2", module: "diner", level: 1 } as Parameters<typeof createUserPermission>[2],
			FRESH
		)
		await expect(call).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("sessão elevada e fresca executa normalmente", async () => {
		const written = { count: 0 }
		const elevated = ctx({ permissions: ADMIN, aal: 2, lastFactorAt: Math.floor(Date.now() / 1000) - 60 })
		await createUserPermission(
			recordingDb(written),
			elevated,
			{
				userId: "user-2",
				module: "diner",
				level: 1,
			} as Parameters<typeof createUserPermission>[2],
			FRESH
		)
		expect(written.count).toBe(1)
	})
})
