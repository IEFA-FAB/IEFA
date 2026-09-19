/**
 * @module audit-log/describe-entry
 * Tradução de uma linha de `access_control.sensitive_operation_log` para o que a tela
 * `/admin/audit-log` mostra: título em português, app de origem, alvo pessoal e os campos
 * que respondem "o que mudou" (módulo, escopo, nível antes → depois, prazo antes → depois,
 * política, pessoas alcançadas).
 *
 * Puro de propósito — sem React, sem servidor — para ser testado forma por forma
 * (`describe-entry.test.ts`).
 *
 * ## O `target` não tem um formato só
 *
 * As funções auditadas de 20260921130000 gravam um formato padrão (`target_user_id`,
 * `action`, `previous`…). As linhas anteriores a elas — gravadas pelo app, em camelCase
 * (`userId`, `policyId`, `keyPrefix`) — continuam no log para sempre, porque o log é
 * apenas-inserção. E há operações que não são de acesso (empenho, orçamento, MFA) com alvo
 * livre. Regra: forma conhecida vira campos legíveis; o resto vira lista chave/valor
 * compacta. Nenhuma forma derruba a tela — tudo aqui lê `unknown` defensivamente.
 */

import { MODULE_LABELS } from "@/components/features/global/policies/labels"

export type AuditSource = "sisub" | "contrate" | "rumaer" | "sucont" | "forms" | "portal" | "script"

export const AUDIT_SOURCE_LABELS: Record<AuditSource, string> = {
	sisub: "SISUB",
	contrate: "Contrate",
	rumaer: "RUMAER",
	sucont: "SUCONT",
	forms: "Forms",
	portal: "Portal",
	script: "Script",
}

export type AuditField = { label: string; value: string }

export type AuditEntryDescription = {
	source: AuditSource
	/**
	 * Frase curta do que aconteceu ("Concedeu acesso"). `null` quando a operação não é
	 * conhecida aqui — a tela cai para a frase do registro de garantia ou para o nome cru.
	 */
	title: string | null
	/** Pessoa cujo acesso mudou; `null` quando a operação não tem alvo pessoal. */
	targetUserId: string | null
	/** Campos reconhecidos, na ordem de leitura. Vazio quando a forma é desconhecida. */
	fields: AuditField[]
	/** Tudo o que foi gravado, achatado em chave/valor compacto — o "dado bruto" legível. */
	details: AuditField[]
}

type Json = Record<string, unknown>

const PERMISSION_APPS = ["contrate", "rumaer", "sucont"] as const
const KNOWN_PREFIXES: readonly AuditSource[] = ["contrate", "rumaer", "sucont", "forms", "portal", "script"]

// ── Leitura defensiva ────────────────────────────────────────────────────────

function asRecord(value: unknown): Json | null {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null
}

function has(t: Json, key: string): boolean {
	return Object.hasOwn(t, key)
}

/** Primeiro valor presente (não `undefined`) entre as chaves — cobre o camelCase legado. */
function pick(t: Json | null, ...keys: string[]): unknown {
	if (!t) return undefined
	for (const key of keys) if (t[key] !== undefined) return t[key]
	return undefined
}

function asString(value: unknown): string | null {
	if (typeof value === "string" && value.trim() !== "") return value
	if (typeof value === "number" && Number.isFinite(value)) return String(value)
	return null
}

function asNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value)
	return null
}

// ── Formatação ───────────────────────────────────────────────────────────────

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })

/** Prazo legível. `null` é "sem prazo" (grant permanente), não ausência de informação. */
export function formatExpiry(value: unknown): string {
	if (value === null) return "sem prazo"
	const text = asString(value)
	if (!text) return "—"
	const date = new Date(text)
	return Number.isNaN(date.getTime()) ? text : DATE_FORMAT.format(date)
}

/** Nível do PBAC: `<= 0` é bloqueio (deny), o resto é o número. */
export function formatLevel(value: unknown): string {
	const level = asNumber(value)
	if (level === null) return "—"
	return level <= 0 ? "bloqueio" : String(level)
}

export function formatModule(value: unknown): string | null {
	const module = asString(value)
	if (!module) return null
	return (MODULE_LABELS as Record<string, string>)[module] ?? module
}

/**
 * Escopo de uma concessão. `null` quando o objeto não carrega NENHUMA das três chaves (a
 * forma não é de concessão); "Global" quando carrega e todas são nulas.
 */
