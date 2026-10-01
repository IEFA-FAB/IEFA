/**
 * Shared utilities for module chat tools.
 * Provides ToolContext, permission helpers, and TanStack AI tool wrapping.
 */

import type { Database } from "@iefa/database"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { AssuranceRequiredError, hasPermission, PermissionDeniedError as PbacPermissionDeniedError } from "@iefa/pbac"
import { DomainError, QueryFailedError, type UserContext } from "@iefa/sisub-domain"
import { dropUnexpectedNulls, enforcePayloadBudget } from "@iefa/sisub-domain/agent"
import { describeDriverError } from "@iefa/sisub-domain/utils"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AnyServerTool } from "@tanstack/ai"
import { toolDefinition } from "@tanstack/ai"
import { ZodError } from "zod"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

// ── Tool context (passed to every tool handler) ─────────────────────────────

export interface ToolContext {
	userId: string
	permissions: UserPermission[]
	module: string
	scopeId?: number
	// Schema default kitchen; tools que leem core/procurement usam `.schema()`.
	supabase: SupabaseClient<Database, "kitchen">
	/**
	 * Cliente Drizzle das operations do domínio. Toda tool que lê algo já modelado em
	 * `@iefa/sisub-domain` deve passar por aqui em vez de montar PostgREST na mão: a
	 * query crua duplica nome de tabela e de coluna sem nada checar, e foi assim que
	 * `list_ingredients` acabou ordenando por uma coluna `name` que não existe.
	 */
	db: SisubDb
}

/** Traduz o contexto da tool para o `UserContext` que os guards do domínio esperam. */
export function domainCtx(ctx: ToolContext): UserContext {
	return {
		userId: ctx.userId,
		permissions: ctx.permissions,
		// Garantia no piso, sempre. O `ToolContext` nasce do turno de chat e não carrega o
		// token da sessão; um modelo decidindo chamar uma ferramenta não é uma pessoa
		// digitando 6 dígitos, e herdar a elevação da sessão faria a conversa executar em
		// nome dela. Nenhuma tool de chat é operação classificada — se um dia for, ela tem
		// que ser barrada aqui, e é este piso que a barra.
		aal: 1,
		lastFactorAt: null,
		origin: "session",
	}
}

// ── Tool definition (OpenAI function-calling format) ────────────────────────

/**
 * Validação do argumento, só dele (sem banco, sem permissão): devolve os argumentos como o
 * handler os usa ou lança `ToolValidationError`/`ZodError` (que `parseToolArgs` converte em
 * `ToolValidationError`). Recebe o argumento já sem os `null` de ausência.
 */
type ParseToolArgs<TArgs> = (raw: Record<string, unknown>) => TArgs

interface ModuleToolBase<TArgs extends Record<string, unknown>> {
	name: string
	description: string
	parameters: Record<string, unknown> // JSON Schema
	// Assinatura de método de propósito: o parâmetro fica bivariante e a tool de escrita, com o
	// handler tipado pelos argumentos já validados, ainda cabe em `ModuleToolDefinition[]`.
	handler(args: TArgs, ctx: ToolContext): Promise<ToolHandlerResult>
}

/** Tool de leitura: sem `parseArgs`, o handler valida o que usa. */
interface ReadToolDefinition<TArgs extends Record<string, unknown>> extends ModuleToolBase<TArgs> {
	requiredLevel: 1
	parseArgs?: ParseToolArgs<TArgs>
}

/**
 * Tool de escrita (`requiresApproval`): `parseArgs` é obrigatório. O cartão de aprovação descreve
 * a ação com o resultado desta mesma função (`parseApprovalToolArgs` do registro), então o que o
 * usuário confirma é o que o handler recebe. `describe-action.test.ts` confere; o `wrapTool`
 * recusa montar a tool sem ele (o tipo pode ser contornado por cast).
 */
interface WriteToolDefinition<TArgs extends Record<string, unknown>> extends ModuleToolBase<TArgs> {
	requiredLevel: 2 | 3
	parseArgs: ParseToolArgs<TArgs>
}

export type ModuleToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> = ReadToolDefinition<TArgs> | WriteToolDefinition<TArgs>

export interface ToolHandlerResult {
	success: boolean
	data?: unknown
	error?: string
}

// ── Permission helpers ──────────────────────────────────────────────────────

