/**
 * LEITURAS da tela de acessos do α — grants (inline e de política), bloqueios herdados,
 * identidade das pessoas, última alteração e trilha de auditoria. Só leitura: toda escrita em
 * `user_permissions` é da função SQL auditada (`changeModulePermission`/`setModuleBlock`),
 * chamada de `server/access.fn.ts` (o teste de contrato varre este arquivo também).
 *
 * ## Volume
 *
 * No auge, ~1000 pessoas e 3 a 4 mil linhas de grant do α. Duas armadilhas do PostgREST:
 *   - o teto de linhas por resposta (`max_rows`, 1000 no Supabase hospedado) CORTA a leitura
 *     calado — a lista mostraria 1000 grants de 4000 sem erro nenhum. Toda leitura que pode
 *     passar disso vai por {@link readAllPages} (ordem estável por id + `range`);
 *   - `in.(...)` com mil UUIDs estoura a URL. Filtro por lista de pessoas vai em lotes
 *     ({@link ID_CHUNK}), ou nem vai: os bloqueios herdados são poucos, e se filtram em memória.
 */

import { partitionOfLevel, type UnitCoverage } from "@iefa/pbac"
import type { SupabaseClient } from "@supabase/supabase-js"
import { ALPHA_ADMIN_MODULES, type AlphaAdminModule, canListGrants, type GrantEffect } from "./admin-access"
import { createTtlCache, mapWithConcurrency } from "./concurrency"
import { type AlphaGrant, isAuditVisible, type PersonIdentity, toUnitIdOrNull } from "./people"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient, como no @iefa/pbac
type AnySupabaseClient = SupabaseClient<any, any>

/** Linha de grant antes da anotação de bloqueio e da sigla da OM. */
export type PartialGrant = Omit<AlphaGrant, "unitCode" | "denyImpact">

/** Teto de linhas por resposta do PostgREST no Supabase hospedado. */
export const MAX_ROWS = 1000
/** UUIDs por `in.(...)`: ~37 caracteres cada, longe do limite de URL. */
export const ID_CHUNK = 150

export class ReadError extends Error {
	constructor(
		message: string,
		public readonly code?: string
	) {
		super(message)
		this.name = "ReadError"
	}
}

type PageResult<T> = { data: T[] | null; error: { message: string; code?: string } | null; count?: number | null }

/**
 * Lê TODAS as linhas de uma consulta, em páginas de {@link MAX_ROWS}. A primeira traz a
 * contagem; as demais saem em paralelo. Sem contagem, segue página a página até uma curta.
 * `page` tem de ordenar por chave única — sem isso duas páginas repetem ou pulam linhas.
 */
export async function readAllPages<T>(page: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>, pageSize = MAX_ROWS): Promise<T[]> {
	const check = (result: PageResult<T>): T[] => {
		if (result.error) throw new ReadError(result.error.message, result.error.code)
		return result.data ?? []
	}

	const first = await page(0, pageSize - 1, true)
	const rows = check(first)
	if (rows.length < pageSize) return rows

	if (typeof first.count === "number") {
		const starts: number[] = []
		for (let from = pageSize; from < first.count; from += pageSize) starts.push(from)
		const rest = await Promise.all(starts.map((from) => page(from, from + pageSize - 1, false)))
		for (const result of rest) rows.push(...check(result))
		return rows
	}

	for (let from = pageSize; ; from += pageSize) {
		const next = check(await page(from, from + pageSize - 1, false))
		rows.push(...next)
		if (next.length < pageSize) return rows
	}
}

export function chunk<T>(items: readonly T[], size: number = ID_CHUNK): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

// ─── Grants ────────────────────────────────────────────────────────────────────

/**
 * Que linhas ler:
 *   - `units`: as das OMs `units` (`"all"` = todas, inclusive as sem OM — só o administrador
 *     global chega aqui), opcionalmente de UMA pessoa (`userId`, o painel de detalhe);
 *   - `inheritedDenies`: só BLOQUEIOS, sem OM ou nas OMs `unitIds`, das pessoas `userIds`.
 *     O filtro de pessoa é em memória: bloqueio é raro, e mil ids não cabem na URL.
 */
export type GrantScope =
	| { kind: "units"; units: readonly number[] | "all"; userId?: string }
	| { kind: "inheritedDenies"; unitIds: readonly number[]; userIds: ReadonlySet<string> }