export function formatScope(t: Json | null): string | null {
	if (!t || !["unit_id", "kitchen_id", "mess_hall_id"].some((key) => has(t, key))) return null
	const unit = asString(t.unit_id)
	if (unit) return `OM ${unit}`
	const kitchen = asString(t.kitchen_id)
	if (kitchen) return `Cozinha ${kitchen}`
	const messHall = asString(t.mess_hall_id)
	if (messHall) return `Refeitório ${messHall}`
	return "Global"
}

/** "antes → depois", ou só o depois quando não há antes ou nada mudou. */
function transition(before: string | null, after: string): string {
	return before === null || before === after ? after : `${before} → ${after}`
}

function shortId(value: unknown): string | null {
	const text = asString(value)
	if (!text) return null
	return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text) ? `${text.slice(0, 8)}…` : text
}

const MAX_INLINE = 80

/** Valor qualquer em texto de uma linha: nada de JSON cru na tela. */
function compactValue(value: unknown, depth = 0): string {
	if (value === null || value === undefined) return "—"
	if (typeof value === "boolean") return value ? "sim" : "não"
	if (typeof value === "string" || typeof value === "number") return truncate(String(value))
	if (Array.isArray(value)) {
		if (value.length === 0) return "nenhum"
		if (depth > 0 || value.some((item) => item !== null && typeof item === "object")) return `${value.length} ${value.length === 1 ? "item" : "itens"}`
		return truncate(value.map((item) => compactValue(item, depth + 1)).join(", "))
	}
	const record = asRecord(value)
	if (!record) return String(value)
	if (depth > 0) return `${Object.keys(record).length} campos`
	return truncate(
		Object.entries(record)
			.map(([key, inner]) => `${key}: ${compactValue(inner, depth + 1)}`)
			.join("; ")
	)
}

function truncate(text: string): string {
	return text.length > MAX_INLINE ? `${text.slice(0, MAX_INLINE - 1)}…` : text
}

/** Todo o alvo gravado, uma linha por chave. */
export function flattenTarget(target: unknown): AuditField[] {
	if (target === null || target === undefined) return []
	const record = asRecord(target)
	if (!record) return [{ label: "alvo", value: compactValue(target) }]
	return Object.entries(record).map(([key, value]) => ({ label: key, value: compactValue(value) }))
}

// ── Origem e alvo ────────────────────────────────────────────────────────────

export function sourceOf(operation: string): AuditSource {
	const prefix = operation.split(".", 1)[0] as AuditSource
	return operation.includes(".") && KNOWN_PREFIXES.includes(prefix) ? prefix : "sisub"
}

function targetUserOf(t: Json | null): string | null {
	return asString(pick(t, "target_user_id", "userId", "targetUserId"))
}

// ── Construção dos campos ────────────────────────────────────────────────────

class Fields {
	readonly list: AuditField[] = []

	add(label: string, value: string | null | undefined): this {
		if (value !== null && value !== undefined && value !== "") this.list.push({ label, value })
		return this
	}
}

function membersCount(t: Json): string | null {
	const count = asNumber(t.affected_member_count)
	if (count !== null) return String(count)
	return Array.isArray(t.affected_user_ids) ? String(t.affected_user_ids.length) : null
}

function policyName(t: Json): string | null {
	return asString(pick(t, "policy_name", "name")) ?? shortId(pick(t, "policy_id", "policyId"))
}

/** Grant inline por linha (console do sisub): create/update/delete de `user_permissions`. */
function describeInlinePermission(operation: string, t: Json): { title: string; fields: AuditField[] } {
	const previous = asRecord(t.previous)
	const isDeny = (row: Json | null) => row?.partition === "deny" || (asNumber(row?.level) ?? 1) <= 0
	const f = new Fields()

	let title: string
	if (operation === "createUserPermissionFn") title = isDeny(t) ? "Aplicou bloqueio" : "Concedeu acesso"
	else if (operation === "updateUserPermissionFn") title = "Alterou acesso"
	else title = t.partition === "deny" || isDeny(previous) ? "Removeu bloqueio" : "Revogou acesso"

	f.add("Módulo", formatModule(pick(t, "module") ?? previous?.module))

	const scopeAfter = formatScope(t)
	const scopeBefore = formatScope(previous)
	f.add("Escopo", scopeAfter ? transition(scopeBefore, scopeAfter) : scopeBefore)

	const revoked = operation === "deleteUserPermissionFn"
	if (revoked) {
		// A revogação padrão grava `level: null` e o removido em `previous`; a legada gravava
		// o nível removido direto em `level`.
		const removedLevel = previous ? previous.level : t.level
		f.add("Nível", `${formatLevel(removedLevel)} → removido`)
		if (previous && has(previous, "expires_at")) f.add("Prazo", formatExpiry(previous.expires_at))
	} else {
		if (has(t, "level")) f.add("Nível", transition(previous ? formatLevel(previous.level) : null, formatLevel(t.level)))
		// Update legado sem `expires_at` = o chamador não mexeu no prazo: não inventar "sem prazo".
		if (has(t, "expires_at") && t.expires_at !== undefined) {
			f.add("Prazo", transition(previous && has(previous, "expires_at") ? formatExpiry(previous.expires_at) : null, formatExpiry(t.expires_at)))
		}
	}
	return { title, fields: f.list }
}

