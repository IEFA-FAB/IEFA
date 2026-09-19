import { describe, expect, test } from "bun:test"
import {
	changeModulePermission,
	PermissionChangeError,
	partitionOfLevel,
	setModuleBlock,
	toModuleBlockArgs,
	toPermissionChangeArgs,
	toPermissionChangeError,
	touchesDenyPartition,
} from "./permission-change.ts"

const ACTOR = "00000000-0000-0000-0000-00000000000a"
const TARGET = "00000000-0000-0000-0000-00000000000b"

describe("toPermissionChangeArgs", () => {
	test("grant escopado: todos os argumentos nomeados, escopos ausentes viram null e assurance padrão é session", () => {
		expect(
			toPermissionChangeArgs({ actorId: ACTOR, app: "contrate", action: "grant", targetUserId: TARGET, module: "alpha-aci", level: 1, unitId: 7 })
		).toEqual({
			p_actor: ACTOR,
			p_app: "contrate",
			p_action: "grant",
			p_user: TARGET,
			p_module: "alpha-aci",
			p_level: 1,
			p_unit_id: 7,
			p_kitchen_id: null,
			p_mess_hall_id: null,
			p_expires_at: null,
			p_assurance: "session",
		})
	})

	// No grant a partição sai do nível; omitir o argumento mantém a concessão compatível com a
	// assinatura anterior à 20260919010255.
	test("grant não envia p_partition, mesmo se o chamador a passar", () => {
		const args = toPermissionChangeArgs({
			actorId: ACTOR,
			app: "contrate",
			action: "grant",
			targetUserId: TARGET,
			module: "alpha-aci",
			level: 1,
			unitId: 7,
			partition: "deny",
		})
		expect(args).not.toHaveProperty("p_partition")
	})

	test("revoke leva a partição pedida; sem ela, all (a chave inteira)", () => {
		const base = { actorId: ACTOR, app: "contrate", action: "revoke", targetUserId: TARGET, module: "alpha-aci", unitId: 7 } as const
		expect(toPermissionChangeArgs({ ...base, partition: "allow" }).p_partition).toBe("allow")
		expect(toPermissionChangeArgs({ ...base, partition: "deny" }).p_partition).toBe("deny")
		expect(toPermissionChangeArgs(base).p_partition).toBe("all")
	})

	test("grant global com prazo e assurance fresh", () => {
		const args = toPermissionChangeArgs({
			actorId: ACTOR,
			app: "sisub",
			action: "grant",
			targetUserId: TARGET,
			module: "global",
			level: 0,
			unitId: null,
			expiresAt: "2026-12-31T00:00:00Z",
			assurance: "fresh",
		})
		expect(args.p_level).toBe(0)
		expect(args.p_unit_id).toBeNull()
		expect(args.p_expires_at).toBe("2026-12-31T00:00:00Z")
		expect(args.p_assurance).toBe("fresh")
	})

	// A função SQL recusa nível/prazo no revoke (a chave inteira sai); o mapeamento nem os envia.
	test("revoke descarta nível e prazo mesmo se o chamador os passar", () => {
		const args = toPermissionChangeArgs({
			actorId: ACTOR,
			app: "contrate",
			action: "revoke",
			targetUserId: TARGET,
			module: "alpha-admin",
			level: 3,
			kitchenId: 4,
			expiresAt: "2026-12-31T00:00:00Z",
		})
		expect(args.p_level).toBeNull()
		expect(args.p_expires_at).toBeNull()
		expect(args.p_kitchen_id).toBe(4)
	})
})

describe("partitionOfLevel", () => {
	test("a fronteira dos índices parciais: > 0 allow, <= 0 deny", () => {
		expect(partitionOfLevel(1)).toBe("allow")
		expect(partitionOfLevel(3)).toBe("allow")
		expect(partitionOfLevel(0)).toBe("deny")
		expect(partitionOfLevel(-1)).toBe("deny")
	})
})

