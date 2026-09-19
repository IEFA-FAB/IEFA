/**
 * @module access.fn
 * Gestão dos acessos ao Projeto α: os papéis `alpha-requester`, `alpha-procurement`,
 * `alpha-aci` e `alpha-admin`, cada um por OM, em `access_control.user_permissions`.
 *
 * Cada app do ERP administra só os PRÓPRIOS módulos, mesmo com a tabela compartilhada.
 * O módulo pedido pelo cliente é validado contra a lista do α (`ALPHA_ADMIN_MODULES`).
 *
 * ## Administração escopada
 *
 * Gate: `alpha-admin` nível 3 em alguma OM (`requireAlphaAdmin`), com a cobertura resolvida
 * AQUI, pela hierarquia de apoio. O administrador de uma OM concede e revoga só nela e nas
 * que ela apoia — nunca grant global, nunca sobre si mesmo (`assertGrantable`). O global
 * concede qualquer coisa — inclusive sobre si mesmo, menos revogar o próprio `alpha-admin`.
 *
 * ## Bloqueios (deny)
 *
 * Acesso (`level > 0`) e bloqueio (`level <= 0`) coexistem na mesma chave, e o bloqueio
 * vence. A lista devolve os dois lados marcados (`effect`); revogar diz QUAL lado sai, e o
 * outro fica. Retirar um bloqueio é só do administrador global (`assertGrantable`,
 * `touchesDeny`) — o escopado o vê, mas não o desfaz. Esta tela não cria bloqueio.
 *
 * Nada disso confia no cliente: a OM oferecida na tela é só conveniência, e a cobertura é
 * recalculada a cada chamada.
 *
 * ## Auditoria
 *
 * Toda concessão e revogação passa por `changeModulePermission` (@iefa/pbac): o grant e a
 * linha de `access_control.sensitive_operation_log` entram numa transação só. O ator é o
 * `userId` do guard — as entradas nem têm campo de ator (`admin-access.contract.test.ts`).
 */

import type { UnitOption } from "@iefa/alpha-client/access"
import {
	changeModulePermission,
	GrantNotAllowedError,
	PermissionChangeError,
	partitionOfLevel,
	searchUsersByEmail,
	type UnitCoverage,
	type UserEmailSearchRow,
} from "@iefa/pbac"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
	ALPHA_ADMIN_MODULES,
	type AlphaAdminModule,
	adminUnitChoices,
	buildAlphaPermissionChange,
	canListGrants,
	GrantAlphaRoleSchema,
	type GrantEffect,
	RevokeAlphaRoleSchema,
} from "@/lib/alpha/admin-access"
import { forbidden, requireAlphaAdmin } from "@/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient, como no @iefa/pbac
type AnySupabaseClient = SupabaseClient<any, any>

/** O que a tela de acessos precisa saber do próprio administrador. */
export type AdminScope = {
	/** Administrador global: concede grant global e lista "todas as OMs". */
	isGlobal: boolean
	/** As OMs que ele administra (todas, no global), para o seletor de concessão. */
	units: UnitOption[]
}

/** As OMs selecionáveis — o mesmo recorte do `/units` do α: sem a sentinela de treino e sem a sobra de teste sem tipo. */
async function fetchSelectableUnits(): Promise<UnitOption[]> {
	const { data, error } = await getCoreReadClient()
		.from("units")
		.select("id, code, display_name, supporting_unit_id")
		.eq("is_training", false)
		.not("type", "is", null)
		.order("code")
	if (error) throw new Error(error.message)
	return (data ?? []) as UnitOption[]
}

/** A cobertura do administrador da sessão e as OMs que ela alcança. */
export const fetchAdminScopeFn = createServerFn({ method: "GET" }).handler(async (): Promise<AdminScope> => {
	const { coverage } = await requireAlphaAdmin()
	const { allowGlobal, units } = adminUnitChoices(coverage, await fetchSelectableUnits())
	return { isGlobal: allowGlobal, units }
})