/** Grant por CHAVE dos outros apps (`<app>.permission.grant|revoke|block|unblock`, `change_module_permission`/`set_module_block`). */
function describeKeyPermission(action: string, t: Json): { title: string | null; fields: AuditField[] } {
	const f = new Fields()
	const hadBefore = t.previous_level !== null && t.previous_level !== undefined
	let title: string | null = null

	f.add("Módulo", formatModule(t.module))
	f.add("Escopo", formatScope(t))

	if (action === "grant") {
		const deny = t.partition === "deny" || (asNumber(t.level) ?? 1) <= 0
		title = hadBefore ? "Alterou acesso" : deny ? "Aplicou bloqueio" : "Concedeu acesso"
		f.add("Nível", transition(hadBefore ? formatLevel(t.previous_level) : null, formatLevel(t.level)))
		if (has(t, "expires_at")) f.add("Prazo", transition(hadBefore ? formatExpiry(t.previous_expires_at ?? null) : null, formatExpiry(t.expires_at)))
		// O bloqueio prevalece sobre a concessão: conceder por cima dele não dá acesso nenhum.
		if (t.deny_present === true && !deny) f.add("Atenção", "há bloqueio ativo nesta chave — ele prevalece")
	} else if (action === "revoke") {
		title = t.partition === "deny" ? "Removeu bloqueio" : "Revogou acesso"
		f.add("Nível", `${formatLevel(t.previous_level)} → removido`)
		if (Array.isArray(t.removed) && t.removed.length > 1) f.add("Concessões removidas", String(t.removed.length))
	} else if (action === "block") {
		// `set_module_block` (20260921090100): deny sem escopo e sem prazo, um log por módulo.
		title = "Bloqueou no módulo"
		// Bloqueio que já existia com prazo virou permanente — é isso que a linha registra.
		if (t.previous_expires_at !== null && t.previous_expires_at !== undefined)
			f.add("Prazo", transition(formatExpiry(t.previous_expires_at), formatExpiry(null)))
	} else if (action === "unblock") {
		title = "Desbloqueou no módulo"
		if (Array.isArray(t.removed) && t.removed.length > 1) f.add("Bloqueios removidos", String(t.removed.length))
	}
	return { title, fields: f.list }
}

const POLICY_TITLES: Record<string, string> = {
	createPolicyFn: "Criou política",
	updatePolicyFn: "Alterou política",
	deletePolicyFn: "Removeu política",
	restorePolicy: "Restaurou política",
	restorePolicyFn: "Restaurou política",
}

function describePolicy(operation: string, t: Json): AuditField[] {
	const f = new Fields()
	const previous = asRecord(t.previous)
	const name = policyName(t)
	f.add("Política", name ? transition(asString(previous?.policy_name), name) : null)
	if (previous && has(previous, "description") && previous.description !== t.description) f.add("Descrição", "alterada")
	if (Array.isArray(t.statements)) f.add("Regras", String(t.statements.length))
	if (operation !== "createPolicyFn" && operation !== "updatePolicyFn") f.add("Pessoas alcançadas", membersCount(t))
	return f.list
}

const STATEMENT_TITLES: Record<string, string> = {
	addPolicyStatementFn: "Adicionou regra à política",
	updatePolicyStatementFn: "Alterou regra da política",
	removePolicyStatementFn: "Removeu regra da política",
}