export function requireModulePermission(ctx: ToolContext, module: AppModule, minLevel: number, scope?: PermissionScope): void {
	if (!hasPermission(ctx.permissions, module, minLevel, scope)) {
		throw new ToolPermissionError(`Permissão insuficiente: requer ${module} nível ${minLevel}`)
	}
}

export function requireKitchenPermission(ctx: ToolContext, minLevel: number, scope?: PermissionScope): void {
	requireModulePermission(ctx, "kitchen", minLevel, scope)
}

export function requireGlobalPermission(ctx: ToolContext, minLevel: number): void {
	requireModulePermission(ctx, "global", minLevel)
}

export function requireUnitPermission(ctx: ToolContext, minLevel: number, scope?: PermissionScope): void {
	requireModulePermission(ctx, "unit", minLevel, scope)
}

/**
 * Maior nível do usuário num módulo (+ escopo opcional) — decide QUAIS tools o modelo recebe.
 *
 * O conjunto efetivo de permissões (`resolveUserPermissions`) traz os denies junto (`level 0`),
 * e aqui eles valem como em `hasPermission`: deny sem escopo zera o módulo; deny escopado zera
 * a consulta daquele escopo, mesmo contra um allow sem escopo. Sem isso, o allow global de
 * quem teve a cozinha 7 negada ainda entregava ao modelo as tools de escrita nela.
 */
export function getMaxLevel(permissions: UserPermission[], module: AppModule, scopeId?: number): number {
	const scopeType = module === "kitchen" ? "kitchen" : module === "unit" ? "unit" : undefined
	const isUnscoped = (p: UserPermission) => p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null
	const matchesScope = (p: UserPermission) =>
		scopeType != null && scopeId != null && (scopeType === "kitchen" ? p.kitchen_id === scopeId : p.unit_id === scopeId)

	const ofModule = permissions.filter((p) => p.module === module)
	for (const deny of ofModule) {
		if (deny.level > 0) continue
		if (isUnscoped(deny) || matchesScope(deny)) return 0
	}

	let maxLevel = 0
	for (const p of ofModule) {
		if (p.level <= 0) continue

		if (isUnscoped(p) || !scopeType || scopeId == null || matchesScope(p)) {
			maxLevel = Math.max(maxLevel, p.level)
		}
	}

	return maxLevel
}

// ── Escopo da rota ──────────────────────────────────────────────────────────

/** Que tipo de entidade o `scopeId` da conversa identifica, pelo módulo. */
function routeScopeKind(module: string): "kitchen" | "unit" | undefined {
	if (module === "kitchen") return "kitchen"
	if (module === "unit" || module === "local-analytics") return "unit"
	return undefined
}

/**
 * Escopo da rota no formato do PBAC, para a conferência de leitura no módulo da conversa. Fonte
 * única da regra: a rota do stream e a descrição do cartão de aprovação (`describeChatActionFn`)
 * usam esta função, e o `assertRouteScope` usa a mesma `routeScopeKind`.
 */
export function resolveRouteScope(module: string, scopeId: number | undefined): PermissionScope | undefined {
	const kind = routeScopeKind(module)
	return kind && scopeId != null ? { type: kind, id: scopeId } : undefined
}

/**
 * Prende a tool à cozinha ou unidade da rota. Recebe o id **resolvido** da linha afetada (a
 * cozinha do cardápio, a OM dona do anexo), não o argumento do modelo: `remove_menu_item` só
 * recebe `itemId`, e conferir o argumento deixaria passar o item de outra cozinha.
 *
 * O PBAC sozinho não basta: quem tem acesso às cozinhas A e B, conversando na rota de A, não
 * deve ver o modelo escrever em B porque um texto gravado (modo de preparo, nota) mandou. O
 * escopo da rota é o que a pessoa vê na tela; fora dele, nada é lido nem gravado.
 *
 * Sem `scopeId` (conversa fora de uma cozinha/unidade) vale só o PBAC, como antes. O erro é
 * `ToolPermissionError`, que `toModelFacingToolError` devolve ao modelo como está.
 */
