/**
 * A lista de PESSOAS da tela de acessos do α — uma linha por pessoa, com os papéis dela
 * agrupados por OM, e o recorte (busca, filtros, ordem, página) feito no SERVIDOR.
 *
 * No auge são cerca de 1000 pessoas com algum papel (3 a 4 mil linhas de grant). A tela não
 * recebe isso tudo: a server function lê as linhas do escopo, agrega por pessoa aqui, e
 * devolve só a página pedida, com o total. Tudo neste arquivo é PURO — a leitura fica em
 * `access-read.server.ts`, e a decisão de acesso segue em `admin-access.ts` e no `@iefa/pbac`.
 *
 * O efeito dos bloqueios (`denyImpact`) já chega calculado em cada linha
 * (`annotateDenyImpact`, a mesma conta da API do α): a agregação só o resume.
 */

import type { UnitCoverage, UnitSupportEdge } from "@iefa/pbac"
import { z } from "zod"
import {
	ALPHA_ADMIN_MODULES,
	ALPHA_GRANT_ROLES,
	ALPHA_ROLE_GRANTS,
	type AlphaAdminModule,
	type AlphaGrantRole,
	type CopilotBlockState,
	copilotBlockState,
	type DenyImpact,
	type GrantEffect,
	isExpiredGrant,
	todayInBrasilia,
} from "./admin-access"

// ─── Linhas de grant ───────────────────────────────────────────────────────────

/** Uma linha de acesso (ou de bloqueio) do α, como a lista a mostra. */
export type AlphaGrant = {
	userId: string
	module: AlphaAdminModule
	/** OM do grant; `null` é o grant global. */
	unitId: number | null
	/** Sigla da OM, para a lista; `null` no global. */
	unitCode: string | null
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
	 * Bloqueio HERDADO: gravado fora das OMs listadas — sem OM (global) ou numa OM que apoia
	 * uma delas —, mas alcança o acesso de quem está na lista. Só o administrador global o
	 * retira (na chave dele).
	 */
	inherited: boolean
	/** Quanto os bloqueios vivos da pessoa tiram deste acesso (`none` em bloqueio e em vencido). */
	denyImpact: DenyImpact
}

/** Quem é a pessoa, do cadastro do ERP. `name` é posto + nome de guerra (`core.v_user_identity`). */
export type PersonIdentity = { email: string; name: string | null; nrOrdem: string | null }

// ─── Pessoa agregada ───────────────────────────────────────────────────────────

/** Janela de "expira em breve", em dias. */
export const EXPIRING_SOON_DAYS = 30
const DAY_MS = 86_400_000

/**
 * Dias civis (Brasília) de hoje até o dia do prazo: 0 = vence hoje. Contar em horas daria "21
 * dias" para um acesso que vale até daqui a 20 dias, porque o prazo é o FIM do último dia.
 */
export function civilDaysUntil(expiresAt: string, now: number = Date.now()): number {
	const today = Date.parse(`${todayInBrasilia(now)}T00:00:00Z`)
	const last = Date.parse(`${todayInBrasilia(Date.parse(expiresAt))}T00:00:00Z`)
	return Math.round((last - today) / DAY_MS)
}

/** O resumo de situação de uma pessoa, das linhas dela na lista. */
export type PersonStatus = {
	/** Algum acesso vivo que vale (sem bloqueio que o anule). */
	active: boolean
	/** Algum bloqueio vivo — no copiloto, numa OM ou herdado. */
	blocked: boolean
	/** Algum acesso vivo anulado (ou recortado) por bloqueio. */
	annulled: boolean
	/** Algum acesso vivo vence nos próximos {@link EXPIRING_SOON_DAYS} dias. */
	expiringSoon: boolean
	/** Algum acesso já vencido (a linha segue lá até alguém revogar). */
	expired: boolean
	/** O prazo mais próximo entre os acessos vivos com prazo. */
	nextExpiry: string | null
}

