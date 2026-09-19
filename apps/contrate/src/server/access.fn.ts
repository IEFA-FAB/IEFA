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
 * `touchesDeny`) — o escopado o vê, mas não o desfaz. O único bloqueio que esta tela CRIA é
 * o "Bloquear no copiloto" (`setAlphaCopilotBlockFn`): sem OM, nos quatro papéis de uma vez.
 *
 * ## Acúmulo de papéis
 *
 * Nada aqui impede a mesma pessoa de ter os quatro papéis na mesma OM — é decisão do
 * mantenedor (2026-09-19), sem segregação de funções. Cada concessão é um papel.
 *
 * Nada disso confia no cliente: a OM oferecida na tela é só conveniência, e a cobertura é
 * recalculada a cada chamada.
 *
 * ## Auditoria
 *
 * Toda concessão e revogação passa por `changeModulePermission` (@iefa/pbac), e o bloqueio
 * no copiloto por `setModuleBlock`: a escrita e a linha de
 * `access_control.sensitive_operation_log` entram numa transação só, dentro da função SQL. O
 * ator é o `userId` do guard — as entradas nem têm campo de ator (`access.contract.test.ts`).
 */

import type { UnitOption } from "@iefa/alpha-client/access"
import {
	changeModulePermission,
	fetchUnitSupportGraph,
	GrantNotAllowedError,
	PermissionChangeError,
	partitionOfLevel,
	resolveUserPermissions,
	searchUsersByEmail,
	setModuleBlock,
	type UnitCoverage,
	type UnitSupportEdge,
	type UserEmailSearchRow,
} from "@iefa/pbac"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
	ALPHA_ADMIN_MODULES,
	ALPHA_ROLE_GRANTS,
	type AlphaAdminModule,
	adminUnitChoices,
	annotateDenyImpact,
	buildAlphaBlockChange,
	buildAlphaPermissionChange,
	canListGrants,
	type DenyImpact,
	denyImpactNeedsGraph,
	denyImpactOnAllow,
	type GrantAlphaRoleInput,
	GrantAlphaRoleSchema,
	type GrantEffect,
	RevokeAlphaRoleSchema,
	SetCopilotBlockSchema,
	supportingUnitsOf,
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

/** O acesso recém-gravado vale? Ver {@link grantAlphaPermissionFn}. */
export type GrantOutcome = {
	ok: true
	previousLevel: number | null
	/**
	 * Algum bloqueio da pessoa anula o acesso recém-gravado — `true` também quando um acesso
	 * GLOBAL fica recortado em parte das OMs (`partial`). `null`: a conferência falhou depois
	 * da gravação, e a tela não afirma nem que vale nem que não vale.
	 */
	blocked: boolean | null
	/** Só no acesso global: vale, menos nas OMs bloqueadas. */
	partial: boolean
}

/**
 * Os bloqueios da pessoa anulam o acesso recém-gravado? Resolve as permissões VIVAS dela
 * exatamente como a API do α as resolve (`resolveUserPermissions`: grant inline e política
 * anexada, com a precedência de deny) e confere a OM do acesso contra a cobertura do papel,
 * expandida pela hierarquia de apoio (`denyImpactOnAllow`). O `deny_present` da função SQL só
 * enxerga o bloqueio da MESMA chave — um bloqueio global, de política ou na OM apoiadora
 * passava despercebido, e a tela dizia "concedido" para um acesso que não vale.
 *
 * `denyPresent` é só atalho: bloqueio vivo na mesma chave anula com certeza, sem ler nada.
 */
async function resolveGrantBlock(data: GrantAlphaRoleInput, denyPresent: boolean | null): Promise<Pick<GrantOutcome, "blocked" | "partial">> {
	if (denyPresent === true) return { blocked: true, partial: false }

	const allow = { ...ALPHA_ROLE_GRANTS[data.role], unitId: data.unitId }
	const permissions = await resolveUserPermissions(data.userId, getAccessControlClient())
	const graph = denyImpactNeedsGraph(allow, permissions) ? await fetchUnitSupportGraph(getCoreReadClient()) : null
	const impact: DenyImpact = denyImpactOnAllow(allow, permissions, graph)
	return { blocked: impact !== "none", partial: impact === "partial" }
}

/**
 * Concede UM papel numa OM (ou global). Idempotente: reconceder atualiza o nível e zera o
 * prazo. Registrado no log de auditoria na mesma transação.
 *
 * `blocked`: o acesso foi gravado, mas um bloqueio da pessoa o anula — a tela avisa em vez de
 * dizer só "concedido". A conferência roda DEPOIS da gravação e fora do `try` da concessão:
 * se ela falhar, o acesso já está gravado e auditado, e responder erro faria o administrador
 * conceder de novo algo que já foi concedido. Falha vira `blocked: null`.
 */