export function assertRouteScope(ctx: ToolContext, kind: "kitchen" | "unit", resolvedId: number): void {
	if (ctx.scopeId == null || routeScopeKind(ctx.module) !== kind) return
	if (resolvedId === ctx.scopeId) return
	const entity = kind === "kitchen" ? "cozinha" : "unidade"
	throw new ToolPermissionError(
		`Fora do escopo desta conversa: o pedido envolve outra ${entity}. Esta conversa só lê e altera dados da ${entity} da rota; para outra ${entity}, o usuário precisa abrir o chat dela.`
	)
}

// ── Validation helpers ──────────────────────────────────────────────────────

// As mensagens citam o NOME do campo, nunca o valor recebido: o valor é texto do modelo (que pode
// vir de um modo de preparo gravado por outra pessoa) e a mensagem volta ao modelo.

/**
 * Teto de texto livre que o cartão de aprovação exibe inteiro (`describe-action.ts` trunca acima
 * dele) e, por isso, do nome de receita que as tools aceitam (`requireName`): nome válido nunca
 * aparece cortado no cartão. O `CreateRecipeSchema` do domínio não limita o nome.
 */
export const MAX_VALUE_CHARS = 200

export function safeInt(value: unknown, name: string): number {
	const num = Number(value)
	if (!Number.isFinite(num) || !Number.isInteger(num)) {
		throw new ToolValidationError(`${name} deve ser um número inteiro válido`)
	}
	return num
}

/** Data de calendário que existe: formato YYYY-MM-DD e ida e volta pelo `Date` sem mudar o dia. */
function isCalendarDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
	const date = new Date(`${value}T00:00:00Z`)
	// `2026-02-30` vira 2 de março no `Date` em vez de falhar; só a volta igual prova que o dia existe.
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** `{ startDate: args.startDate }`: a chave é o nome do campo citado na recusa. */
export function requireValidDates(fields: Record<string, unknown>): void {
	for (const [name, d] of Object.entries(fields)) {
		if (!isCalendarDate(d)) throw new ToolValidationError(`${name} deve ser uma data válida no formato YYYY-MM-DD`)
	}
}

export function requireUuid(value: unknown, name: string): string {
	if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
		throw new ToolValidationError(`${name} deve ser um UUID válido`)
	}
	return value
}

// ── Error classes ───────────────────────────────────────────────────────────

export class ToolPermissionError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ToolPermissionError"
	}
}

export class ToolValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "ToolValidationError"
	}
}

// ── Result helpers ──────────────────────────────────────────────────────────

export function toolOk(data: unknown): ToolHandlerResult {
	return { success: true, data }
}

export function toolErr(error: string): ToolHandlerResult {
	return { success: false, error }
}

/**
 * Sanitize DB errors to avoid exposing internal details to the LLM.
 */
export function sanitizeDbError(error: { message?: string; code?: string } | Error, context: string): string {
	const msg = error instanceof Error ? error.message : (error.message ?? "Erro desconhecido")
	// biome-ignore lint/suspicious/noConsole: server-side error logging
	console.error(`[module-chat:${context}]`, msg)
	return `Erro ao executar ${context}. Tente novamente.`
}

/**
 * Schemas do banco que as tools alcançam. O banco foi dividido por domínio: a cozinha
 * (cardápios, receitas, insumos) mora em `kitchen`, mas unidade e cozinha-entidade moram
 * em `core`, anexos quantitativos e ARPs em `procurement` e empenhos em `finance`.
 */
export type ToolTableSchema = "kitchen" | "core" | "procurement" | "finance"

/**
 * `.from()` sem tipo, para tabelas fora dos tipos gerados (ou com nome de coluna divergente).
 *
 * **O schema é obrigatório na cabeça de quem chama.** O client do chat nasce com
 * `db: { schema: "kitchen" }`, então `untypedFrom(ctx, "procurement_list")` pedia
 * `kitchen.quantity_estimate` — tabela que não existe. O PostgREST devolvia PGRST205 e o
 * módulo `unit` inteiro (menos `get_ata_details`, que já usava `.schema()` explícito) e os
 * quatro tools de `local-analytics` respondiam "Erro ao executar…" em toda pergunta. Nada
 * disso o typecheck via: o retorno é `any` de propósito.
 */