export type AlphaPerson = {
	userId: string
	email: string
	name: string | null
	nrOrdem: string | null
	/** Todas as linhas da pessoa no escopo listado, em ordem de tela ({@link compareGrants}). */
	grants: AlphaGrant[]
	/** O bloqueio sem OM nos quatro papéis ("Bloqueado no copiloto"). */
	copilotBlock: CopilotBlockState
	status: PersonStatus
	/** A alteração de acesso mais recente registrada para a pessoa (log de auditoria do contrate). */
	lastChangeAt: string | null
}

const ROLE_ORDER = new Map<AlphaAdminModule, number>(ALPHA_ADMIN_MODULES.map((module, index) => [module, index]))

/** Ordem de tela: acessos antes de bloqueios; global primeiro; OM pela sigla; papel na ordem canônica. */
export function compareGrants(left: AlphaGrant, right: AlphaGrant): number {
	if (left.effect !== right.effect) return left.effect === "allow" ? -1 : 1
	if ((left.unitId === null) !== (right.unitId === null)) return left.unitId === null ? -1 : 1
	const byUnit = (left.unitCode ?? String(left.unitId ?? "")).localeCompare(right.unitCode ?? String(right.unitId ?? ""), "pt-BR")
	if (byUnit !== 0) return byUnit
	const byRole = (ROLE_ORDER.get(left.module) ?? 0) - (ROLE_ORDER.get(right.module) ?? 0)
	if (byRole !== 0) return byRole
	return (left.source === right.source ? 0 : left.source === "inline" ? -1 : 1) || (left.policyName ?? "").localeCompare(right.policyName ?? "")
}

/** A situação de uma pessoa (ou de um recorte das linhas dela). */
export function summarizeStatus(grants: readonly AlphaGrant[], now: number = Date.now()): PersonStatus {
	const soon = now + EXPIRING_SOON_DAYS * DAY_MS
	let active = false
	let blocked = false
	let annulled = false
	let expiringSoon = false
	let expired = false
	let nextExpiry: string | null = null

	for (const grant of grants) {
		const isExpired = isExpiredGrant(grant, now)
		if (grant.effect === "deny") {
			if (!isExpired) blocked = true
			continue
		}
		if (isExpired) {
			expired = true
			continue
		}
		if (grant.denyImpact === "none") active = true
		else annulled = true
		if (grant.expiresAt !== null) {
			const at = new Date(grant.expiresAt).getTime()
			if (at <= soon) expiringSoon = true
			if (nextExpiry === null || at < new Date(nextExpiry).getTime()) nextExpiry = grant.expiresAt
		}
	}
	return { active, blocked, annulled, expiringSoon, expired, nextExpiry }
}

/**
 * Agrupa as linhas por pessoa. Uma passada sobre as linhas; a identidade e a última
 * alteração vêm prontas (mapas por `userId`). Pessoa sem identidade no cadastro aparece
 * pelo id — sumir com ela esconderia um acesso que vale.
 */
export function aggregatePeople(
	grants: readonly AlphaGrant[],
	identities: ReadonlyMap<string, PersonIdentity>,
	lastChanges: ReadonlyMap<string, string> | null,
	now: number = Date.now()
): AlphaPerson[] {
	const byUser = new Map<string, AlphaGrant[]>()
	for (const grant of grants) {
		const list = byUser.get(grant.userId)
		if (list) list.push(grant)
		else byUser.set(grant.userId, [grant])
	}

	const people: AlphaPerson[] = []
	for (const [userId, rows] of byUser) {
		rows.sort(compareGrants)
		const identity = identities.get(userId)
		people.push({
			userId,
			email: identity?.email ?? "",
			name: identity?.name ?? null,
			nrOrdem: identity?.nrOrdem ?? null,
			grants: rows,
			copilotBlock: copilotBlockState(rows, userId, now),
			status: summarizeStatus(rows, now),
			lastChangeAt: lastChanges?.get(userId) ?? null,
		})
	}
	return people
}

/** Os acessos de uma pessoa agrupados por OM (global primeiro) — as fichas da linha. */
export type UnitRoleGroup = { unitId: number | null; unitCode: string | null; grants: AlphaGrant[] }