/** Busca por e-mail no cadastro do ERP, para conceder acesso. Só administrador. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(3) }))
	.handler(async ({ data }): Promise<UserEmailSearchRow[]> => {
		await requireAlphaAdmin()
		return searchUsersByEmail(getCoreReadClient(), data.email)
	})

/**
 * Recusa de política e falha do banco viram mensagem para a tela; o erro do banco segue
 * como `cause` (para o log do servidor), nunca como texto da tela. `forbidden` marca o 403
 * antes de lançar.
 */
function rethrowAccessError(error: unknown): never {
	if (error instanceof GrantNotAllowedError) forbidden(error.message)
	if (error instanceof PermissionChangeError) {
		throw new Error(error.message, { cause: error })
	}
	throw error
}

/** A OM do grant existe e é de processo real? `null` (global) dispensa. */
async function assertSelectableUnit(unitId: number | null): Promise<void> {
	if (unitId === null) return
	const { data, error } = await getCoreReadClient().from("units").select("id, is_training").eq("id", unitId).maybeSingle()
	if (error) throw new Error(error.message)
	if (!data || data.is_training) throw new Error("OM inexistente.")
}

/**
 * Concede UM papel numa OM (ou global). Idempotente: reconceder atualiza o nível e zera o
 * prazo. Registrado no log de auditoria na mesma transação.
 *
 * `blockedByDeny`: há bloqueio vivo na mesma chave — o acesso foi gravado, mas não vale
 * enquanto o bloqueio existir. A tela avisa em vez de dizer só "concedido".
 */
export const grantAlphaPermissionFn = createServerFn({ method: "POST" })
	.validator(GrantAlphaRoleSchema)
	.handler(async ({ data }): Promise<{ ok: true; previousLevel: number | null; blockedByDeny: boolean }> => {
		const { ctx, coverage } = await requireAlphaAdmin()
		try {
			// Ator = sessão (`ctx.userId`); o `data` não tem campo de ator.
			const change = buildAlphaPermissionChange({ actorId: ctx.userId, coverage }, data)
			await assertSelectableUnit(data.unitId)
			const result = await changeModulePermission(getAccessControlClient(), change)
			return { ok: true, previousLevel: result.previousLevel, blockedByDeny: result.denyPresent === true }
		} catch (error) {
			rethrowAccessError(error)
		}
	})

/**
 * Revoga UM lado do grant INLINE de um papel numa OM (ou o global): o acesso (`allow`) ou o
 * bloqueio (`deny`, só o administrador global) — o outro lado da chave fica. Registrado no
 * log na mesma transação; lado sem linha é erro, e nada é registrado.
 */
export const revokeAlphaPermissionFn = createServerFn({ method: "POST" })
	.validator(RevokeAlphaRoleSchema)
	.handler(async ({ data }): Promise<{ ok: true; removed: number }> => {
		const { ctx, coverage } = await requireAlphaAdmin()
		try {
			const change = buildAlphaPermissionChange({ actorId: ctx.userId, coverage }, data)
			const result = await changeModulePermission(getAccessControlClient(), change)
			return { ok: true, removed: result.removed }
		} catch (error) {
			rethrowAccessError(error)
		}
	})

export type AlphaGrant = {
	userId: string
	module: AlphaAdminModule
	/** OM do grant; `null` é o grant global. */
	unitId: number | null
	/** Sigla da OM, para a lista; `null` no global. */
	unitCode: string | null
	/** E-mail institucional; vazio só quando a conta não tem e-mail no GoTrue. */
	email: string
	level: number
	/**
	 * `allow` é acesso (`level > 0`); `deny` é BLOQUEIO (`level <= 0`) — anula o acesso do
	 * mesmo papel na chave, e a tela nunca o mostra como papel concedido.
	 */
	effect: GrantEffect
	/** ISO 8601, ou `null` sem prazo. Vencido é ausência (de acesso ou de bloqueio), não deny. */
	expiresAt: string | null
	/**
	 * `policy` é acesso emprestado por política anexada, e NÃO se revoga aqui: apagar a
	 * linha de `user_permissions` não desfaz o anexo, e a chamada responderia sucesso com
	 * o acesso de pé.
	 */
	source: "inline" | "policy"
	policyName?: string
}