function describeStatement(operation: string, t: Json): AuditField[] {
	const f = new Fields()
	const statement = asRecord(t.statement)
	const previous = asRecord(t.previous)
	f.add("Política", policyName(t))
	// Legado: `module`/`level` direto no alvo, sem `statement`.
	const after = statement ?? (has(t, "module") ? t : null)
	f.add("Módulo", formatModule(after?.module ?? previous?.module))

	const scopeAfter = formatScope(statement)
	const scopeBefore = formatScope(previous)
	f.add("Escopo", scopeAfter ? transition(scopeBefore, scopeAfter) : scopeBefore)

	if (operation === "removePolicyStatementFn") {
		if (previous) f.add("Nível", `${formatLevel(previous.level)} → removido`)
	} else if (after && has(after, "level")) {
		f.add("Nível", transition(previous ? formatLevel(previous.level) : null, formatLevel(after.level)))
	}
	f.add("Pessoas alcançadas", membersCount(t))
	return f.list
}

function isAttachOperation(operation: string): boolean {
	return operation === "attachPolicyFn" || operation === "script.add-trainees.attach"
}

function describeAttachment(operation: string, t: Json): { title: string; fields: AuditField[] } {
	const f = new Fields()
	const previous = asRecord(t.previous)
	f.add("Política", policyName(t))
	if (operation === "detachPolicyFn") {
		if (previous && has(previous, "expires_at")) f.add("Prazo do anexo", formatExpiry(previous.expires_at))
		return { title: "Desanexou política", fields: f.list }
	}
	const expiryChange = t.change === "expiry"
	if (has(t, "expires_at")) f.add("Prazo", transition(expiryChange && previous ? formatExpiry(previous.expires_at) : null, formatExpiry(t.expires_at)))
	return { title: expiryChange ? "Alterou prazo do anexo" : "Anexou política", fields: f.list }
}

const MCP_TITLES: Record<string, string> = {
	createMcpKeyFn: "Chave MCP criada",
	revokeMcpKeyFn: "Chave MCP revogada",
	deleteMcpKeyFn: "Chave MCP apagada",
}

function describeMcpKey(t: Json): AuditField[] {
	const f = new Fields()
	const label = asString(t.label)
	const prefix = asString(pick(t, "key_prefix", "keyPrefix"))
	f.add("Chave", label && prefix ? `${label} (${prefix}…)` : (label ?? (prefix ? `${prefix}…` : null)))
	const previous = asRecord(t.previous)
	// `null` é "sem prazo" e tem de sobreviver: nada de `??` aqui.
	const own = pick(t, "expires_at", "expiresAt")
	const expires = own !== undefined ? own : previous?.expires_at
	if (expires !== undefined) f.add("Prazo", formatExpiry(expires))
	return f.list
}

const FORMS_TITLES: Record<string, string> = {
	"forms.viewer.grant": "Visualizador de respostas concedido",
	"forms.viewer.change": "Recorte do visualizador alterado",
	"forms.viewer.revoke": "Visualizador de respostas revogado",
	"forms.editor.grant": "Editor de questionário concedido",
	"forms.editor.revoke": "Editor de questionário revogado",
}

const SCOPE_MODE_LABELS: Record<string, string> = { global: "todas as respostas", scoped: "com recorte" }
const BINDING_ATTRIBUTE_LABELS: Record<string, string> = { om: "OM" }

function formatScopeMode(value: unknown): string | null {
	const mode = asString(value)
	return mode ? (SCOPE_MODE_LABELS[mode] ?? mode) : null
}

/** Regras de recorte do visualizador: "OM 12, exceto OM 7". */
export function formatBindings(value: unknown): string | null {
	if (!Array.isArray(value)) return null
	if (value.length === 0) return "nenhuma"
	return value
		.map((raw) => {
			const binding = asRecord(raw)
			if (!binding) return compactValue(raw)
			const attribute = asString(binding.attribute_key) ?? "?"
			const text = `${BINDING_ATTRIBUTE_LABELS[attribute] ?? attribute} ${asString(binding.value) ?? "?"}`
			return binding.effect === "deny" ? `exceto ${text}` : text
		})
		.join(", ")
}

function describeForms(operation: string, t: Json): AuditField[] {
	const f = new Fields()
	const previous = asRecord(t.previous)
	f.add("Questionário", shortId(t.questionnaire_id))
	if (operation.startsWith("forms.viewer.")) {
		const modeAfter = formatScopeMode(t.scope_mode)
		const modeBefore = formatScopeMode(previous?.scope_mode)
		f.add("Respostas visíveis", modeAfter ? transition(modeBefore, modeAfter) : modeBefore)
		const bindingsAfter = formatBindings(t.bindings)
		const bindingsBefore = formatBindings(previous?.bindings)
		f.add("Recorte", bindingsAfter ? transition(bindingsBefore, bindingsAfter) : bindingsBefore)
	}
	return f.list
}