// biome-ignore lint/suspicious/noExplicitAny: dynamic table string — no generated type for runtime-resolved table names
export function untypedFrom(ctx: ToolContext, table: string, schema: ToolTableSchema = "kitchen"): any {
	// biome-ignore lint/suspicious/noExplicitAny: dynamic table string — no generated type for runtime-resolved table names
	const client = ctx.supabase as SupabaseClient<any, any>
	return (schema === "kitchen" ? client : client.schema(schema)).from(table)
}

/**
 * O erro que a tool devolve ao MODELO — e o texto do erro de tool volta inteiro no prompt do
 * turno seguinte, de onde o modelo pode repeti-lo ao usuário pelo SSE.
 *
 * Só passa adiante o erro cuja mensagem foi ESCRITA para quem lê: erro de domínio (permissão,
 * não encontrado, regra de negócio), as recusas das próprias tools e a validação de argumento
 * (o modelo precisa dela para corrigir a chamada; o `ZodError` sai pela `toArgsValidationError`).
 * Todo o resto é falha de infraestrutura cuja `message` ninguém revisou: o `DrizzleQueryError`
 * que escapa de um caminho sem `runQuery` (`fetchTemplateMealsSafe` relança o que não é "tabela
 * ausente") põe `Failed query: <SQL> params: <valores>` na mensagem, e um `TypeError` descreve o
 * código. Antes só `QueryFailedError` era traduzido, e esses iam crus até o navegador. O detalhe
 * fica no log.
 */
export function toModelFacingToolError(toolName: string, error: unknown): Error {
	if (error instanceof QueryFailedError) {
		// biome-ignore lint/suspicious/noConsole: server-side error logging
		console.error(`[module-chat:${toolName}]`, error.message)
		return new Error(error.publicMessage)
	}
	if (
		error instanceof DomainError ||
		error instanceof ToolPermissionError ||
		error instanceof ToolValidationError ||
		error instanceof PbacPermissionDeniedError ||
		error instanceof AssuranceRequiredError
	) {
		return error
	}
	// `Schema.parse` dentro do handler (as listagens) recusa com a mesma conversão do `parseArgs`:
	// a `message` crua do `ZodError` é o JSON das issues, com as chaves que o modelo inventou.
	if (error instanceof ZodError) return toArgsValidationError(error)
	// biome-ignore lint/suspicious/noConsole: server-side error logging
	console.error(`[module-chat:${toolName}]`, describeDriverError(error))
	return new Error(`Erro ao executar ${toolName}. Tente novamente.`)
}

/**
 * Tool que grava dado pede aprovação humana antes de executar. O nível de escrita
 * (`requiredLevel >= 2`) é o critério: são as mesmas tools que o PBAC já separa como escrita,
 * e uma tool nova de escrita nasce exigindo aprovação sem ninguém lembrar de marcar.
 *
 * A frase "confirme antes de gravar" no prompt era a única trava, e é justamente o que um
 * texto gravado por outro usuário (modo de preparo, notas da estimativa) contorna no mesmo
 * turno em que é lido. A aprovação não depende do modelo.
 */
export function requiresApproval(def: Pick<ModuleToolDefinition, "requiredLevel">): boolean {
	return def.requiredLevel >= 2
}

const UNRECOGNIZED_FIELD = "campo não reconhecido"
const CROSS_FIELD_RULE = "argumentos (regra entre campos)"
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Caminho da issue como o modelo o escreveria (`headcounts[0].headcount`), ou `null` se algum segmento não é identificador. */
function formatIssuePath(path: readonly PropertyKey[]): string | null {
	let out = ""
	for (const segment of path) {
		if (typeof segment === "number") out += `[${segment}]`
		else if (typeof segment === "string" && FIELD_NAME_RE.test(segment)) out += out ? `.${segment}` : segment
		else return null
	}
	return out
}

/**
 * `ZodError` como recusa legível, uma linha por issue: `campo: motivo`. A `message` do `ZodError`
 * é o JSON das issues; a de cada issue (zod v4 e `refine` do domínio) diz o que se esperava sem
 * repetir o valor recebido, e é ela que o modelo precisa para corrigir a chamada. Exceção:
 * `unrecognized_keys` lista chaves que o MODELO escreveu, e a mensagem do zod as repete — vira
 * "campo não reconhecido", sem o motivo. Segmento de caminho que não tem cara de identificador
 * idem. Caminho vazio é regra entre campos (`refine` no objeto).
 */
