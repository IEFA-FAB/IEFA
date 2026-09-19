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
import { GrantAlphaRoleSchema, RevokeAlphaRoleSchema, SetCopilotBlockSchema } from "@/lib/alpha/admin-access"

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
	const nameOf = (chunk: string) => chunk.match(/^const (\w+)/)?.[1]
	const grantHandlers = handlers.filter((chunk) => nameOf(chunk) !== "setAlphaCopilotBlockFn")

	test("são exatamente os três: conceder, revogar e bloquear no copiloto", () => {
		expect(handlers.map(nameOf)).toEqual(["grantAlphaPermissionFn", "revokeAlphaPermissionFn", "setAlphaCopilotBlockFn"])
	})

	test.each(grantHandlers.map((chunk) => [nameOf(chunk), chunk]))("%s: guard primeiro, ator do guard, escrita pelo helper auditado", (_name, chunk) => {
		const body = chunk as string
		// O contexto vem do guard de administração...
		expect(body).toMatch(/const \{ ctx, coverage \} = await requireAlphaAdmin\(\)/)
		// ...e o ator é o `userId` dele — nunca `data.*`.
		expect(body).toMatch(/buildAlphaPermissionChange\(\{ actorId: ctx\.userId, coverage \}, data\)/)
		expect(body).not.toMatch(/actorId:\s*data\./)
		// A escrita é a do helper atômico (grant + log numa transação), nunca direta.
		expect(body).toMatch(/changeModulePermission\(getAccessControlClient\(\), change\)/)
		expect(body).not.toMatch(/\.from\("user_permissions"\)\s*\.(insert|update|delete|upsert)/)
	})
})

/**
 * "Bloquear no copiloto": deny sem OM nos quatro papéis, numa transação, com log por papel. O
 * ator é a sessão, a escrita é da função SQL, e as regras de quem pode (só o global, nunca
 * sobre si mesmo) passam por `buildAlphaBlockChange` — testado em `admin-access.test.ts`.
 */
describe("bloqueio no copiloto", () => {
	const chunk = postHandlers().find((c) => c.startsWith("const setAlphaCopilotBlockFn")) ?? ""

	test("a entrada não tem campo de ator, e o ator forjado é descartado", () => {
		for (const key of Object.keys(SetCopilotBlockSchema.shape)) expect(key).not.toMatch(ACTOR_KEY)
		const parsed = SetCopilotBlockSchema.parse({ userId: "00000000-0000-4000-8000-00000000000b", blocked: true, actorId: "forjado" })
		expect(parsed).not.toHaveProperty("actorId")
	})

	test("guard primeiro, ator do guard, regra pura, escrita pela função SQL auditada", () => {
		expect(chunk).toMatch(/\.validator\(SetCopilotBlockSchema\)/)
		expect(chunk).toMatch(/const \{ ctx, coverage \} = await requireAlphaAdmin\(\)/)
		expect(chunk).toMatch(/buildAlphaBlockChange\(\{ actorId: ctx\.userId, coverage \}, data\)/)
		expect(chunk).not.toMatch(/actorId:\s*data\./)
		expect(chunk).toMatch(/setModuleBlock\(getAccessControlClient\(\), change\)/)
		// Nada de quatro chamadas avulsas: um bloqueio pela metade é o estado que a função evita.
		expect(chunk).not.toMatch(/changeModulePermission/)
		expect(chunk).not.toMatch(/\.from\("user_permissions"\)/)
	})
})

describe("o arquivo não escreve em user_permissions por fora do helper", () => {
	test("nenhum insert/update/delete/upsert direto", () => {
		expect(SOURCE).not.toMatch(/from\("user_permissions"\)[\s\S]{0,80}\.(insert|update|delete|upsert)\(/)
		expect(SOURCE).not.toMatch(/grantModulePermission|revokeModulePermission|grantUnscopedModulePermission/)
	})
})

/**
 * O aviso de "acesso gravado, mas bloqueado" e o selo "Anulado por bloqueio" saem da MESMA
 * conta da API do α — permissões resolvidas pelo `@iefa/pbac` (inline + política) e cobertura
 * expandida pela hierarquia de apoio. O `deny_present` da função SQL só vê a mesma chave, e
 * foi com ele sozinho que a tela dizia "concedido" para acesso anulado por bloqueio global,
 * de política ou na OM apoiadora.
 */
describe("conferência de bloqueio", () => {
	test("a concessão resolve as permissões da pessoa como o α e confere a cobertura", () => {
		expect(SOURCE).toMatch(/resolveUserPermissions\(data\.userId, getAccessControlClient\(\)\)/)
		expect(SOURCE).toMatch(/denyImpactOnAllow\(allow, permissions, graph\)/)
		expect(SOURCE).not.toMatch(/blockedByDeny/)
	})

	test("a lista traz os bloqueios herdados e marca cada acesso com a conta do α", () => {
		expect(SOURCE).toMatch(/fetchInheritedDenies\(/)
		expect(SOURCE).toMatch(/annotateDenyImpact\(all, graph\)/)
	})
})

/**
 * A tela que chama estas server functions. Lida como fonte pelo mesmo motivo: montar a rota
 * pediria o router e o servidor inteiros.
 */
describe("tela de acessos", () => {
	const PAGE = readFileSync(join(import.meta.dir, "../routes/admin/$unitId/acessos.tsx"), "utf8")

	// Sem a `key`, o formulário guardava a OM anterior ao trocar de OM, e a concessão podia
	// sair para a OM que já não estava na tela.
	test("o formulário de concessão é remontado a cada troca de escopo", () => {
		expect(PAGE).toMatch(/<GrantAccess key=\{scopeContext\.id\}/)
	})

	// Revogar sem o lado apagaria a chave inteira — acesso E bloqueio.
	test("a revogação manda o lado da linha clicada", () => {
		expect(PAGE).toMatch(/revokeAlphaPermissionFn\(\{ data: \{[^}]*effect: grant\.effect/)
	})
})
