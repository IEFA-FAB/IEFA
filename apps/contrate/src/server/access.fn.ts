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
 * mantenedor (2026-09-19), sem segregação de funções. A concessão aceita vários papéis de uma
 * vez (`grantAlphaRolesFn`), mas cada papel continua sendo uma concessão própria, auditada.
 *
 * Nada disso confia no cliente: a OM oferecida na tela é só conveniência, e a cobertura é
 * recalculada a cada chamada.
 *
 * ## A lista de pessoas
 *
 * No auge, ~1000 pessoas com algum papel. A lista é por PESSOA, e o recorte (busca, filtros,
 * ordem, página) é feito aqui: a tela recebe só a página, com o total (`listAlphaPeopleFn`).
 * As leituras moram em `lib/alpha/access-read.server.ts`; a agregação, pura, em
 * `lib/alpha/people.ts`.
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
	resolveUserPermissions,
	setModuleBlock,
	type UnitCoverage,
	type UnitSupportEdge,
} from "@iefa/pbac"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
	fetchAuditRows,
	fetchGrants,
	fetchIdentities,
	fetchLastChanges,
	fetchUnitCodes,
	type PartialGrant,
	searchPeopleCandidates,
	withAuthEmails,
} from "@/lib/alpha/access-read.server"
import {
	ALPHA_GRANT_ROLES,
	ALPHA_ROLE_GRANTS,
	type AlphaGrantRole,
	adminUnitChoices,
	annotateDenyImpact,
	buildAlphaBlockChange,
	buildAlphaPermissionChange,
	canListGrants,
	type DenyImpact,
	denyImpactNeedsGraph,
	denyImpactOnAllow,
	GrantAlphaRolesSchema,
	GrantInputError,
	isExpiredGrant,
	planAlphaRoleGrants,
	RevokeAlphaRoleSchema,
	type RoleGrantOutcome,
	SetCopilotBlockSchema,
} from "@/lib/alpha/admin-access"
import {
	type AlphaGrant,
	type AlphaPerson,
	type AuditEntry,
	aggregatePeople,
	inheritedDenyUnits,
	isAuditVisible,
	listingUnits,
	needsEmailsForSearch,
	type PeoplePage,
	PeopleQuerySchema,
	type PersonIdentity,
	queryPeople,
	toAuditEntry,
	toUnitIdOrNull,
} from "@/lib/alpha/people"
import { forbidden, requireAlphaAdmin } from "@/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "@/lib/supabase.server"

export type { AlphaGrant, AlphaPerson, AuditEntry } from "@/lib/alpha/people"