export const grantAlphaPermissionFn = createServerFn({ method: "POST" })
	.validator(GrantAlphaRoleSchema)
	.handler(async ({ data }): Promise<GrantOutcome> => {
		const { ctx, coverage } = await requireAlphaAdmin()
		let result: Awaited<ReturnType<typeof changeModulePermission>>
		try {
			// Ator = sessão (`ctx.userId`); o `data` não tem campo de ator.
			const change = buildAlphaPermissionChange({ actorId: ctx.userId, coverage }, data)
			await assertSelectableUnit(data.unitId)
			result = await changeModulePermission(getAccessControlClient(), change)
		} catch (error) {
			rethrowAccessError(error)
		}

		try {
			return { ok: true, previousLevel: result.previousLevel, ...(await resolveGrantBlock(data, result.denyPresent)) }
		} catch (cause) {
			// biome-ignore lint/suspicious/noConsole: a tela recebe só `blocked: null`; sem o log, a falha da conferência não deixa rastro nenhum no servidor
			console.error("[contrate] acesso gravado, mas a conferência de bloqueio falhou", cause)
			return { ok: true, previousLevel: result.previousLevel, blocked: null, partial: false }
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

/** O que o bloqueio no copiloto fez. `changed` vazio: a pessoa já estava no estado pedido. */
export type CopilotBlockOutcome = { ok: true; blocked: boolean; changed: number; unchanged: number }

/**
 * "Bloquear no copiloto" / "Desbloquear": deny SEM OM nos quatro papéis do α (ou a retirada
 * deles), numa transação, com uma linha de auditoria por papel alterado — o desligamento de
 * alguém do α num clique. Só o administrador GLOBAL, e nunca sobre si mesmo
 * (`buildAlphaBlockChange`). Os acessos concedidos ficam: o bloqueio os anula, o desbloqueio
 * os devolve.
 *
 * Toda escrita em `user_permissions` é da função SQL (`setModuleBlock`), nunca daqui.
 */
export const setAlphaCopilotBlockFn = createServerFn({ method: "POST" })
	.validator(SetCopilotBlockSchema)
	.handler(async ({ data }): Promise<CopilotBlockOutcome> => {
		const { ctx, coverage } = await requireAlphaAdmin()
		try {
			// Ator = sessão (`ctx.userId`); o `data` não tem campo de ator.
			const change = buildAlphaBlockChange({ actorId: ctx.userId, coverage }, data)
			const result = await setModuleBlock(getAccessControlClient(), change)
			return { ok: true, blocked: result.blocked, changed: result.changed.length, unchanged: result.unchanged.length }
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
	/**
	 * Bloqueio HERDADO: gravado fora da OM aberta — sem OM (global) ou numa OM que a apoia —,
	 * mas alcança o acesso de quem está na lista. Vem para a conta do `denyImpact` e para a
	 * tela dizer de onde o bloqueio vem; não é "desta OM", e só o administrador global o retira
	 * (na chave dele, não na da OM aberta).
	 */
	inherited: boolean
	/** Quanto os bloqueios vivos da pessoa tiram deste acesso (`none` em bloqueio e em vencido). */
	denyImpact: DenyImpact
}

/**
 * Os grants do α de UMA OM (`unitId`) — ou de todas, inclusive os globais (`null`, só para o
 * administrador global). Nunca fora da cobertura de quem pede — com uma exceção, a dos
 * bloqueios herdados.
 *
 * Lê as DUAS origens que `resolveUserPermissions` lê — grant inline e política anexada.
 * Inclui o grant vencido (a tela o marca), para a linha não sumir sem que ninguém a tenha
 * revogado.
 *
 * ## Bloqueios herdados
 *
 * Um acesso na OM aberta é anulado também por bloqueio sem OM e por bloqueio numa OM que a
 * apoia (o deny escopado desce pela hierarquia de apoio, como o allow). Sem essas linhas a
 * tela afirmaria que o acesso vale. Então, para as pessoas que JÁ estão na lista, vêm também
 * os bloqueios delas nesses escopos, marcados `inherited`. É o mínimo para a conta
 * (`annotateDenyImpact`) sair igual à da API do α — e nada de quem não está na lista.
 */
export const listAlphaGrantsFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().nonnegative().nullable() }))
	.handler(async ({ data }): Promise<AlphaGrant[]> => {
		const { coverage } = await requireAlphaAdmin()
		if (!canListGrants(coverage, data.unitId)) forbidden("Esta OM está fora da sua administração.")

		const accessControl = getAccessControlClient()
		const core = getCoreReadClient()
		const scope: RowScope = { kind: "unit", unitId: data.unitId }
		const [inline, byPolicy, graph] = await Promise.all([
			fetchInlineGrants(accessControl, scope),
			fetchPolicyGrants(accessControl, scope, coverage),
			fetchUnitSupportGraph(core),
		])
		const own = [...inline, ...byPolicy]
		if (own.length === 0) return []

		const inherited = data.unitId === null ? [] : await fetchInheritedDenies(accessControl, data.unitId, own, graph)
		const all = [...own, ...inherited]

		const userIds = [...new Set(all.map((g) => g.userId))]
		const unitIds = [...new Set(all.map((g) => g.unitId).filter((id): id is number => id !== null))]
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

		return annotateDenyImpact(all, graph)
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

/**
 * Os bloqueios que alcançam a OM `unitId` sem estar gravados nela — os sem OM e os das OMs
 * que a apoiam, transitivamente — das pessoas que já estão na lista (`own`).
 */
async function fetchInheritedDenies(
	accessControl: AnySupabaseClient,
	unitId: number,
	own: readonly PartialGrant[],
	graph: readonly UnitSupportEdge[]
): Promise<PartialGrant[]> {
	const scope: RowScope = { kind: "inheritedDenies", unitIds: supportingUnitsOf(unitId, graph), userIds: [...new Set(own.map((g) => g.userId))] }
	const [inline, byPolicy] = await Promise.all([fetchInlineGrants(accessControl, scope), fetchPolicyGrants(accessControl, scope, "all")])
	return [...inline, ...byPolicy]
}
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

type PartialGrant = Omit<AlphaGrant, "email" | "unitCode" | "denyImpact">

/**
 * Que linhas ler:
 *   - `unit`: as da OM aberta; `null` = todas as OMs e os globais (só o administrador global
 *     chega aqui);
 *   - `inheritedDenies`: só BLOQUEIOS, sem OM ou nas OMs `unitIds` (as apoiadoras da aberta),
 *     e só das pessoas `userIds`.
 */
type RowScope = { kind: "unit"; unitId: number | null } | { kind: "inheritedDenies"; unitIds: readonly number[]; userIds: readonly string[] }

/**
 * Aplica o recorte de OM e de lado a uma query com `unit_id` e `level`. O filtro de pessoa
 * fica com quem chama: no inline é coluna da própria linha; na política, do anexo.
 */
// biome-ignore lint/suspicious/noExplicitAny: builder do PostgREST de qualquer tabela
function applyRowScope<Q extends { eq: any; lte: any; is: any; or: any }>(query: Q, scope: RowScope): Q {
	if (scope.kind === "unit") return scope.unitId === null ? query : query.eq("unit_id", scope.unitId)
	const denies = query.lte("level", 0)
	return scope.unitIds.length === 0 ? denies.is("unit_id", null) : denies.or(`unit_id.is.null,unit_id.in.(${scope.unitIds.join(",")})`)
}

async function fetchInlineGrants(accessControl: AnySupabaseClient, scope: RowScope): Promise<PartialGrant[]> {
	let query = accessControl
		.from("user_permissions")
		.select("module, user_id, level, expires_at, unit_id")
		.in("module", [...ALPHA_ADMIN_MODULES])
		.is("kitchen_id", null)
		.is("mess_hall_id", null)
	query = applyRowScope(query, scope)
	if (scope.kind === "inheritedDenies") query = query.in("user_id", [...scope.userIds])

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
			inherited: scope.kind === "inheritedDenies",
		})
	)
}

/**
 * `coverage` é a defesa em profundidade da lista da OM: nenhuma linha sai dela. Os bloqueios
 * herdados passam `"all"` — eles estão fora da cobertura por definição, e o recorte que os
 * limita é o de `RowScope` (só bloqueio, só os escopos que alcançam a OM, só quem está na lista).
 */
async function fetchPolicyGrants(accessControl: AnySupabaseClient, scope: RowScope, coverage: UnitCoverage): Promise<PartialGrant[]> {
	const statementQuery = applyRowScope(
		accessControl
			.from("policy_statement")
			.select("policy_id, module, level, unit_id")
			.in("module", [...ALPHA_ADMIN_MODULES])
			.is("kitchen_id", null)
			.is("mess_hall_id", null),
		scope
	)

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
	const attachmentQuery = accessControl.from("user_policy_attachment").select("user_id, policy_id, expires_at").in("policy_id", ids)
	const [policies, attachments] = await Promise.all([
		accessControl.from("policy").select("id, name").in("id", ids).is("deleted_at", null),
		scope.kind === "inheritedDenies" ? attachmentQuery.in("user_id", [...scope.userIds]) : attachmentQuery,
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
					inherited: scope.kind === "inheritedDenies",
				}))
		)
}