export function groupAllowsByUnit(grants: readonly AlphaGrant[]): UnitRoleGroup[] {
	const groups = new Map<string, UnitRoleGroup>()
	for (const grant of grants) {
		if (grant.effect !== "allow") continue
		const key = grant.unitId === null ? "global" : String(grant.unitId)
		const group = groups.get(key)
		if (group) group.grants.push(grant)
		else groups.set(key, { unitId: grant.unitId, unitCode: grant.unitCode, grants: [grant] })
	}
	return [...groups.values()]
		.map((group) => ({ ...group, grants: [...group.grants].sort(compareGrants) }))
		.sort((left, right) => {
			if ((left.unitId === null) !== (right.unitId === null)) return left.unitId === null ? -1 : 1
			return (left.unitCode ?? String(left.unitId)).localeCompare(right.unitCode ?? String(right.unitId), "pt-BR")
		})
}

// ─── Recorte: busca, filtros, ordem, página ─────────────────────────────────────

export const PEOPLE_STATUSES = ["ativo", "bloqueado", "anulado", "expira", "vencido"] as const
export type PeopleStatusFilter = (typeof PEOPLE_STATUSES)[number]
export const PEOPLE_SORTS = ["name", "recent"] as const
export type PeopleSort = (typeof PEOPLE_SORTS)[number]
export const SORT_DIRECTIONS = ["asc", "desc"] as const
export type SortDirection = (typeof SORT_DIRECTIONS)[number]
export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 50
/** Filtro de OM: uma OM (id) ou os grants sem OM. */
export type UnitFilter = number | "global"

/** O pedido de uma página, já validado. */
export type PeopleQuery = {
	q?: string
	role?: AlphaGrantRole
	unit?: UnitFilter
	status?: PeopleStatusFilter
	sort: PeopleSort
	dir: SortDirection
	page: number
	size: PageSize
}

/** Direção padrão de cada ordem: nome de A a Z; alteração da mais recente para a mais antiga. */
export function defaultDirection(sort: PeopleSort): SortDirection {
	return sort === "recent" ? "desc" : "asc"
}

/** Minúsculas e sem acento: "José" casa com "jose", "GAP-SJ" com "gap-sj". */
export function normalizeText(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
}

function matchesSearch(person: AlphaPerson, q: string | undefined): boolean {
	if (!q) return true
	const tokens = normalizeText(q).split(/\s+/).filter(Boolean)
	if (tokens.length === 0) return true
	const haystack = normalizeText(`${person.name ?? ""} ${person.email} ${person.nrOrdem ?? ""}`)
	return tokens.every((token) => haystack.includes(token))
}

function matchesUnit(grant: AlphaGrant, unit: UnitFilter | undefined): boolean {
	if (unit === undefined) return true
	return unit === "global" ? grant.unitId === null : grant.unitId === unit
}

/**
 * A pessoa passa pelos filtros de papel, OM e situação? Papel e OM recortam as LINHAS
 * consideradas; a situação é conferida só nelas — "anulado" com papel ACI é "algum acesso de
 * ACI anulado", e não "anulado em qualquer papel, e tem ACI".
 *
 * Um bloqueio sem OM alcança qualquer OM, então conta no filtro de OM para "bloqueado".
 */
export function personMatches(person: AlphaPerson, query: Pick<PeopleQuery, "q" | "role" | "unit" | "status">, now: number = Date.now()): boolean {
	if (!matchesSearch(person, query.q)) return false
	if (query.role === undefined && query.unit === undefined && query.status === undefined) return true

	const module = query.role === undefined ? undefined : ALPHA_ROLE_GRANTS[query.role].module
	const byRole = module === undefined ? person.grants : person.grants.filter((grant) => grant.module === module)
	const scoped = byRole.filter((grant) => matchesUnit(grant, query.unit))
	if (scoped.length === 0) return false
	if (query.status === undefined) return true

	if (query.status === "bloqueado") {
		const reaching = query.unit === undefined ? byRole : byRole.filter((grant) => matchesUnit(grant, query.unit) || grant.unitId === null)
		return summarizeStatus(reaching, now).blocked
	}
	const status = summarizeStatus(scoped, now)
	switch (query.status) {
		case "ativo":
			return status.active
		case "anulado":
			return status.annulled
		case "expira":
			return status.expiringSoon
		case "vencido":
			return status.expired
	}
}

