/**
 * @module permissions.fn
 * Autogestão de acesso do SISPROV. Cada app do ERP gerencia apenas os grants dos PRÓPRIOS
 * módulos, mesmo compartilhando a tabela `access_control.user_permissions`. Aqui TODAS as
 * operações são restritas aos três do SISPROV (`storage`, `sisprov-planning`, `sisprov-admin`),
 * e o par (módulo, nível) pedido pelo cliente é validado junto pelo
 * `SisprovGrantTargetSchema`: sem isso, um administrador do SISPROV concederia `global` do sisub
 * pela mesma chamada. A lógica compartilhada (filtro por módulo, busca por e-mail, concessão
 * auditada, cobertura por OM) vem de @iefa/pbac.
 *
 * Gate: administração exige `sisprov-admin` nível 3 (`requireSisprovAdmin(3)`). O administrador
 * GLOBAL concede em qualquer OM; o escopado por OM só na cobertura dele (hierarquia de apoio).
 *
 * O `storage` é o estoque de toda classe e é compartilhado com o sisub (design D3): daqui ele é
 * concedido por OM ou global; o grant por cozinha é concedido e revogado no sisub e só se lê aqui.
 *
 * ## Auditoria
 *
 * Conceder e revogar passam por `changeModulePermission`: o grant e a linha de
 * `access_control.sensitive_operation_log` entram numa transação só, com o ator da SESSÃO.
 * Escrita direta em `user_permissions` é recusada pelo banco desde 20260921130100.
 */

import {
	changeModulePermission,
	fetchUnitSupportGraph,
	GrantNotAllowedError,
	PermissionChangeError,
	resolveModulePermissions,
	resolveModuleUnitCoverage,
	searchUsersByEmail,
	type UnitCoverage,
	type UserPermission,
} from "@iefa/pbac"
import { forbidden } from "@iefa/pbac/start"
import { isSisprovModule, SISPROV_ADMIN_MODULE, SISPROV_GRANT_ADMIN_LEVEL, SISPROV_MODULES, SisprovGrantTargetSchema } from "@iefa/sisprov-domain/modules"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSisprovAdmin, requireUserId } from "@/lib/auth.server"
import { buildSisprovGrant, buildSisprovRevoke, GrantManagedElsewhereError, type SisprovPermissionRow } from "@/lib/permission-change"
import { getAccessControlClient, getCoreReadClient } from "@/lib/supabase.server"

/**
 * Permissões efetivas do PRÓPRIO usuário (deny removido, filtradas pelos três módulos do
 * sisprov; grants de outros apps nunca vão para o browser). O `userId` vem da sessão
 * (`requireUserId`), NUNCA do cliente: senão qualquer um leria as permissões de qualquer userId.
 */
export const fetchMySisprovPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return resolveModulePermissions(userId, getAccessControlClient(), SISPROV_MODULES)
})

export type SisprovUserSearchResult = { id: string; email: string; saram: string | null }

/** Busca usuários por e-mail, para conceder acesso. Só administrador do SISPROV. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<SisprovUserSearchResult[]> => {
		await requireSisprovAdmin(SISPROV_GRANT_ADMIN_LEVEL)
		return searchUsersByEmail(getCoreReadClient(), data.email)
	})

export type UnitOption = { id: number; code: string; display_name: string | null; is_training: boolean }

/**
 * OMs que o administrador alcança, para o seletor de escopo da concessão. Global: todas as
 * unidades; escopado: só a cobertura (OM e apoiadas). A OM sentinela do treino ENTRA, rotulada:
 * é nela que os almoxarifes se capacitam antes do piloto (D3 do design). Lista de referência
 * (código e nome), sem dado pessoal.
 */