/** O que a tela de acessos precisa saber do próprio administrador. */
export type AdminScope = {
	/** Administrador global: concede grant global e lista "todas as OMs". */
	isGlobal: boolean
	/** As OMs que ele administra (todas, no global), para o seletor de concessão e o filtro. */
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

/** Uma pessoa do cadastro do ERP, candidata a receber papel. */
export type PersonCandidate = { id: string } & PersonIdentity

/**
 * Busca por nome (posto + nome de guerra), e-mail ou Nr. de ordem no cadastro do ERP, para
 * conceder acesso. Só administrador. Até 10 resultados.
 */
export const searchAlphaCandidatesFn = createServerFn({ method: "GET" })
	.validator(z.object({ q: z.string().trim().min(2).max(80) }))
	.handler(async ({ data }): Promise<PersonCandidate[]> => {
		await requireAlphaAdmin()
		return searchPeopleCandidates(getCoreReadClient(), data.q)
	})

/**
 * Recusa de política e falha do banco viram mensagem para a tela; o erro do banco segue
 * como `cause` (para o log do servidor), nunca como texto da tela. `forbidden` marca o 403
 * antes de lançar.
 */
function rethrowAccessError(error: unknown): never {
	if (error instanceof GrantNotAllowedError) forbidden(error.message)
	if (error instanceof PermissionChangeError || error instanceof GrantInputError) {
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
 * Os bloqueios da pessoa anulam os acessos recém-gravados? Resolve as permissões VIVAS dela
 * exatamente como a API do α as resolve (`resolveUserPermissions`: grant inline e política
 * anexada, com a precedência de deny) e confere a OM de cada acesso contra a cobertura do
 * papel, expandida pela hierarquia de apoio (`denyImpactOnAllow`). Uma leitura para todos os
 * papéis da concessão.
 *
 * O `deny_present` da função SQL só enxerga o bloqueio da MESMA chave — um bloqueio global,
 * de política ou na OM apoiadora passava despercebido. Ele é só atalho: bloqueio vivo na
 * mesma chave anula com certeza, sem ler nada.
 */
async function resolveGrantBlocks(
	userId: string,
	unitId: number | null,
	granted: ReadonlyArray<{ role: AlphaGrantRole; denyPresent: boolean | null }>
): Promise<Map<AlphaGrantRole, { blocked: boolean; partial: boolean }>> {
	const result = new Map<AlphaGrantRole, { blocked: boolean; partial: boolean }>()
	const pending = granted.filter((entry) => {
		if (entry.denyPresent !== true) return true
		result.set(entry.role, { blocked: true, partial: false })
		return false
	})
	if (pending.length === 0) return result

	const permissions = await resolveUserPermissions(userId, getAccessControlClient())
	const allows = pending.map((entry) => ({ role: entry.role, allow: { ...ALPHA_ROLE_GRANTS[entry.role], unitId } }))
	const graph = allows.some(({ allow }) => denyImpactNeedsGraph(allow, permissions)) ? await fetchUnitSupportGraph(getCoreReadClient()) : null
	for (const { role, allow } of allows) {
		const impact: DenyImpact = denyImpactOnAllow(allow, permissions, graph)
		result.set(role, { blocked: impact !== "none", partial: impact === "partial" })
	}
	return result
}

/** O resultado da concessão múltipla: um desfecho por papel pedido, na ordem canônica. */
export type GrantRolesResult = { outcomes: RoleGrantOutcome[] }

/**
 * Concede VÁRIOS papéis a uma pessoa, numa OM (ou global), com o mesmo prazo. Cada papel é uma
 * concessão própria por `changeModulePermission` — a escrita e a linha de auditoria na mesma
 * transação —, e o desfecho volta papel a papel: um papel que falha não desfaz os que já
 * entraram (cada um foi auditado), e a tela diz exatamente quais valem.
 *
 * A política de quem concede (`planAlphaRoleGrants` → `assertGrantable`) é conferida para
 * TODOS os papéis antes da primeira gravação: uma recusa responde 403 e nada é gravado.
 *
 * Idempotente por papel: reconceder atualiza o nível e SUBSTITUI o prazo pelo pedido.
 *
 * `blocked`: o acesso foi gravado, mas um bloqueio da pessoa o anula. A conferência roda
 * DEPOIS das gravações e fora do `try` delas: se falhar, os acessos já estão gravados e
 * auditados, e responder erro faria o administrador conceder de novo. Falha vira `blocked: null`.
 */
export const grantAlphaRolesFn = createServerFn({ method: "POST" })
	.validator(GrantAlphaRolesSchema)
	.handler(async ({ data }): Promise<GrantRolesResult> => {
		const { ctx, coverage } = await requireAlphaAdmin()
		let planned: ReturnType<typeof planAlphaRoleGrants>
		try {
			// Ator = sessão (`ctx.userId`); o `data` não tem campo de ator.
			planned = planAlphaRoleGrants({ actorId: ctx.userId, coverage }, data)
			await assertSelectableUnit(data.unitId)
		} catch (error) {
			rethrowAccessError(error)
		}

		const written: Array<{ role: AlphaGrantRole; previousLevel: number | null; denyPresent: boolean | null }> = []
		const failed = new Map<AlphaGrantRole, string>()
		// Em sequência, e não em paralelo: são no máximo quatro chaves distintas, e a ordem do log
		// fica a mesma da tela.
		for (const { role, change } of planned) {
			try {
				const result = await changeModulePermission(getAccessControlClient(), change)
				written.push({ role, previousLevel: result.previousLevel, denyPresent: result.denyPresent })
			} catch (error) {
				// biome-ignore lint/suspicious/noConsole: a tela recebe a frase; a causa do banco só fica no log do servidor
				console.error(`[contrate] concessão de ${role} falhou`, error instanceof PermissionChangeError ? error.cause : error)
				failed.set(role, error instanceof PermissionChangeError ? error.message : "Falha ao conceder este papel.")
			}
		}

		let blocks: Map<AlphaGrantRole, { blocked: boolean; partial: boolean }> | null = null
		if (written.length > 0) {
			try {
				blocks = await resolveGrantBlocks(data.userId, data.unitId, written)
			} catch (cause) {
				// biome-ignore lint/suspicious/noConsole: a tela recebe só `blocked: null`; sem o log, a falha da conferência não deixa rastro nenhum no servidor
				console.error("[contrate] acesso gravado, mas a conferência de bloqueio falhou", cause)
			}
		}

		const outcomes: RoleGrantOutcome[] = planned.map(({ role }) => {
			const failure = failed.get(role)
			if (failure !== undefined) return { role, status: "failed", message: failure }
			const entry = written.find((w) => w.role === role)
			const block = blocks?.get(role)
			return {
				role,
				status: "granted",
				previousLevel: entry?.previousLevel ?? null,
				blocked: block ? block.blocked : null,
				partial: block?.partial ?? false,
			}
		})
		return { outcomes }
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

// ─── Leitura: lista de pessoas, painel da pessoa, prévia da concessão ───────────

/**
 * As linhas do α num recorte de OMs, com os bloqueios herdados e a conta de bloqueio de cada
 * acesso — a MESMA conta da API do α (`annotateDenyImpact`).
 *
 * ## Bloqueios herdados
 *
 * Um acesso numa OM é anulado também por bloqueio sem OM e por bloqueio numa OM que a apoia
 * (o deny escopado desce pela hierarquia de apoio, como o allow). Sem essas linhas a tela
 * afirmaria que o acesso vale. Então, para as pessoas que JÁ estão no recorte, vêm também os
 * bloqueios delas nesses escopos, marcados `inherited` — e nada de quem não está nele.
 */
async function loadAnnotatedGrants(
	coverage: UnitCoverage,
	units: readonly number[] | "all",
	graph: readonly UnitSupportEdge[],
	userId?: string
): Promise<AlphaGrant[]> {
	const accessControl = getAccessControlClient()
	const own = await fetchGrants(accessControl, { kind: "units", units, userId }, coverage)
	if (own.length === 0) return []

	const inherited: PartialGrant[] =
		units === "all"
			? []
			: await fetchGrants(
					accessControl,
					{ kind: "inheritedDenies", unitIds: inheritedDenyUnits(units, graph), userIds: new Set(own.map((grant) => grant.userId)) },
					"all"
				)
	const all = [...own, ...inherited]
	const codes = await fetchUnitCodes(
		getCoreReadClient(),
		all.flatMap((grant) => (grant.unitId === null ? [] : [grant.unitId]))
	)
	return annotateDenyImpact(all, graph).map((grant) => ({ ...grant, unitCode: grant.unitId === null ? null : (codes.get(grant.unitId) ?? null) }))
}

/** A página da lista, e as OMs que ela abrange (para o filtro de OM). */
export type PeopleListResult = PeoplePage & { units: number[] | "all" }

/**
 * A lista de PESSOAS com papel do α no escopo da página — uma OM (ela e as que ela apoia,
 * dentro da cobertura) ou todas (`null`, só o administrador global, inclusive os grants sem
 * OM). Busca, filtros, ordem e página são aplicados AQUI; a tela recebe só a página e o total.
 *
 * Nunca fora da cobertura de quem pede — com a exceção dos bloqueios herdados.
 * Inclui o grant vencido (a tela o marca), para a linha não sumir sem que ninguém a tenha
 * revogado.
 */
export const listAlphaPeopleFn = createServerFn({ method: "GET" })
	.validator(PeopleQuerySchema)
	.handler(async ({ data }): Promise<PeopleListResult> => {
		const { coverage } = await requireAlphaAdmin()
		if (!canListGrants(coverage, data.scopeUnitId)) forbidden("Esta OM está fora da sua administração.")

		const now = Date.now()
		const graph = await fetchUnitSupportGraph(getCoreReadClient())
		const units = listingUnits(data.scopeUnitId, coverage, graph)
		const grants = await loadAnnotatedGrants(coverage, units, graph)
		const userIds = [...new Set(grants.map((grant) => grant.userId))]

		// A ordem por alteração precisa da data de TODO mundo; a por nome, só da página. O e-mail
		// do GoTrue (quem não tem `core.user_data`) só para todos quando há busca; senão, só a página.
		const searchesEmails = needsEmailsForSearch(data)
		const [identities, allChanges] = await Promise.all([
			fetchIdentities(getCoreReadClient(), userIds, { resolveMissingEmails: searchesEmails }),
			data.sort === "recent" && userIds.length > 0 ? fetchLastChanges(getAccessControlClient(), "all", coverage) : Promise.resolve(null),
		])
		const page = queryPeople(aggregatePeople(grants, identities, allChanges, now), data, graph, now)

		if (!searchesEmails) page.rows = await withAuthEmails(getCoreReadClient(), page.rows)
		if (allChanges === null && page.rows.length > 0) {
			const changes = await fetchLastChanges(
				getAccessControlClient(),
				page.rows.map((person) => person.userId),
				coverage
			)
			page.rows = page.rows.map((person) => ({ ...person, lastChangeAt: changes.get(person.userId) ?? null }))
		}
		return { ...page, units }
	})

/** O painel de uma pessoa: os papéis dela no que o administrador alcança e a trilha recente. */
export type PersonDetail = {
	userId: string
	identity: PersonIdentity
	/** `null` quando ela não tem nenhuma linha do α no que o administrador administra. */
	person: AlphaPerson | null
	/** As alterações de acesso mais recentes sobre ela, visíveis a quem pede. */
	audit: AuditEntry[]
}

/** Quantas entradas da trilha o painel mostra. */
const AUDIT_TRAIL_SIZE = 8

/**
 * O painel da pessoa: todas as linhas dela nas OMs que o administrador administra (o global,
 * todas, inclusive as sem OM), os bloqueios herdados, e a trilha de auditoria — quem alterou o
 * quê, quando —, recortada à administração de quem pede (`isAuditVisible`). Só leitura.
 */
export const fetchAlphaPersonFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.uuid() }))
	.handler(async ({ data }): Promise<PersonDetail> => {
		const { coverage } = await requireAlphaAdmin()
		const now = Date.now()
		const core = getCoreReadClient()
		const graph = await fetchUnitSupportGraph(core)
		const units = coverage === "all" ? ("all" as const) : coverage
		const [grants, auditRows] = await Promise.all([
			loadAnnotatedGrants(coverage, units, graph, data.userId),
			// Folga sobre o que se mostra: parte do log pode estar fora da administração de quem pede.
			fetchAuditRows(getAccessControlClient(), data.userId, AUDIT_TRAIL_SIZE * 5),
		])
		const visible = auditRows
			.filter((row) => isAuditVisible({ operation: row.operation, unitId: toUnitIdOrNull(row.target?.unit_id) }, coverage))
			.slice(0, AUDIT_TRAIL_SIZE)

		const actorIds = visible.map((row) => row.actor_id)
		const auditUnits = visible.flatMap((row) => {
			const unitId = toUnitIdOrNull(row.target?.unit_id)
			return unitId === null ? [] : [unitId]
		})
		const [identities, codes] = await Promise.all([fetchIdentities(core, [data.userId, ...actorIds]), fetchUnitCodes(core, auditUnits)])
		const actorLabel = (id: string) => {
			const identity = identities.get(id)
			return identity?.name || identity?.email || "Conta sem cadastro"
		}

		const audit = visible.flatMap((row) => {
			const entry = toAuditEntry(row, { actor: actorLabel, unitCode: (id) => codes.get(id) ?? null })
			return entry ? [entry] : []
		})
		const lastChanges = new Map(audit.length > 0 ? [[data.userId, audit[0]?.at ?? ""]] : [])
		const person = aggregatePeople(grants, identities, lastChanges, now)[0] ?? null
		return { userId: data.userId, identity: identities.get(data.userId) ?? { email: "", name: null, nrOrdem: null }, person, audit }
	})

/** Como cada papel está para a pessoa na OM escolhida, antes de conceder. */
export type RolePreview = {
	role: AlphaGrantRole
	/** Os acessos que ela já tem neste papel, NESTA OM (ou global): inline ou por política. */
	existing: Array<{ source: "inline" | "policy"; policyName?: string; expiresAt: string | null; expired: boolean }>
	/** Quanto os bloqueios vivos dela tirariam de um acesso novo aqui — a conta da concessão. */
	denyImpact: DenyImpact
}

/**
 * A prévia do formulário de concessão: para cada papel, o que a pessoa já tem na OM escolhida
 * e se um bloqueio dela anularia o acesso novo. É a MESMA conta que a concessão faz depois de
 * gravar (`resolveUserPermissions` + `denyImpactOnAllow`), para o aviso vir antes do clique.
 * Só nas OMs que o administrador administra.
 */
export const previewAlphaGrantFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.uuid(), unitId: z.number().int().nonnegative().nullable() }))
	.handler(async ({ data }): Promise<RolePreview[]> => {
		const { coverage } = await requireAlphaAdmin()
		if (!canListGrants(coverage, data.unitId)) forbidden("Esta OM está fora da sua administração.")

		const accessControl = getAccessControlClient()
		const [permissions, rows] = await Promise.all([
			resolveUserPermissions(data.userId, accessControl),
			fetchGrants(accessControl, { kind: "units", units: data.unitId === null ? "all" : [data.unitId], userId: data.userId }, coverage),
		])
		const allows = ALPHA_GRANT_ROLES.map((role) => ({ role, allow: { ...ALPHA_ROLE_GRANTS[role], unitId: data.unitId } }))
		const graph = allows.some(({ allow }) => denyImpactNeedsGraph(allow, permissions)) ? await fetchUnitSupportGraph(getCoreReadClient()) : null
		const now = Date.now()

		return allows.map(({ role, allow }) => ({
			role,
			existing: rows
				.filter((row) => row.effect === "allow" && row.module === allow.module && row.unitId === data.unitId)
				.map((row) => ({ source: row.source, policyName: row.policyName, expiresAt: row.expiresAt, expired: isExpiredGrant(row, now) })),
			denyImpact: denyImpactOnAllow(allow, permissions, graph),
		}))
	})