/** Os três papéis que `journal.change_user_role` aceita. */
const JOURNAL_ROLE_LABELS: Record<string, string> = { author: "autor", reviewer: "revisor", editor: "editor" }

function formatJournalRole(value: unknown): string {
	const role = asString(value)
	return role ? (JOURNAL_ROLE_LABELS[role] ?? role) : "nenhum"
}

// ── Entrada ──────────────────────────────────────────────────────────────────

/**
 * Descreve uma linha do registro. Nunca lança: forma desconhecida devolve `title: null`,
 * `fields: []` e o alvo inteiro em `details`.
 */
export function describeAuditEntry(operation: string, target: unknown): AuditEntryDescription {
	const t = asRecord(target)
	const base = { source: sourceOf(operation), targetUserId: targetUserOf(t), details: flattenTarget(target) }
	const known = (title: string | null, fields: AuditField[]): AuditEntryDescription => ({ ...base, title, fields })

	try {
		if (!t) return known(staticTitle(operation), [])

		if (operation === "createUserPermissionFn" || operation === "updateUserPermissionFn" || operation === "deleteUserPermissionFn") {
			const { title, fields } = describeInlinePermission(operation, t)
			return known(title, fields)
		}

		const keyPermission = /^([a-z0-9-]+)\.permission\.([a-z-]+)$/.exec(operation)
		if (keyPermission && (PERMISSION_APPS as readonly string[]).includes(keyPermission[1])) {
			const { title, fields } = describeKeyPermission(keyPermission[2], t)
			return known(title, fields)
		}

		if (POLICY_TITLES[operation]) return known(POLICY_TITLES[operation], describePolicy(operation, t))
		if (STATEMENT_TITLES[operation]) return known(STATEMENT_TITLES[operation], describeStatement(operation, t))

		if (isAttachOperation(operation) || operation === "detachPolicyFn") {
			const { title, fields } = describeAttachment(operation, t)
			return known(title, fields)
		}

		if (MCP_TITLES[operation]) return known(MCP_TITLES[operation], describeMcpKey(t))
		if (FORMS_TITLES[operation]) return known(FORMS_TITLES[operation], describeForms(operation, t))

		if (operation === "portal.journal-role.change") {
			const previous = asRecord(t.previous)
			const role = formatJournalRole(t.role)
			return known("Papel no journal alterado", [{ label: "Papel", value: previous ? transition(formatJournalRole(previous.role), role) : role }])
		}
	} catch {
		// Defesa em profundidade: a leitura acima já é tolerante, mas uma linha estranha não
		// pode apagar a tela inteira. Cai para a lista chave/valor.
	}
	return known(staticTitle(operation), [])
}

/**
 * Rótulo da operação independente do alvo — as opções do filtro "Operação". `null` quando
 * a operação não é de acesso conhecida (a tela usa a frase do registro de garantia).
 */
export function staticTitle(operation: string): string | null {
	if (operation === "createUserPermissionFn") return "Concedeu acesso"
	if (operation === "updateUserPermissionFn") return "Alterou acesso"
	if (operation === "deleteUserPermissionFn") return "Revogou acesso"
	const keyPermission = /^([a-z0-9-]+)\.permission\.([a-z-]+)$/.exec(operation)
	if (keyPermission && (PERMISSION_APPS as readonly string[]).includes(keyPermission[1])) {
		if (keyPermission[2] === "grant") return "Concedeu ou alterou acesso"
		if (keyPermission[2] === "revoke") return "Revogou acesso"
		if (keyPermission[2] === "block") return "Bloqueou no módulo"
		if (keyPermission[2] === "unblock") return "Desbloqueou no módulo"
		return null
	}
	if (isAttachOperation(operation)) return "Anexou política ou alterou prazo do anexo"
	if (operation === "detachPolicyFn") return "Desanexou política"
	if (operation === "portal.journal-role.change") return "Papel no journal alterado"
	return POLICY_TITLES[operation] ?? STATEMENT_TITLES[operation] ?? MCP_TITLES[operation] ?? FORMS_TITLES[operation] ?? null
}