export const listGrantableUnitsFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ coverage: "all" | number[]; units: UnitOption[] }> => {
	const ctx = await requireSisprovAdmin(SISPROV_GRANT_ADMIN_LEVEL)
	const core = getCoreReadClient()
	const graph = await fetchUnitSupportGraph(core)
	const coverage = resolveModuleUnitCoverage(ctx.permissions, SISPROV_ADMIN_MODULE, graph, SISPROV_GRANT_ADMIN_LEVEL)
	const { data, error } = await core.from("units").select("id, code, display_name, is_training").order("code").limit(500)
	if (error) throw new Error(`Erro ao listar unidades: ${error.message}`)
	const units = (data ?? []) as UnitOption[]
	if (coverage === "all") return { coverage: "all", units }
	const reachable = new Set(coverage)
	return { coverage: [...coverage], units: units.filter((unit) => reachable.has(unit.id)) }
})

export type SisprovPermissionView = Pick<SisprovPermissionRow, "id" | "module" | "level" | "unit_id" | "kitchen_id">

/** Grants dos módulos do SISPROV de um usuário, inclusive o `storage` por cozinha. Só administrador do SISPROV. */
export const fetchUserSisprovPermissionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.uuid() }))
	.handler(async ({ data }): Promise<SisprovPermissionView[]> => {
		await requireSisprovAdmin(SISPROV_GRANT_ADMIN_LEVEL)
		const { data: rows, error } = await getAccessControlClient()
			.from("user_permissions")
			.select("id, module, level, unit_id, kitchen_id")
			.eq("user_id", data.userId)
			.in("module", [...SISPROV_MODULES])
			.order("module")
			.order("level", { ascending: false })
		if (error) throw new Error(`Erro ao ler os acessos: ${error.message}`)
		return (rows ?? []) as SisprovPermissionView[]
	})

/** Recusa de política vira 403 com a frase para a tela; falha do banco vira a frase do `PermissionChangeError`. */
function rethrowAccessError(error: unknown): never {
	if (error instanceof GrantNotAllowedError || error instanceof GrantManagedElsewhereError) forbidden(error.message)
	if (error instanceof PermissionChangeError) throw new Error(error.message, { cause: error })
	throw error
}

async function actorCoverage(ctx: Awaited<ReturnType<typeof requireSisprovAdmin>>): Promise<UnitCoverage> {
	const graph = await fetchUnitSupportGraph(getCoreReadClient())
	return resolveModuleUnitCoverage(ctx.permissions, SISPROV_ADMIN_MODULE, graph, SISPROV_GRANT_ADMIN_LEVEL)
}

/**
 * Concede ou atualiza um acesso do SISPROV (idempotente). O par (módulo, nível) é validado
 * junto; a OM é nula para grant global. Grant e log numa transação (`changeModulePermission`).
 */
export const grantSisprovPermissionFn = createServerFn({ method: "POST" })
	.validator(z.intersection(SisprovGrantTargetSchema, z.object({ userId: z.uuid(), unitId: z.number().int().positive().nullable() })))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSisprovAdmin(SISPROV_GRANT_ADMIN_LEVEL)
		try {
			const coverage = await actorCoverage(ctx)
			await changeModulePermission(getAccessControlClient(), buildSisprovGrant({ actorId: ctx.userId, coverage }, data))
			return { ok: true }
		} catch (error) {
			rethrowAccessError(error)
		}
	})

/**
 * Revoga um grant pela linha que a tela mostrou. O ALVO sai da linha (lida só entre os módulos
 * do sisprov, então um id de outro app não é alcançável daqui), não do cliente.
 */
export const revokeSisprovPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ permissionId: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSisprovAdmin(SISPROV_GRANT_ADMIN_LEVEL)
		const { data: row, error } = await getAccessControlClient()
			.from("user_permissions")
			.select("id, user_id, module, level, unit_id, kitchen_id, mess_hall_id")
			.eq("id", data.permissionId)
			.in("module", [...SISPROV_MODULES])
			.maybeSingle()
		if (error) throw new Error(`Erro ao ler o acesso: ${error.message}`)
		if (!row || !isSisprovModule(row.module)) throw new Error("Acesso não encontrado. A lista pode estar desatualizada.")
		try {
			const coverage = await actorCoverage(ctx)
			await changeModulePermission(getAccessControlClient(), buildSisprovRevoke({ actorId: ctx.userId, coverage }, row as SisprovPermissionRow))
			return { ok: true }
		} catch (error) {
			rethrowAccessError(error)
		}
	})