function toArgsValidationError(error: ZodError): ToolValidationError {
	const lines = new Set<string>()
	for (const issue of error.issues) {
		const field = formatIssuePath(issue.path)
		if (issue.code === "unrecognized_keys" || field === null) lines.add(UNRECOGNIZED_FIELD)
		else lines.add(`${field || CROSS_FIELD_RULE}: ${issue.message}`)
	}
	return new ToolValidationError(`Argumentos inválidos: ${[...lines].join("; ")}`)
}

/**
 * O argumento do modelo como o handler o recebe. Fonte única: o `wrapTool` roda esta função
 * antes do handler, e o cartão de aprovação (`describe-action.ts`, via `parseApprovalToolArgs`)
 * descreve a ação com o resultado dela — validar de outro jeito ali deixava o usuário confirmar
 * o que a tool recusa, ou ver um valor diferente do que seria gravado. A recusa sai sempre como
 * `ToolValidationError`: o cartão só registra que é inválido, e a mensagem vai ao modelo.
 */
export function parseToolArgs<TArgs extends Record<string, unknown>>(def: ModuleToolDefinition<TArgs>, raw: Record<string, unknown>): TArgs {
	// Modelo manda `null` no lugar de omitir campo opcional. Onde o schema não previu
	// isso, `null` é ausência — sem esta linha `safeInt(null)` viraria `0` calado.
	const input = dropUnexpectedNulls(raw, def.parameters)
	// Sem `parseArgs` (tools de leitura), o handler valida o que usa e recebe o tipo padrão.
	if (!def.parseArgs) return input as TArgs
	try {
		return def.parseArgs(input)
	} catch (error) {
		throw error instanceof ZodError ? toArgsValidationError(error) : error
	}
}

/** Normaliza e valida o argumento e roda o handler — o caminho inteiro de uma chamada da tool. */
export async function runTool<TArgs extends Record<string, unknown>>(
	def: ModuleToolDefinition<TArgs>,
	raw: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolHandlerResult> {
	// Argumento antes de permissão e escopo, de propósito: `parseArgs` não lê banco nem
	// permissão, e o cartão de aprovação valida pela mesma função antes de olhar o escopo. Ação
	// fora do escopo com argumento inválido sai como "argumentos inválidos" nos dois lados — e
	// nada é gravado em nenhum caso; a autorização continua no handler.
	return def.handler(parseToolArgs(def, raw), ctx)
}

/**
 * Wraps a ModuleToolDefinition as a TanStack AI ServerTool.
 * The ToolContext is injected via closure so each request gets its own auth/supabase.
 *
 * Com `needsApproval`, o `chat()` para antes do handler, emite o interrupt
 * `approval_<toolCallId>` e só executa quando o turno seguinte traz o `resume` aprovado.
 */
export function wrapTool(def: ModuleToolDefinition, ctx: ToolContext): AnyServerTool {
	// Falha cedo: tool de escrita sem `parseArgs` deixaria o cartão de aprovação sem o crivo do
	// handler (`parseApprovalToolArgs`). O tipo já exige; isto pega o cast.
	if (requiresApproval(def) && typeof def.parseArgs !== "function") {
		throw new Error(`Tool de escrita ${def.name} sem parseArgs: o cartão de aprovação não teria como validar o argumento`)
	}
	return toolDefinition({
		name: def.name,
		description: def.description,
		// Pass the JSON schema directly — TanStack AI v0.22+ accepts plain JSONSchema
		// biome-ignore lint/suspicious/noExplicitAny: plain JSONSchema accepted at runtime but not yet reflected in SchemaInput types
		inputSchema: def.parameters as any,
		needsApproval: requiresApproval(def),
	}).server(async (args) => {
		// Argumento inválido sai como erro de tool (a mensagem da validação), como erro do handler.
		const result = await runTool(def, args as Record<string, unknown>, ctx).catch((error: unknown) => {
			throw toModelFacingToolError(def.name, error)
		})
		if (!result.success) throw new Error(result.error ?? "Ferramenta falhou")

		// Mesma rede de segurança do servidor MCP: falhar aqui devolve um erro de tool
		// que o modelo lê e corrige (buscar mais estreito, pedir menos itens); deixar
		// passar quebra a run inteira no provider, sem mensagem nenhuma.
		return enforcePayloadBudget(def.name, result.data)
	})
}