const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base" })

/** O rótulo pelo qual a pessoa é ordenada e reconhecida: o nome, ou o e-mail sem nome. */
export function personLabel(person: Pick<AlphaPerson, "name" | "email" | "userId">): string {
	return person.name || person.email || person.userId
}

function byName(left: AlphaPerson, right: AlphaPerson): number {
	return COLLATOR.compare(personLabel(left), personLabel(right)) || left.email.localeCompare(right.email) || left.userId.localeCompare(right.userId)
}

/**
 * Ordena uma CÓPIA. Por alteração: quem não tem registro vai para o fim nas duas direções —
 * "sem registro" não é "a mais antiga", é "não se sabe" (os grants de antes da auditoria).
 */
export function sortPeople(people: readonly AlphaPerson[], sort: PeopleSort, dir: SortDirection): AlphaPerson[] {
	const sign = dir === "asc" ? 1 : -1
	const copy = [...people]
	if (sort === "name") return copy.sort((left, right) => sign * byName(left, right))
	// O instante de cada um é lido uma vez, e não a cada comparação.
	const at = new Map(copy.map((person) => [person.userId, person.lastChangeAt === null ? null : Date.parse(person.lastChangeAt)]))
	return copy.sort((left, right) => {
		const leftAt = at.get(left.userId) ?? null
		const rightAt = at.get(right.userId) ?? null
		if (leftAt === rightAt) return byName(left, right)
		if (leftAt === null) return 1
		if (rightAt === null) return -1
		return sign * (leftAt - rightAt) || byName(left, right)
	})
}

export type PageInfo = { page: number; size: number; total: number; pageCount: number; from: number; to: number }

/** A página pedida, presa ao intervalo válido (página além do fim cai na última). */
export function pageInfo(total: number, page: number, size: number): PageInfo {
	const pageCount = Math.max(1, Math.ceil(total / size))
	const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount)
	const from = total === 0 ? 0 : (current - 1) * size + 1
	const to = Math.min(total, current * size)
	return { page: current, size, total, pageCount, from, to }
}

export type PeoplePage = PageInfo & { rows: AlphaPerson[] /** Pessoas no escopo, antes de busca e filtros. */; grandTotal: number }

/** Busca, filtra, ordena e pagina. O total é o do recorte filtrado; `grandTotal`, o do escopo. */
export function queryPeople(people: readonly AlphaPerson[], query: PeopleQuery, now: number = Date.now()): PeoplePage {
	const filtered = people.filter((person) => personMatches(person, query, now))
	const sorted = sortPeople(filtered, query.sort, query.dir)
	const info = pageInfo(sorted.length, query.page, query.size)
	return { ...info, rows: sorted.slice(info.from === 0 ? 0 : info.from - 1, info.to), grandTotal: people.length }
}

// ─── OMs listadas ──────────────────────────────────────────────────────────────

/** As OMs apoiadas por `unitId`, transitivamente, sem ela mesma. O conjunto visitado corta ciclo. */
export function supportedUnitsOf(unitId: number, graph: readonly UnitSupportEdge[]): number[] {
	const children = new Map<number, number[]>()
	for (const edge of graph) {
		if (edge.supporting_unit_id === null || edge.supporting_unit_id === edge.id) continue
		const list = children.get(edge.supporting_unit_id)
		if (list) list.push(edge.id)
		else children.set(edge.supporting_unit_id, [edge.id])
	}
	const seen = new Set<number>([unitId])
	const out: number[] = []
	const queue = [unitId]
	while (queue.length > 0) {
		const current = queue.shift() as number
		for (const child of children.get(current) ?? []) {
			if (seen.has(child)) continue
			seen.add(child)
			out.push(child)
			queue.push(child)
		}
	}
	return out
}

