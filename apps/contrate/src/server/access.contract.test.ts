/**
 * Contrato da auditoria das server functions de acesso: o ATOR de toda concessão e revogação
 * é a sessão.
 *
 * A função SQL (`access_control.change_module_permission`) é SECURITY INVOKER da service role
 * e grava o `p_actor` que receber — ela não tem como saber quem é a pessoa. A garantia é
 * daqui: as entradas não têm campo de ator, e o `actorId` que chega ao helper é o `userId`
 * do guard. Lê o fonte, sem importar a server function (que puxa o env do servidor).
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GrantAlphaRoleSchema, RevokeAlphaRoleSchema } from "@/lib/alpha/admin-access"

const SOURCE = readFileSync(join(import.meta.dir, "access.fn.ts"), "utf8")
const ACTOR_KEY = /actor|p_actor|grantedBy|granted_by|createdBy|performedBy/i

/** Os handlers de mutação: do `createServerFn({ method: "POST" })` até o próximo `export`. */
function postHandlers(): string[] {
	return SOURCE.split(/\nexport /).filter((chunk) => chunk.includes('createServerFn({ method: "POST" })'))
}

describe("entradas de grant/revoke sem ator", () => {
	test.each([
		["GrantAlphaRoleSchema", GrantAlphaRoleSchema],
		["RevokeAlphaRoleSchema", RevokeAlphaRoleSchema],
	])("%s não tem campo de ator", (_name, schema) => {
		for (const key of Object.keys(schema.shape)) expect(key).not.toMatch(ACTOR_KEY)
	})

	test("um actorId mandado pelo cliente é descartado pelo validator", () => {
		const parsed = GrantAlphaRoleSchema.parse({ userId: "00000000-0000-4000-8000-00000000000b", role: "aci", unitId: 26, actorId: "forjado" })
		expect(parsed).not.toHaveProperty("actorId")
	})
})

describe("handlers de mutação", () => {
	const handlers = postHandlers()

	test("são exatamente os dois: conceder e revogar", () => {
		expect(handlers.map((chunk) => chunk.match(/^const (\w+)/)?.[1])).toEqual(["grantAlphaPermissionFn", "revokeAlphaPermissionFn"])
	})

	test.each(handlers.map((chunk) => [chunk.match(/^const (\w+)/)?.[1], chunk]))(
		"%s: guard primeiro, ator do guard, escrita pelo helper auditado",
		(_name, chunk) => {
			const body = chunk as string
			// O contexto vem do guard de administração...
			expect(body).toMatch(/const \{ ctx, coverage \} = await requireAlphaAdmin\(\)/)
			// ...e o ator é o `userId` dele — nunca `data.*`.
			expect(body).toMatch(/buildAlphaPermissionChange\(\{ actorId: ctx\.userId, coverage \}, data\)/)
			expect(body).not.toMatch(/actorId:\s*data\./)
			// A escrita é a do helper atômico (grant + log numa transação), nunca direta.
			expect(body).toMatch(/changeModulePermission\(getAccessControlClient\(\), change\)/)
			expect(body).not.toMatch(/\.from\("user_permissions"\)\s*\.(insert|update|delete|upsert)/)
		}
	)
})

describe("o arquivo não escreve em user_permissions por fora do helper", () => {
	test("nenhum insert/update/delete/upsert direto", () => {
		expect(SOURCE).not.toMatch(/from\("user_permissions"\)[\s\S]{0,80}\.(insert|update|delete|upsert)\(/)
		expect(SOURCE).not.toMatch(/grantModulePermission|revokeModulePermission|grantUnscopedModulePermission/)
	})
})