describe("touchesDenyPartition", () => {
	test("grant: só nível <= 0 mexe em deny", () => {
		expect(touchesDenyPartition({ action: "grant", level: 1 })).toBe(false)
		expect(touchesDenyPartition({ action: "grant", level: 0 })).toBe(true)
		expect(touchesDenyPartition({ action: "grant", level: -1 })).toBe(true)
	})

	// `all` (o default) apaga também o deny da chave: é mexer em bloqueio.
	test("revoke: só a partição allow deixa o deny em paz", () => {
		expect(touchesDenyPartition({ action: "revoke", partition: "allow" })).toBe(false)
		expect(touchesDenyPartition({ action: "revoke", partition: "deny" })).toBe(true)
		expect(touchesDenyPartition({ action: "revoke", partition: "all" })).toBe(true)
		expect(touchesDenyPartition({ action: "revoke" })).toBe(true)
	})
})

describe("toPermissionChangeError", () => {
	test.each([
		["PERMISSION_CHANGE_INVALID", "INVALID"],
		["PERMISSION_NOT_FOUND", "NOT_FOUND"],
		["PERMISSION_ACTOR_NOT_FOUND", "ACTOR_NOT_FOUND"],
		["PERMISSION_REFERENCE_NOT_FOUND", "REFERENCE_NOT_FOUND"],
		["PERMISSION_CONFLICT", "CONFLICT"],
		["connection reset", "FAILED"],
	] as const)("%s → %s", (message, code) => {
		const error = toPermissionChangeError({ message })
		expect(error).toBeInstanceOf(PermissionChangeError)
		expect(error.code).toBe(code)
		// O SQL cru não vira a mensagem da tela.
		expect(error.message).not.toContain(message)
	})
})

function rpcStub(result: { data: unknown; error: { message: string; code?: string } | null }, captured: { schema?: string; fn?: string; args?: unknown } = {}) {
	return {
		schema(name: string) {
			captured.schema = name
			return {
				rpc(fn: string, args: unknown) {
					captured.fn = fn
					captured.args = args
					return Promise.resolve(result)
				},
			}
		},
	}
}

describe("changeModulePermission", () => {
	test("chama a RPC do schema access_control e devolve o resultado normalizado", async () => {
		const captured: { schema?: string; fn?: string; args?: unknown } = {}
		const stub = rpcStub(
			{
				data: { log_id: "log-1", action: "grant", partition: "allow", permission_id: "perm-1", previous_level: null, removed: 0, deny_present: true },
				error: null,
			},
			captured
		)

		const result = await changeModulePermission(stub as never, {
			actorId: ACTOR,
			app: "contrate",
			action: "grant",
			targetUserId: TARGET,
			module: "alpha-aci",
			level: 1,
			unitId: 7,
		})

		expect(captured.schema).toBe("access_control")
		expect(captured.fn).toBe("change_module_permission")
		expect((captured.args as Record<string, unknown>).p_actor).toBe(ACTOR)
		expect(result).toEqual({ logId: "log-1", action: "grant", partition: "allow", permissionId: "perm-1", previousLevel: null, removed: 0, denyPresent: true })
	})

	test("revoke por partição: devolve a partição e denyPresent nulo", async () => {
		const captured: { schema?: string; fn?: string; args?: unknown } = {}
		const stub = rpcStub(
			{ data: { log_id: "log-2", action: "revoke", partition: "deny", permission_id: null, previous_level: 0, removed: 1, deny_present: null }, error: null },
			captured
		)
		const result = await changeModulePermission(stub as never, {
			actorId: ACTOR,
			app: "contrate",
			action: "revoke",
			targetUserId: TARGET,
			module: "alpha-aci",
			unitId: 7,
			partition: "deny",
		})
		expect((captured.args as Record<string, unknown>).p_partition).toBe("deny")
		expect(result).toMatchObject({ partition: "deny", removed: 1, previousLevel: 0, denyPresent: null })
	})

	test("erro da RPC vira PermissionChangeError com a causa preservada", async () => {
		const stub = rpcStub({ data: null, error: { message: "PERMISSION_NOT_FOUND", code: "P0002" } })
		const promise = changeModulePermission(stub as never, {
			actorId: ACTOR,
			app: "contrate",
			action: "revoke",
			targetUserId: TARGET,
			module: "alpha-aci",
			unitId: 7,
		})
		await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" })
	})

	// Sem `log_id` não há prova de que o log foi gravado — não se afirma sucesso.
	test("resposta sem log_id é falha, não sucesso", async () => {
		const stub = rpcStub({ data: null, error: null })
		const promise = changeModulePermission(stub as never, {
			actorId: ACTOR,
			app: "contrate",
			action: "grant",
			targetUserId: TARGET,
			module: "alpha-aci",
			level: 1,
		})
		await expect(promise).rejects.toMatchObject({ code: "FAILED" })
	})
})