/**
 * As OMs cujas linhas a página de uma OM lista: ela e as que ela apoia — quem administra o
 * GAP-SJ vê numa lista só todo mundo que administra por ele —, nunca fora da cobertura de
 * quem pede. `null` ("todas as OMs", só o global) é tudo, inclusive os grants sem OM.
 */
export function listingUnits(scopeUnitId: number | null, coverage: UnitCoverage, graph: readonly UnitSupportEdge[]): number[] | "all" {
	if (scopeUnitId === null) return "all"
	const units = [scopeUnitId, ...supportedUnitsOf(scopeUnitId, graph)]
	return coverage === "all" ? units : units.filter((id) => coverage.includes(id))
}

/**
 * De onde vêm os bloqueios que alcançam as OMs listadas sem estar gravados nelas: as OMs que
 * apoiam alguma delas (transitivamente) e não estão na lista. Os sem OM vêm à parte.
 */
export function inheritedDenyUnits(listed: readonly number[], graph: readonly UnitSupportEdge[]): number[] {
	const supporterOf = new Map(graph.map((edge) => [edge.id, edge.supporting_unit_id]))
	const inList = new Set(listed)
	const out = new Set<number>()
	for (const unitId of listed) {
		const seen = new Set<number>([unitId])
		let current = supporterOf.get(unitId) ?? null
		while (current !== null && !seen.has(current)) {
			seen.add(current)
			if (!inList.has(current)) out.add(current)
			current = supporterOf.get(current) ?? null
		}
	}
	return [...out].sort((a, b) => a - b)
}

// ─── Parâmetros da URL ─────────────────────────────────────────────────────────

/**
 * Texto da URL. O router infere tipo: `?q=5` chega NÚMERO. `z.string()` cru derrubaria a rota
 * só ao abrir o link; `z.coerce.string()` transformaria ausência em "undefined".
 */
const urlText = z.preprocess((value) => (value == null || value === "" ? undefined : String(value)), z.string().trim().max(120).optional())

/** Valor da URL que não serve cai no padrão, em vez de derrubar a rota. */
function lenient<T extends z.ZodType>(schema: T) {
	return schema.optional().catch(undefined)
}

/**
 * Os filtros da lista na URL (`validateSearch`). Tudo opcional e tolerante: um link velho ou
 * editado à mão abre a lista no padrão, nunca na tela de erro.
 */
export const PeopleSearchSchema = z.object({
	q: urlText.catch(undefined),
	role: lenient(z.enum(ALPHA_GRANT_ROLES as [AlphaGrantRole, ...AlphaGrantRole[]])),
	unit: lenient(z.preprocess((value) => (value == null ? value : String(value)), z.union([z.literal("global"), z.string().regex(/^\d{1,12}$/)]))),
	status: lenient(z.enum(PEOPLE_STATUSES)),
	sort: lenient(z.enum(PEOPLE_SORTS)),
	dir: lenient(z.enum(SORT_DIRECTIONS)),
	page: lenient(z.coerce.number().int().min(1).max(100_000)),
	size: lenient(z.coerce.number().refine((value): value is PageSize => (PAGE_SIZES as readonly number[]).includes(value))),
	/** A pessoa com o painel aberto — o link abre direto nela. Não vai para o servidor da lista. */
	person: lenient(z.uuid()),
})
export type PeopleSearch = z.infer<typeof PeopleSearchSchema>

/** O filtro de OM da URL no formato do servidor. */
export function unitFilterOf(unit: string | undefined): UnitFilter | undefined {
	if (unit === undefined) return undefined
	return unit === "global" ? "global" : Number(unit)
}

/** A URL vira o pedido ao servidor, com os padrões aplicados. */
export function peopleQueryOf(search: PeopleSearch): PeopleQuery {
	const sort = search.sort ?? "name"
	return {
		q: search.q || undefined,
		role: search.role,
		unit: unitFilterOf(search.unit),
		status: search.status,
		sort,
		dir: search.dir ?? defaultDirection(sort),
		page: search.page ?? 1,
		size: (search.size as PageSize | undefined) ?? DEFAULT_PAGE_SIZE,
	}
}