/**
 * Os grants do α de UMA OM (`unitId`) — ou de todas, inclusive os globais (`null`, só para o
 * administrador global). Nunca fora da cobertura de quem pede.
 *
 * Lê as DUAS origens que `resolveUserPermissions` lê — grant inline e política anexada.
 * Inclui o grant vencido (a tela o marca), para a linha não sumir sem que ninguém a tenha
 * revogado.
 */
export const listAlphaGrantsFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().nonnegative().nullable() }))
	.handler(async ({ data }): Promise<AlphaGrant[]> => {
		const { coverage } = await requireAlphaAdmin()
		if (!canListGrants(coverage, data.unitId)) forbidden("Esta OM está fora da sua administração.")

		const accessControl = getAccessControlClient()
		const [inline, byPolicy] = await Promise.all([fetchInlineGrants(accessControl, data.unitId), fetchPolicyGrants(accessControl, data.unitId, coverage)])
		const all = [...inline, ...byPolicy]
		if (all.length === 0) return []

		const userIds = [...new Set(all.map((g) => g.userId))]
		const unitIds = [...new Set(all.map((g) => g.unitId).filter((id): id is number => id !== null))]
		const core = getCoreReadClient()
		const [users, units] = await Promise.all([
			core.from("user_data").select("id, email").in("id", userIds),
			unitIds.length === 0 ? Promise.resolve({ data: [], error: null }) : core.from("units").select("id, code").in("id", unitIds),
		])
		if (users.error) throw new Error(users.error.message)
		if (units.error) throw new Error(units.error.message)

		const emailById = new Map(((users.data ?? []) as Array<{ id: string; email: string | null }>).map((u) => [u.id, u.email ?? ""]))
		const codeById = new Map(((units.data ?? []) as Array<{ id: number; code: string }>).map((u) => [u.id, u.code]))
		const fallback = await fetchEmailsFromAuth(
			core,
			userIds.filter((id) => !emailById.get(id))
		)

		return all
			.map((g) => ({
				...g,
				email: emailById.get(g.userId) || fallback.get(g.userId) || "",
				unitCode: g.unitId === null ? null : (codeById.get(g.unitId) ?? null),
			}))
			.sort(
				(a, b) =>
					(a.email || a.userId).localeCompare(b.email || b.userId, "pt-BR") ||
					(a.unitCode ?? "").localeCompare(b.unitCode ?? "", "pt-BR") ||
					a.module.localeCompare(b.module)
			)
	})

/** Chamadas simultâneas ao GoTrue na busca de e-mail — o suficiente para a lista não esperar em fila, sem abrir uma conexão por pessoa. */
const AUTH_LOOKUP_CONCURRENCY = 5

/**
 * E-mail pela API de administração do GoTrue, para quem ainda não tem linha em
 * `core.user_data` (a linha nasce no login do sisub). Só leitura.
 *
 * Em lotes, e não tudo de uma vez: um `Promise.all` sobre a lista inteira dispara uma
 * requisição por pessoa faltante ao mesmo tempo, e é o GoTrue que paga — justo na tela
 * que se abre depois de conceder acesso a muita gente.
 */
async function fetchEmailsFromAuth(core: AnySupabaseClient, userIds: readonly string[]): Promise<Map<string, string>> {
	const found = new Map<string, string>()

	for (let i = 0; i < userIds.length; i += AUTH_LOOKUP_CONCURRENCY) {
		const batch = userIds.slice(i, i + AUTH_LOOKUP_CONCURRENCY)
		const resolved = await Promise.all(
			batch.map(async (id) => {
				const { data, error } = await core.auth.admin.getUserById(id)
				return [id, error ? "" : (data.user?.email ?? "")] as const
			})
		)
		for (const [id, email] of resolved) if (email !== "") found.set(id, email)
	}

	return found
}