const ALPHA_ROLES = ["alpha-requester", "alpha-procurement", "alpha-aci", "alpha-admin"] as const

describe("toModuleBlockArgs", () => {
	test("todos os argumentos nomeados; assurance padrão é session; a lista é copiada", () => {
		const modules = [...ALPHA_ROLES]
		const args = toModuleBlockArgs({ actorId: ACTOR, app: "contrate", targetUserId: TARGET, modules, blocked: true })
		expect(args).toEqual({
			p_actor: ACTOR,
			p_app: "contrate",
			p_user: TARGET,
			p_modules: [...ALPHA_ROLES],
			p_blocked: true,
			p_assurance: "session",
		})
		expect(args.p_modules).not.toBe(modules)
	})

	test("desbloqueio com assurance fresh", () => {
		const args = toModuleBlockArgs({ actorId: ACTOR, app: "contrate", targetUserId: TARGET, modules: ["alpha-aci"], blocked: false, assurance: "fresh" })
		expect(args.p_blocked).toBe(false)
		expect(args.p_assurance).toBe("fresh")
	})
})

describe("setModuleBlock", () => {
	const input = { actorId: ACTOR, app: "contrate", targetUserId: TARGET, modules: ALPHA_ROLES, blocked: true } as const

	test("chama a RPC do schema access_control e devolve o resultado normalizado", async () => {
		const captured: { schema?: string; fn?: string; args?: unknown } = {}
		const stub = rpcStub(
			{
				data: { blocked: true, changed: ["alpha-aci", "alpha-admin"], unchanged: ["alpha-procurement", "alpha-requester"], log_ids: ["l1", "l2"] },
				error: null,
			},
			captured
		)
		const result = await setModuleBlock(stub as never, input)
		expect(captured.schema).toBe("access_control")
		expect(captured.fn).toBe("set_module_block")
		expect((captured.args as Record<string, unknown>).p_actor).toBe(ACTOR)
		expect(result).toEqual({ blocked: true, changed: ["alpha-aci", "alpha-admin"], unchanged: ["alpha-procurement", "alpha-requester"], logIds: ["l1", "l2"] })
	})

	// Já no estado pedido: nada gravado, nada registrado — e não é erro.
	test("nada a mudar: changed vazio, sem log", async () => {
		const stub = rpcStub({ data: { blocked: false, changed: [], unchanged: [...ALPHA_ROLES], log_ids: [] }, error: null })
		const result = await setModuleBlock(stub as never, { ...input, blocked: false })
		expect(result).toMatchObject({ blocked: false, changed: [], logIds: [] })
	})

	test("erro da RPC vira PermissionChangeError (o bloqueio de si mesmo é INVALID)", async () => {
		const stub = rpcStub({ data: null, error: { message: "PERMISSION_CHANGE_INVALID", code: "22023" } })
		await expect(setModuleBlock(stub as never, input)).rejects.toMatchObject({ code: "INVALID" })
	})

	test("resposta sem corpo é falha, não sucesso", async () => {
		const stub = rpcStub({ data: null, error: null })
		await expect(setModuleBlock(stub as never, input)).rejects.toMatchObject({ code: "FAILED" })
	})

	// Cada módulo alterado tem de ter o seu registro — sem ele, a auditoria não está provada.
	test("módulo alterado sem log correspondente é falha", async () => {
		const stub = rpcStub({ data: { blocked: true, changed: ["alpha-aci", "alpha-admin"], unchanged: [], log_ids: ["l1"] }, error: null })
		await expect(setModuleBlock(stub as never, input)).rejects.toMatchObject({ code: "FAILED" })
	})
})