// biome-ignore lint/suspicious/noExplicitAny: builder do PostgREST de qualquer tabela
type Builder = any

/** Recorte de OM e de lado numa query com `unit_id` e `level`. */
function applyScope(query: Builder, scope: GrantScope): Builder {
	if (scope.kind === "units") return scope.units === "all" ? query : query.in("unit_id", [...scope.units])
	const denies = query.lte("level", 0)
	return scope.unitIds.length === 0 ? denies.is("unit_id", null) : denies.or(`unit_id.is.null,unit_id.in.(${scope.unitIds.join(",")})`)
}

function keepUser(scope: GrantScope, userId: string): boolean {
	if (scope.kind === "inheritedDenies") return scope.userIds.has(userId)
	return scope.userId === undefined || scope.userId === userId
}

type InlineRow = { id: string; module: AlphaAdminModule; user_id: string; level: number; expires_at: string | null; unit_id: number | null }

export async function fetchInlineGrants(accessControl: AnySupabaseClient, scope: GrantScope): Promise<PartialGrant[]> {
	const rows = await readAllPages<InlineRow>((from, to, withCount) => {
		let query = accessControl
			.from("user_permissions")
			.select("id, module, user_id, level, expires_at, unit_id", withCount ? { count: "exact" } : undefined)
			.in("module", [...ALPHA_ADMIN_MODULES])
			.is("kitchen_id", null)
			.is("mess_hall_id", null)
		query = applyScope(query, scope)
		if (scope.kind === "units" && scope.userId !== undefined) query = query.eq("user_id", scope.userId)
		return query.order("id").range(from, to)
	})

	return rows
		.filter((row) => keepUser(scope, row.user_id))
		.map((row) => ({
			userId: row.user_id,
			module: row.module,
			unitId: row.unit_id,
			level: row.level,
			effect: partitionOfLevel(row.level),
			expiresAt: row.expires_at,
			source: "inline" as const,
			inherited: scope.kind === "inheritedDenies",
		}))
}

type StatementRow = { id: string; policy_id: string; module: AlphaAdminModule; level: number; unit_id: number | null }
type AttachmentRow = { id: string; user_id: string; policy_id: string; expires_at: string | null }

/**
 * `coverage` é a defesa em profundidade: nenhuma linha de política sai da cobertura. Os
 * bloqueios herdados passam `"all"` — estão fora da cobertura por definição, e o recorte que
 * os limita é o de {@link GrantScope}.
 */
