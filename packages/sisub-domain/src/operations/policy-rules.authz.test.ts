/**
 * Contrato de autorização das regras de política de revisão (`procurement.policy_rule`).
 *
 * O gate vivia SÓ no server fn (`requireAuthWithPermission("global", 2)`). Com a migração para
 * Drizzle a conexão usa o role do projeto e RLS não se aplica — se a operation não checasse
 * nada, qualquer chamador do domínio (chat, MCP, script) reescreveria o critério de revisão do
 * catálogo da FAB inteira. O teste fixa a barreira nos dois níveis: `global:1` lê, `global:2`
 * escreve.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { createPolicyRule, deletePolicyRule, listPolicyRules, updatePolicyRule } from "./policy-rules.ts"

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions }
}

function global(level: number): UserContext {
	return ctx([{ module: "global", level, kitchen_id: null, mess_hall_id: null, unit_id: null }])
}

const NO_PERMISSION = ctx([])
const KITCHEN_MANAGER = ctx([{ module: "kitchen", level: 2, kitchen_id: 2, mess_hall_id: null, unit_id: null }])

/**
 * Stub do handle Drizzle: o guard roda ANTES de qualquer query, então basta que a cadeia
 * exista para separar "negado" de "seguiu adiante". Nada aqui resolve, de propósito — o
 * que está sob teste é a decisão de autorização, não a montagem da query.
 */
function fakeDb(): SisubDb {
	const chain: Record<string, unknown> = {}
	for (const method of ["from", "where", "orderBy", "set", "values", "returning"]) {
		chain[method] = () => chain
	}
	return { select: () => chain, insert: () => chain, update: () => chain, delete: () => chain } as unknown as SisubDb
}

const WRITES: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["createPolicyRule", (db, c) => createPolicyRule(db, c, { target: "product", title: "abc", description: "0123456789" })],
	["updatePolicyRule", (db, c) => updatePolicyRule(db, c, { id: "rule-1", title: "abc" })],
	["deletePolicyRule", (db, c) => deletePolicyRule(db, c, { id: "rule-1" })],
]

const READS: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
	["listPolicyRules", (db, c) => listPolicyRules(db, c, { target: "product" })],
	["listPolicyRules (activeOnly)", (db, c) => listPolicyRules(db, c, { target: "recipe", activeOnly: true })],
]

/** O guard passou quando a falha resultante NÃO é de permissão (o stub não resolve a query). */
async function rejectedByPermission(run: () => Promise<unknown>): Promise<boolean> {
	const error = await run().then(
		() => null,
		(e: unknown) => e
	)
	return error instanceof PermissionDeniedError
}

describe("autorização das regras de política de revisão", () => {
	test.each(WRITES)("%s nega sessão autenticada sem permissão", async (_name, run) => {
		expect(await rejectedByPermission(() => run(fakeDb(), NO_PERMISSION))).toBe(true)
	})

	test.each(WRITES)("%s nega quem só lê o catálogo global", async (_name, run) => {
		expect(await rejectedByPermission(() => run(fakeDb(), global(1)))).toBe(true)
	})

	// A regra é da SDAB e não tem coluna de dono: kitchen:2 não compra escrita aqui.
	test.each(WRITES)("%s nega gestor de cozinha", async (_name, run) => {
		expect(await rejectedByPermission(() => run(fakeDb(), KITCHEN_MANAGER))).toBe(true)
	})

	test.each(WRITES)("%s deixa passar global:2", async (_name, run) => {
		expect(await rejectedByPermission(() => run(fakeDb(), global(2)))).toBe(false)
	})

	test.each(READS)("%s nega sessão autenticada sem permissão", async (_name, run) => {
		expect(await rejectedByPermission(() => run(fakeDb(), NO_PERMISSION))).toBe(true)
	})

	test.each(READS)("%s deixa passar global:1", async (_name, run) => {
		expect(await rejectedByPermission(() => run(fakeDb(), global(1)))).toBe(false)
	})
})
