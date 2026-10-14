import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * insertPresenceFn de ponta a ponta, menos o banco: o handler real, com a operation do domínio
 * simulada e o transporte da server fn reproduzido. O TanStack Start serializa erro de server fn
 * pelo ShallowErrorPlugin (`@tanstack/router-core/ssr/serializer`), que só leva a `message`:
 * qualquer `code` que o servidor anexe some no navegador. Por isso a duplicidade tem de voltar
 * como resultado.
 */

const insertPresence = vi.fn()

vi.mock("@tanstack/react-start", () => {
	// createServerFn(...).validator(...).handler(fn) → a própria fn, chamável com { data }.
	const builder = { validator: () => builder, handler: (fn: unknown) => fn }
	return { createServerFn: () => builder }
})
// Schemas não importam aqui: o validator do createServerFn simulado é descartado.
vi.mock("@iefa/sisub-domain", () => ({
	DeletePresenceSchema: {},
	InsertPresenceSchema: {},
	ListArranchamentoMapSchema: {},
	ListPresencesSchema: {},
	deletePresence: vi.fn(),
	listArranchamentoMap: vi.fn(),
	listPresences: vi.fn(),
	insertPresence: (...args: unknown[]) => insertPresence(...args),
}))
vi.mock("@/lib/auth.server", () => ({ requireAuth: async () => ({ userId: "fiscal" }), requireAuthWithPermission: async () => ({}) }))
vi.mock("@/lib/db.server", () => ({ getDb: () => ({}) }))
vi.mock("@/lib/domain-errors", () => ({ handleDomainError: (e: unknown) => Promise.reject(e) }))
vi.mock("@/lib/domain-handler.server", () => ({ requireAuthThenRun: () => async () => undefined }))

const { insertPresenceFn } = await import("./presence.fn")

type Handler = (ctx: { data: unknown }) => Promise<unknown>

/** O que o navegador recebe: o valor de retorno inteiro, ou um Error só com a mensagem. */
async function callThroughTransport(data: unknown): Promise<unknown> {
	try {
		return structuredClone(await (insertPresenceFn as unknown as Handler)({ data }))
	} catch (e) {
		throw new Error((e as Error).message)
	}
}

const DATA = { user_id: "11111111-2222-3333-4444-555555555555", date: "2026-10-14", meal: "almoco", messHallId: 7 }

describe("insertPresenceFn", () => {
	// Bloco, não expressão: função devolvida pelo beforeEach vira teardown (e o mock seria chamado).
	beforeEach(() => {
		insertPresence.mockReset()
	})

	test("presença nova volta como inserted", async () => {
		insertPresence.mockResolvedValue(undefined)
		await expect(callThroughTransport(DATA)).resolves.toEqual({ status: "inserted" })
	})

	test("23505 do banco chega ao navegador como duplicate, não como erro sem código", async () => {
		insertPresence.mockImplementation(async () => {
			throw Object.assign(new Error('duplicate key value violates unique constraint "meal_presences_pkey"'), { code: "23505" })
		})
		await expect(callThroughTransport(DATA)).resolves.toEqual({ status: "duplicate" })
	})

	test("outras falhas continuam como erro (só com a mensagem, como no transporte real)", async () => {
		insertPresence.mockImplementation(async () => {
			throw Object.assign(new Error("permission denied"), { code: "42501" })
		})
		const err = await callThroughTransport(DATA).catch((e: unknown) => e)
		expect(err).toBeInstanceOf(Error)
		expect((err as Error).message).toBe("permission denied")
		expect((err as { code?: unknown }).code).toBeUndefined()
	})
})