export async function fetchPolicyGrants(accessControl: AnySupabaseClient, scope: GrantScope, coverage: UnitCoverage): Promise<PartialGrant[]> {
	let statements: StatementRow[]
	try {
		statements = await readAllPages<StatementRow>((from, to, withCount) =>
			applyScope(
				accessControl
					.from("policy_statement")
					.select("id, policy_id, module, level, unit_id", withCount ? { count: "exact" } : undefined)
					.in("module", [...ALPHA_ADMIN_MODULES])
					.is("kitchen_id", null)
					.is("mess_hall_id", null),
				scope
			)
				.order("id")
				.range(from, to)
		)
	} catch (error) {
		// Banco sem o modelo de políticas: mesma degradação do `@iefa/pbac`. Aqui só encolhe
		// uma lista de conferência — nunca concede acesso.
		if (error instanceof ReadError && (error.code === "PGRST205" || error.code === "42P01")) return []
		throw error
	}

	type Statement = { policyId: string; module: AlphaAdminModule; level: number; effect: GrantEffect; unitId: number | null }
	// Maior nível por (política, módulo, OM, lado) — a semântica da resolução. O lado entra na
	// chave: um deny da política não pode ser engolido pelo allow dela (nem virar um allow).
	const byKey = new Map<string, Statement>()
	for (const row of statements) {
		if (!canListGrants(coverage, row.unit_id)) continue
		const effect = partitionOfLevel(row.level)
		const key = `${row.policy_id}:${row.module}:${row.unit_id ?? ""}:${effect}`
		const current = byKey.get(key)
		if (!current || row.level > current.level) byKey.set(key, { policyId: row.policy_id, module: row.module, level: row.level, effect, unitId: row.unit_id })
	}
	if (byKey.size === 0) return []

	const policyIds = [...new Set([...byKey.values()].map((v) => v.policyId))]
	const [policies, attachments] = await Promise.all([
		Promise.all(chunk(policyIds).map((ids) => accessControl.from("policy").select("id, name").in("id", ids).is("deleted_at", null))),
		Promise.all(
			chunk(policyIds).map((ids) =>
				readAllPages<AttachmentRow>((from, to, withCount) => {
					let query = accessControl
						.from("user_policy_attachment")
						.select("id, user_id, policy_id, expires_at", withCount ? { count: "exact" } : undefined)
						.in("policy_id", ids)
					if (scope.kind === "units" && scope.userId !== undefined) query = query.eq("user_id", scope.userId)
					return query.order("id").range(from, to)
				})
			)
		),
	])
	const nameById = new Map<string, string>()
	for (const result of policies) {
		if (result.error) throw new ReadError(result.error.message, result.error.code)
		for (const policy of (result.data ?? []) as Array<{ id: string; name: string }>) nameById.set(policy.id, policy.name)
	}

	const statementsByPolicy = new Map<string, Statement[]>()
	for (const statement of byKey.values()) {
		const list = statementsByPolicy.get(statement.policyId)
		if (list) list.push(statement)
		else statementsByPolicy.set(statement.policyId, [statement])
	}

	return attachments
		.flat()
		.filter((row) => nameById.has(row.policy_id) && keepUser(scope, row.user_id))
		.flatMap((row) =>
			(statementsByPolicy.get(row.policy_id) ?? []).map((statement) => ({
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

/** Inline e de política, do mesmo recorte. */
export async function fetchGrants(accessControl: AnySupabaseClient, scope: GrantScope, coverage: UnitCoverage): Promise<PartialGrant[]> {
	const [inline, byPolicy] = await Promise.all([fetchInlineGrants(accessControl, scope), fetchPolicyGrants(accessControl, scope, coverage)])
	return [...inline, ...byPolicy]
}

// ─── Identidade ────────────────────────────────────────────────────────────────

/** Chamadas simultâneas ao GoTrue na busca de e-mail — o suficiente para não esperar em fila, sem abrir uma conexão por pessoa. */
const AUTH_LOOKUP_CONCURRENCY = 5

/**
 * E-mail do GoTrue por pessoa, em memória do processo por 5 minutos: a busca com espera na
 * tela dispara uma requisição a cada pausa de digitação, e o e-mail de uma conta não muda
 * nesse intervalo. Só memória (nada gravado), com teto de entradas. `""` = conta sem e-mail
 * (ou inexistente), também guardado para não ser perguntado de novo a cada tecla.
 */
const AUTH_EMAIL_CACHE = createTtlCache<string>({ ttlMs: 5 * 60_000, maxEntries: 5000 })

/**
 * E-mail pela API de administração do GoTrue, para quem ainda não tem linha em
 * `core.user_data` (a linha nasce no login do sisub). Só leitura, com no máximo
 * {@link AUTH_LOOKUP_CONCURRENCY} chamadas ao mesmo tempo, e o que já está no cache não sai
 * de novo. Falha de uma chamada não é guardada — a próxima requisição tenta de novo.
 */
export async function fetchEmailsFromAuth(
	core: AnySupabaseClient,
	userIds: readonly string[],
	cache: Pick<ReturnType<typeof createTtlCache<string>>, "get" | "set"> = AUTH_EMAIL_CACHE
): Promise<Map<string, string>> {
	const found = new Map<string, string>()
	const pending: string[] = []
	for (const id of new Set(userIds)) {
		const cached = cache.get(id)
		if (cached === undefined) pending.push(id)
		else if (cached !== "") found.set(id, cached)
	}
	await mapWithConcurrency(pending, AUTH_LOOKUP_CONCURRENCY, async (id) => {
		const { data, error } = await core.auth.admin.getUserById(id)
		if (error) return
		const email = data.user?.email ?? ""
		cache.set(id, email)
		if (email !== "") found.set(id, email)
	})
	return found
}

/**
 * Preenche pelo GoTrue o e-mail de quem veio sem (sem linha em `core.user_data`) — só nas
 * pessoas pedidas, normalmente as da PÁGINA. A lista não paga a busca de mil contas a cada
 * tecla, filtro ou página.
 */
export async function withAuthEmails<T extends { userId: string; email: string }>(core: AnySupabaseClient, people: readonly T[]): Promise<T[]> {
	const missing = people.filter((person) => person.email === "").map((person) => person.userId)
	if (missing.length === 0) return [...people]
	const emails = await fetchEmailsFromAuth(core, missing)
	return people.map((person) => (person.email === "" && emails.has(person.userId) ? { ...person, email: emails.get(person.userId) ?? "" } : person))
}

/** O nome de exibição do ERP só vale como nome quando não é o próprio e-mail (a view cai nele sem cadastro militar). */
export function identityName(displayName: string | null | undefined, email: string): string | null {
	const name = displayName?.trim() ?? ""
	return name === "" || name === email ? null : name
}

/**
 * Quem é cada pessoa: e-mail e Nr. de ordem (`core.user_data`), e posto + nome de guerra
 * (`core.v_user_identity`, a mesma identificação do sisub). Em lotes de {@link ID_CHUNK}.
 *
 * `resolveMissingEmails: false` deixa sem e-mail quem não tem linha em `core.user_data`, em
 * vez de perguntar ao GoTrue — a lista resolve depois, só para a página ({@link withAuthEmails}).
 */
export async function fetchIdentities(
	core: AnySupabaseClient,
	userIds: readonly string[],
	{ resolveMissingEmails = true }: { resolveMissingEmails?: boolean } = {}
): Promise<Map<string, PersonIdentity>> {
	const ids = [...new Set(userIds)]
	const chunks = chunk(ids)
	const [users, names] = await Promise.all([
		Promise.all(chunks.map((part) => core.from("user_data").select("id, email, nrOrdem").in("id", part))),
		Promise.all(chunks.map((part) => core.from("v_user_identity").select("id, display_name").in("id", part))),
	])

	const identities = new Map<string, PersonIdentity>()
	for (const result of users) {
		if (result.error) throw new ReadError(result.error.message, result.error.code)
		for (const row of (result.data ?? []) as Array<{ id: string; email: string | null; nrOrdem: string | null }>) {
			identities.set(row.id, { email: row.email ?? "", name: null, nrOrdem: row.nrOrdem ?? null })
		}
	}
	for (const result of names) {
		if (result.error) throw new ReadError(result.error.message, result.error.code)
		for (const row of (result.data ?? []) as Array<{ id: string; display_name: string | null }>) {
			const identity = identities.get(row.id)
			if (identity) identity.name = identityName(row.display_name, identity.email)
		}
	}

	const missing = ids.filter((id) => !identities.get(id)?.email)
	for (const id of missing) if (!identities.has(id)) identities.set(id, { email: "", name: null, nrOrdem: null })
	if (resolveMissingEmails && missing.length > 0) {
		const fallback = await fetchEmailsFromAuth(core, missing)
		for (const id of missing) {
			const email = fallback.get(id) ?? ""
			const identity = identities.get(id)
			if (identity) identity.email = email
			else identities.set(id, { email, name: null, nrOrdem: null })
		}
	}
	return identities
}

/** Quantas pessoas a busca do formulário de concessão devolve. */
export const CANDIDATE_LIMIT = 10

/** `%`, `_` e `\` do termo são literais no `ilike`, não curingas. */
function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, "\\$&")
}

/**
 * Candidatos a receber papel: quem casa o termo no e-mail, no nome (posto + nome de guerra,
 * `core.v_user_identity`) ou no começo do Nr. de ordem. Três leituras pequenas, com teto cada,
 * em vez de um `or` montado com o texto do usuário. Quem casa pelo nome vem primeiro — é como
 * o administrador conhece a pessoa.
 *
 * Só aparece quem tem linha em `core.user_data` (ela nasce no primeiro login num sistema do
 * IEFA que registra o cadastro).
 */
export async function searchPeopleCandidates(core: AnySupabaseClient, q: string): Promise<Array<{ id: string } & PersonIdentity>> {
	const term = escapeLike(q.trim())
	const digits = /^\d+$/.test(q.trim())
	const [byName, byEmail, byOrder] = await Promise.all([
		core.from("v_user_identity").select("id").ilike("display_name", `%${term}%`).order("display_name").limit(CANDIDATE_LIMIT),
		core.from("user_data").select("id").ilike("email", `%${term}%`).order("email").limit(CANDIDATE_LIMIT),
		digits
			? core.from("user_data").select("id").ilike("nrOrdem", `${term}%`).order("nrOrdem").limit(CANDIDATE_LIMIT)
			: Promise.resolve({ data: [], error: null }),
	])
	for (const result of [byName, byEmail, byOrder]) if (result.error) throw new ReadError(result.error.message, result.error.code)

	const ids = [...new Set([...(byName.data ?? []), ...(byEmail.data ?? []), ...(byOrder.data ?? [])].map((row) => (row as { id: string }).id))].slice(
		0,
		CANDIDATE_LIMIT
	)
	if (ids.length === 0) return []
	const identities = await fetchIdentities(core, ids)
	return ids.map((id) => ({ id, ...(identities.get(id) ?? { email: "", name: null, nrOrdem: null }) }))
}

/** A sigla de cada OM citada. */
export async function fetchUnitCodes(core: AnySupabaseClient, unitIds: readonly number[]): Promise<Map<number, string>> {
	const ids = [...new Set(unitIds)]
	if (ids.length === 0) return new Map()
	const results = await Promise.all(chunk(ids, 500).map((part) => core.from("units").select("id, code").in("id", part)))
	const codes = new Map<number, string>()
	for (const result of results) {
		if (result.error) throw new ReadError(result.error.message, result.error.code)
		for (const unit of (result.data ?? []) as Array<{ id: number; code: string }>) codes.set(unit.id, unit.code)
	}
	return codes
}

// ─── Auditoria ─────────────────────────────────────────────────────────────────

/** As operações de acesso do contrate no log: `contrate.permission.grant|revoke|block|unblock`. */
const AUDIT_OPERATIONS = "contrate.permission.%"

/**
 * A alteração mais recente VISÍVEL de cada pessoa (`target_user_id` do log). `"all"` lê o log de
 * acessos do contrate inteiro — só a ordem "alteração mais recente" precisa disso; a página
 * pede só as pessoas dela.
 */
export async function fetchLastChanges(
	accessControl: AnySupabaseClient,
	userIds: readonly string[] | "all",
	coverage: UnitCoverage
): Promise<Map<string, string>> {
	type Row = { id: string; created_at: string; operation: string; target_user_id: string | null; target_unit_id: string | null }
	const select = "id, created_at, operation, target_user_id:target->>target_user_id, target_unit_id:target->>unit_id"
	const results: Row[][] =
		userIds === "all"
			? [
					await readAllPages<Row>((from, to, withCount) =>
						accessControl
							.from("sensitive_operation_log")
							.select(select, withCount ? { count: "exact" } : undefined)
							.like("operation", AUDIT_OPERATIONS)
							.order("created_at", { ascending: false })
							.order("id")
							.range(from, to)
					),
				]
			: await Promise.all(
					chunk([...new Set(userIds)]).map((part) =>
						readAllPages<Row>((from, to, withCount) =>
							accessControl
								.from("sensitive_operation_log")
								.select(select, withCount ? { count: "exact" } : undefined)
								.like("operation", AUDIT_OPERATIONS)
								.in("target->>target_user_id", part)
								.order("created_at", { ascending: false })
								.order("id")
								.range(from, to)
						)
					)
				)

	const last = new Map<string, string>()
	for (const row of results.flat()) {
		if (!row.target_user_id) continue
		// A mesma régua da trilha do painel: o escopado não fica sabendo, nem pela data, do que
		// foi feito fora da administração dele.
		if (!isAuditVisible({ operation: row.operation, unitId: toUnitIdOrNull(row.target_unit_id) }, coverage)) continue
		const current = last.get(row.target_user_id)
		if (current === undefined || new Date(row.created_at).getTime() > new Date(current).getTime()) last.set(row.target_user_id, row.created_at)
	}
	return last
}

export type AuditRow = {
	id: string
	created_at: string
	operation: string
	actor_id: string
	target: { module?: string | null; unit_id?: number | null; partition?: string | null; level?: number | null; expires_at?: string | null } | null
}

/** As últimas operações de acesso do contrate sobre UMA pessoa, da mais recente para a mais antiga. */
export async function fetchAuditRows(accessControl: AnySupabaseClient, userId: string, limit: number): Promise<AuditRow[]> {
	const { data, error } = await accessControl
		.from("sensitive_operation_log")
		.select("id, created_at, operation, actor_id, target")
		.like("operation", AUDIT_OPERATIONS)
		.eq("target->>target_user_id", userId)
		.order("created_at", { ascending: false })
		.limit(limit)
	if (error) throw new ReadError(error.message, error.code)
	return (data ?? []) as AuditRow[]
}