type PartialGrant = Omit<AlphaGrant, "email" | "unitCode">

async function fetchInlineGrants(accessControl: AnySupabaseClient, unitId: number | null): Promise<PartialGrant[]> {
	let query = accessControl
		.from("user_permissions")
		.select("module, user_id, level, expires_at, unit_id")
		.in("module", [...ALPHA_ADMIN_MODULES])
		.is("kitchen_id", null)
		.is("mess_hall_id", null)
	// `null` = todas as OMs e os globais (só o administrador global chega aqui).
	if (unitId !== null) query = query.eq("unit_id", unitId)

	const { data, error } = await query
	if (error) throw new Error(error.message)
	return ((data ?? []) as Array<{ module: AlphaAdminModule; user_id: string; level: number; expires_at: string | null; unit_id: number | null }>).map(
		(row) => ({
			userId: row.user_id,
			module: row.module,
			unitId: row.unit_id,
			level: row.level,
			effect: partitionOfLevel(row.level),
			expiresAt: row.expires_at,
			source: "inline" as const,
		})
	)
}

async function fetchPolicyGrants(accessControl: AnySupabaseClient, unitId: number | null, coverage: UnitCoverage): Promise<PartialGrant[]> {
	let statementQuery = accessControl
		.from("policy_statement")
		.select("policy_id, module, level, unit_id")
		.in("module", [...ALPHA_ADMIN_MODULES])
		.is("kitchen_id", null)
		.is("mess_hall_id", null)
	if (unitId !== null) statementQuery = statementQuery.eq("unit_id", unitId)

	const { data: statements, error: statementError } = await statementQuery
	if (statementError) {
		// Banco sem o modelo de políticas: mesma degradação do `@iefa/pbac`. Aqui só
		// encolhe uma lista de conferência — nunca concede acesso.
		if (statementError.code === "PGRST205" || statementError.code === "42P01") return []
		throw new Error(statementError.message)
	}

	type Statement = { policyId: string; module: AlphaAdminModule; level: number; effect: GrantEffect; unitId: number | null }
	// Maior nível por (política, módulo, OM, lado) — a semântica da resolução. O lado entra na
	// chave: um deny da política não pode ser engolido pelo allow dela (nem virar um allow).
	const byKey = new Map<string, Statement>()
	for (const row of (statements ?? []) as Array<{ policy_id: string; module: AlphaAdminModule; level: number; unit_id: number | null }>) {
		// Defesa em profundidade: a lista nunca sai da cobertura, mesmo que o filtro acima mude.
		if (!canListGrants(coverage, row.unit_id)) continue
		const effect = partitionOfLevel(row.level)
		const key = `${row.policy_id}:${row.module}:${row.unit_id ?? ""}:${effect}`
		const current = byKey.get(key)
		if (!current || row.level > current.level) byKey.set(key, { policyId: row.policy_id, module: row.module, level: row.level, effect, unitId: row.unit_id })
	}
	if (byKey.size === 0) return []

	const ids = [...new Set([...byKey.values()].map((v) => v.policyId))]
	const [policies, attachments] = await Promise.all([
		accessControl.from("policy").select("id, name").in("id", ids).is("deleted_at", null),
		accessControl.from("user_policy_attachment").select("user_id, policy_id, expires_at").in("policy_id", ids),
	])
	if (policies.error) throw new Error(policies.error.message)
	if (attachments.error) throw new Error(attachments.error.message)

	const nameById = new Map(((policies.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]))
	return ((attachments.data ?? []) as Array<{ user_id: string; policy_id: string; expires_at: string | null }>)
		.filter((row) => nameById.has(row.policy_id))
		.flatMap((row) =>
			[...byKey.values()]
				.filter((statement) => statement.policyId === row.policy_id)
				.map((statement) => ({
					userId: row.user_id,
					module: statement.module,
					unitId: statement.unitId,
					level: statement.level,
					effect: statement.effect,
					expiresAt: row.expires_at,
					source: "policy" as const,
					policyName: nameById.get(row.policy_id),
				}))
		)
}