/** Entrada da server function da lista: o escopo da página (`null` = todas) e o recorte. */
export const PeopleQuerySchema = z.object({
	scopeUnitId: z.number().int().nonnegative().nullable(),
	q: z.string().trim().max(120).optional(),
	role: z.enum(ALPHA_GRANT_ROLES as [AlphaGrantRole, ...AlphaGrantRole[]]).optional(),
	unit: z.union([z.literal("global"), z.number().int().nonnegative()]).optional(),
	status: z.enum(PEOPLE_STATUSES).optional(),
	sort: z.enum(PEOPLE_SORTS),
	dir: z.enum(SORT_DIRECTIONS),
	page: z.number().int().min(1).max(100_000),
	size: z.union([z.literal(25), z.literal(50), z.literal(100)]),
})
export type PeopleQueryInput = z.infer<typeof PeopleQuerySchema>

// ─── Trilha de auditoria ───────────────────────────────────────────────────────

export type AuditAction = "grant" | "revoke" | "block" | "unblock"

/** Uma linha da trilha do painel da pessoa — só leitura, sem link para lugar nenhum. */
export type AuditEntry = {
	id: string
	at: string
	action: AuditAction
	module: AlphaAdminModule | null
	unitId: number | null
	unitCode: string | null
	/** Lado tocado: `allow` (acesso) ou `deny` (bloqueio). */
	partition: GrantEffect | "all" | null
	/** Prazo gravado na concessão; `null` sem prazo (ou fora da concessão). */
	expiresAt: string | null
	actorId: string
	/** Nome (posto + nome de guerra) ou e-mail de quem fez. */
	actorLabel: string
}

/** A ação de uma operação do log (`contrate.permission.grant` → `grant`); `null` fora das quatro. */
export function auditActionOf(operation: string): AuditAction | null {
	if (!operation.startsWith("contrate.permission.")) return null
	const action = operation.slice("contrate.permission.".length)
	return action === "grant" || action === "revoke" || action === "block" || action === "unblock" ? action : null
}

/**
 * O administrador pode ver esta linha do log? O global vê tudo. O escopado vê o que foi feito
 * nas OMs que administra e os bloqueios no copiloto (sem OM: eles alcançam as OMs dele, e ele
 * já os vê na lista como herdados) — e não a concessão GLOBAL de alguém, que está fora da
 * administração dele, como está fora da lista.
 */
export function isAuditVisible(entry: { operation: string; unitId: number | null }, coverage: UnitCoverage): boolean {
	const action = auditActionOf(entry.operation)
	if (action === null) return false
	if (coverage === "all") return true
	if (entry.unitId === null) return action === "block" || action === "unblock"
	return coverage.includes(entry.unitId)
}

/** `unit_id` do alvo do log: número no jsonb, texto quando lido por `->>`. */
export function toUnitIdOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null
	const number = Number(value)
	return Number.isInteger(number) ? number : null
}

const AUDIT_MODULES = new Set<string>(ALPHA_ADMIN_MODULES)
const PARTITIONS = new Set(["allow", "deny", "all"])

/** Linha crua do log → entrada da trilha. `null` quando não é uma operação de acesso do contrate. */
export function toAuditEntry(
	row: { id: string; created_at: string; operation: string; actor_id: string; target: Record<string, unknown> | null },
	labels: { actor: (id: string) => string; unitCode: (id: number) => string | null }
): AuditEntry | null {
	const action = auditActionOf(row.operation)
	if (action === null) return null
	const target = row.target ?? {}
	const module = typeof target.module === "string" && AUDIT_MODULES.has(target.module) ? (target.module as AlphaAdminModule) : null
	const unitId = toUnitIdOrNull(target.unit_id)
	const partition = typeof target.partition === "string" && PARTITIONS.has(target.partition) ? (target.partition as AuditEntry["partition"]) : null
	return {
		id: row.id,
		at: row.created_at,
		action,
		module,
		unitId,
		unitCode: unitId === null ? null : labels.unitCode(unitId),
		partition,
		expiresAt: typeof target.expires_at === "string" ? target.expires_at : null,
		actorId: row.actor_id,
		actorLabel: labels.actor(row.actor_id),
	}
}
