/**
 * Regras PURAS da tela de acessos do α — o que se concede, em que OM, e como a alteração
 * chega ao banco. As server functions (`server/access.fn.ts`) só leem, autorizam e chamam;
 * a decisão fica aqui para ser testável sem servidor.
 */

import type { UnitOption } from "@iefa/alpha-client/access"
import {
	assertGrantable,
	type ChangeModulePermissionInput,
	coversUnit,
	GrantNotAllowedError,
	isEmptyCoverage,
	needsSupportGraph,
	resolveEffectivePermissions,
	resolveModuleUnitCoverage,
	type SetModuleBlockInput,
	touchesDenyPartition,
	type UnitCoverage,
	type UnitSupportEdge,
	type UserPermission,
} from "@iefa/pbac"
import { z } from "zod"

/** Os papéis do α e o grant de cada um: módulo PBAC e o ÚNICO nível que ele usa. */
export const ALPHA_ROLE_GRANTS = {
	requester: { module: "alpha-requester", level: 1 },
	procurement: { module: "alpha-procurement", level: 1 },
	aci: { module: "alpha-aci", level: 1 },
	admin: { module: "alpha-admin", level: 3 },
} as const

export type AlphaGrantRole = keyof typeof ALPHA_ROLE_GRANTS
export const ALPHA_GRANT_ROLES = Object.keys(ALPHA_ROLE_GRANTS) as AlphaGrantRole[]

/**
 * Como a tela nomeia e explica cada papel. Não são aninhados: cada um é um grant próprio, por
 * OM — a mesma pessoa pode ser Licitações no GAP-SJ e Requisitante no IEFA-SJ, ou os quatro
 * na mesma OM.
 */
export const ROLE_INFO: Record<AlphaGrantRole, { label: string; hint: string }> = {
	requester: { label: "Requisitante", hint: "Vê todas as submissões da OM. Enviar documento não exige papel." },
	procurement: { label: "Licitações", hint: "Vê a fila e os processos da OM." },
	aci: { label: "ACI", hint: "Tria achados e emite parecer nos processos da OM; no global, também cura regras e fontes." },
	admin: { label: "Administração de acessos", hint: "Concede e revoga papéis na OM e nas que ela apoia." },
}

/** Rótulo curto, para as fichas da lista. */
export const ROLE_SHORT_LABEL: Record<AlphaGrantRole, string> = {
	requester: "Requisitante",
	procurement: "Licitações",
	aci: "ACI",
	admin: "Admin",
}

/**
 * Os módulos que esta tela administra. O módulo pedido é validado contra esta lista — sem
 * isso, um administrador do α concederia `global` do sisub pela mesma chamada. O `alpha`
 * antigo (nível único) saiu do `AppModule` (20260921090000).
 */
export const ALPHA_ADMIN_MODULES = ["alpha-requester", "alpha-procurement", "alpha-aci", "alpha-admin"] as const
export type AlphaAdminModule = (typeof ALPHA_ADMIN_MODULES)[number]

export function roleOfModule(module: AlphaAdminModule): AlphaGrantRole {
	const role = ALPHA_GRANT_ROLES.find((candidate) => ALPHA_ROLE_GRANTS[candidate].module === module)
	if (!role) throw new Error(`módulo fora do α: ${module}`)
	return role
}

/**
 * Entradas das server functions de concessão e revogação. NÃO há campo de ator: quem age é
 * a sessão, resolvida pelo guard (`requireAlphaAdmin`). Um `actorId` que o cliente mandasse
 * seria descartado pelo `z.object` (chave desconhecida sai) — e o teste de contrato fixa
 * que nenhum campo desses entre aqui por descuido.
 *
 * `unitId: null` é o grant GLOBAL; o nível não vem do cliente, sai do papel.
 */
export const GrantAlphaRoleSchema = z.object({
	userId: z.uuid(),
	role: z.enum(ALPHA_GRANT_ROLES as [AlphaGrantRole, ...AlphaGrantRole[]]),
	unitId: z.number().int().nonnegative().nullable(),
	/** Instante em que o acesso deixa de valer (ISO 8601); ausente ou `null` = sem prazo. */
	expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
})
export type GrantAlphaRoleInput = z.infer<typeof GrantAlphaRoleSchema>

/** Data civil `AAAA-MM-DD`, como o `<input type="date">` a entrega. */
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Entrada da concessão de VÁRIOS papéis de uma vez: a mesma pessoa, a mesma OM, o mesmo
 * prazo. Como as outras, SEM campo de ator (o teste de contrato fixa). Cada papel vira uma
 * concessão própria, auditada na sua transação ({@link planAlphaRoleGrants}).
 *
 * `expiresOn` é a data civil do ÚLTIMO dia de acesso, no fuso de Brasília; `null` = sem prazo.
 */
export const GrantAlphaRolesSchema = z.object({
	userId: z.uuid(),
	roles: z
		.array(z.enum(ALPHA_GRANT_ROLES as [AlphaGrantRole, ...AlphaGrantRole[]]))
		.min(1, "Escolha ao menos um papel.")
		.max(ALPHA_GRANT_ROLES.length)
		.refine((roles) => new Set(roles).size === roles.length, "Papel repetido."),
	unitId: z.number().int().nonnegative().nullable(),
	expiresOn: z.string().regex(CIVIL_DATE, "Data inválida.").nullable(),
})
export type GrantAlphaRolesInput = z.infer<typeof GrantAlphaRolesSchema>

/** Brasília não tem horário de verão desde 2019: o deslocamento é fixo. */
const BRASILIA_OFFSET = "-03:00"
const BRASILIA_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })

/** A data civil de hoje em Brasília (`AAAA-MM-DD`) — nunca a do UTC, que vira o dia às 21h. */
export function todayInBrasilia(now: number = Date.now()): string {
	return BRASILIA_DATE.format(new Date(now))
}

/**
 * O instante em que um acesso com prazo até `expiresOn` deixa de valer: o fim daquele dia em
 * Brasília. "Até 30/09" vale o dia 30 inteiro para quem está aqui, e não até as 21h (o fim do
 * dia em UTC). `null` = sem prazo.
 *
 * Recusa data inexistente (`2026-02-30`) e data passada: conceder já vencido gravaria um
 * acesso que não vale, auditado como se valesse. Hoje é aceito — vale até o fim do dia.
 */
export function expiryInstantOf(expiresOn: string | null, now: number = Date.now()): string | null {
	if (expiresOn === null) return null
	if (!CIVIL_DATE.test(expiresOn)) throw new GrantInputError("Data de prazo inválida.")
	const [year, month, day] = expiresOn.split("-").map(Number) as [number, number, number]
	const probe = new Date(Date.UTC(year, month - 1, day))
	if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
		throw new GrantInputError("Data de prazo inválida.")
	}
	if (expiresOn < todayInBrasilia(now)) throw new GrantInputError("O prazo não pode ser uma data passada.")
	return `${expiresOn}T23:59:59.999${BRASILIA_OFFSET}`
}

/** Entrada recusada antes de qualquer gravação (prazo inválido). A mensagem vai para a tela. */
export class GrantInputError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "GrantInputError"
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

/**
 * Os dois lados de uma chave: o acesso (`allow`, `level > 0`) e o bloqueio (`deny`,
 * `level <= 0`). Coexistem na mesma chave, e o bloqueio vence.
 */
export const GRANT_EFFECTS = ["allow", "deny"] as const
export type GrantEffect = (typeof GRANT_EFFECTS)[number]

/**
 * `effect` é OBRIGATÓRIO na revogação: revogar o acesso nunca leva junto o bloqueio da
 * mesma chave, e retirar o bloqueio nunca leva o acesso. Não há "a chave inteira" por aqui.
 */
export const RevokeAlphaRoleSchema = z.object({
	userId: z.uuid(),
	module: z.enum(ALPHA_ADMIN_MODULES),
	unitId: z.number().int().nonnegative().nullable(),
	effect: z.enum(GRANT_EFFECTS),
})
export type RevokeAlphaRoleInput = z.infer<typeof RevokeAlphaRoleSchema>

/** Prefixo das operações no log de auditoria: `contrate.permission.grant|revoke`. */
export const AUDIT_APP = "contrate"

/**
 * A alteração a gravar, depois da política de administração escopada (`assertGrantable`):
 * OM dentro da cobertura, global só pelo administrador global; sobre si mesmo, só o
 * global — e ninguém revoga o próprio `alpha-admin` (trancaria o ator para fora da tela).
 * Retirar um bloqueio (deny) é só do global; a concessão não cria bloqueio (o grant é sempre
 * o nível positivo do papel) — bloquear é o "Bloquear no copiloto" ({@link buildAlphaBlockChange}).
 *
 * Nenhum papel exclui outro: a mesma pessoa recebe os quatro, na mesma OM, um por chamada
 * (sem segregação de funções — decisão do mantenedor, 2026-09-19). A alteração sobre si mesmo é auditada como qualquer outra:
 * ator e alvo iguais no log.
 *
 * O ator é `actorId` — o `userId` do guard, passado pela server function. O `data` nunca o
 * fornece, nem se trouxer um campo com esse nome.
 */
export function buildAlphaPermissionChange(
	admin: { actorId: string; coverage: UnitCoverage },
	data: GrantAlphaRoleInput | RevokeAlphaRoleInput
): ChangeModulePermissionInput {
	const change: ChangeModulePermissionInput =
		"role" in data
			? {
					actorId: admin.actorId,
					app: AUDIT_APP,
					action: "grant",
					targetUserId: data.userId,
					module: ALPHA_ROLE_GRANTS[data.role].module,
					level: ALPHA_ROLE_GRANTS[data.role].level,
					unitId: data.unitId,
					// Conceder é acesso vivo: o prazo é o pedido, ou nenhum — reaplicar reativa uma
					// linha vencida e substitui o prazo que ela tinha.
					expiresAt: data.expiresAt ?? null,
				}
			: {
					actorId: admin.actorId,
					app: AUDIT_APP,
					action: "revoke",
					targetUserId: data.userId,
					module: data.module,
					unitId: data.unitId,
					// Só o lado pedido sai: o outro lado da chave fica.
					partition: data.effect,
				}

	assertGrantable(admin, {
		userId: data.userId,
		unitId: data.unitId,
		// Trancar-se para fora é revogar o próprio ACESSO de administração; retirar o próprio
		// bloqueio não tranca ninguém.
		revokesAdministration: change.action === "revoke" && change.module === ALPHA_ROLE_GRANTS.admin.module && change.partition !== "deny",
		touchesDeny: touchesDenyPartition(change),
	})
	return change
}

/**
 * As concessões de {@link GrantAlphaRolesSchema}: uma por papel, na ordem canônica dos papéis,
 * cada uma já conferida por {@link buildAlphaPermissionChange} (a mesma política de
 * administração escopada da concessão avulsa). Tudo é conferido ANTES da primeira gravação:
 * a regra de quem concede não depende do papel, então uma recusa recusa todos, e nenhum
 * papel sai gravado pela metade por causa dela. Prazo inválido também recusa tudo.
 *
 * O que ainda pode falhar depois — o banco, papel a papel — é relatado por papel pela server
 * function; cada concessão é a sua transação auditada.
 */
export function planAlphaRoleGrants(
	admin: { actorId: string; coverage: UnitCoverage },
	data: GrantAlphaRolesInput,
	now: number = Date.now()
): Array<{ role: AlphaGrantRole; change: ChangeModulePermissionInput }> {
	const expiresAt = expiryInstantOf(data.expiresOn, now)
	const wanted = new Set(data.roles)
	return ALPHA_GRANT_ROLES.filter((role) => wanted.has(role)).map((role) => ({
		role,
		change: buildAlphaPermissionChange(admin, { userId: data.userId, role, unitId: data.unitId, expiresAt }),
	}))
}

/** O que aconteceu com cada papel pedido numa concessão múltipla. */
export type RoleGrantOutcome =
	| {
			role: AlphaGrantRole
			status: "granted"
			previousLevel: number | null
			/**
			 * Algum bloqueio da pessoa anula o acesso recém-gravado — `true` também quando um acesso
			 * GLOBAL fica recortado em parte das OMs (`partial`). `null`: a conferência falhou depois
			 * da gravação, e a tela não afirma nem que vale nem que não vale.
			 */
			blocked: boolean | null
			partial: boolean
	  }
	| { role: AlphaGrantRole; status: "failed"; message: string }

export type GrantSummary = { tone: "success" | "warning" | "error"; title: string; description?: string }

function listLabels(roles: readonly AlphaGrantRole[]): string {
	const labels = roles.map((role) => ROLE_INFO[role].label)
	if (labels.length <= 1) return labels.join("")
	return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`
}

/**
 * O aviso depois de uma concessão múltipla. Nunca "concedido" para papel que falhou ou que um
 * bloqueio anula: a falha parcial diz quais entraram e quais não, e o bloqueio diz quais não
 * valem — o administrador decide o próximo passo sabendo o estado real.
 */
export function summarizeGrantOutcomes(outcomes: readonly RoleGrantOutcome[]): GrantSummary {
	const granted = outcomes.filter((outcome) => outcome.status === "granted")
	const failed = outcomes.filter((outcome) => outcome.status === "failed")
	const failures = failed.map((outcome) => `${ROLE_INFO[outcome.role].label}: ${outcome.message}`).join(" ")

	if (granted.length === 0) {
		return { tone: "error", title: failed.length === 1 ? "O papel não foi concedido" : "Nenhum papel foi concedido", description: failures || undefined }
	}
	if (failed.length > 0) {
		return {
			tone: "warning",
			title: `${granted.length} de ${outcomes.length} papéis concedidos`,
			description: `Concedido: ${listLabels(granted.map((outcome) => outcome.role))}. Não concedido: ${failures}`,
		}
	}

	const fullyBlocked = granted.filter((outcome) => outcome.blocked === true && !outcome.partial).map((outcome) => outcome.role)
	const partlyBlocked = granted.filter((outcome) => outcome.blocked === true && outcome.partial).map((outcome) => outcome.role)
	const unchecked = granted.filter((outcome) => outcome.blocked === null).map((outcome) => outcome.role)
	if (fullyBlocked.length > 0 || partlyBlocked.length > 0) {
		const parts = [
			fullyBlocked.length > 0 ? `${listLabels(fullyBlocked)}: um bloqueio da pessoa anula o acesso onde ele foi concedido.` : "",
			partlyBlocked.length > 0 ? `${listLabels(partlyBlocked)}: vale, menos nas OMs bloqueadas.` : "",
			"O bloqueio vence o acesso enquanto existir; só um administrador global o retira.",
		]
		return { tone: "warning", title: "Acesso gravado, mas bloqueado", description: parts.filter(Boolean).join(" ") }
	}
	if (unchecked.length > 0) {
		return {
			tone: "warning",
			title: "Acesso gravado, sem conferência de bloqueio",
			description: `Não foi possível conferir se algum bloqueio anula ${listLabels(unchecked)}. Confira o painel da pessoa.`,
		}
	}
	return {
		tone: "success",
		title:
			granted.length === 1
				? `${ROLE_INFO[granted[0]?.role ?? "requester"].label} concedido`
				: `Papéis concedidos: ${listLabels(granted.map((outcome) => outcome.role))}`,
	}
}

// ─── Bloqueio no copiloto ──────────────────────────────────────────────────────

/**
 * Entrada de "Bloquear no copiloto" / "Desbloquear". Como nas outras, SEM campo de ator: quem
 * age é a sessão (o teste de contrato fixa).
 */
export const SetCopilotBlockSchema = z.object({
	userId: z.uuid(),
	blocked: z.boolean(),
})
export type SetCopilotBlockInput = z.infer<typeof SetCopilotBlockSchema>

/**
 * O bloqueio a gravar: um deny SEM ESCOPO em cada um dos quatro papéis (ou a retirada deles),
 * numa transação — `setModuleBlock` do @iefa/pbac.
 *
 * Só o administrador GLOBAL bloqueia e desbloqueia: é um deny, e deny é só dele
 * (`DENY_REQUIRES_GLOBAL_ADMIN`, a mesma regra de `assertGrantable`). E NUNCA sobre si mesmo —
 * nem o global: bloquear-se derrubaria o próprio `alpha-admin` e o trancaria para fora da tela
 * (e, se fosse o último, todo mundo). A função SQL recusa o bloqueio próprio também; aqui é
 * para a mensagem ser a nossa e o desbloqueio próprio também ficar de fora.
 *
 * Os papéis concedidos NÃO são tocados: bloquear anula todos eles enquanto o bloqueio existir,
 * e desbloquear devolve exatamente o que a pessoa tinha. Bloqueio de UMA OM (deny escopado)
 * também fica — é outra decisão.
 */
export function buildAlphaBlockChange(admin: { actorId: string; coverage: UnitCoverage }, data: SetCopilotBlockInput): SetModuleBlockInput {
	if (admin.actorId === data.userId) throw new GrantNotAllowedError("SELF")
	if (admin.coverage !== "all") throw new GrantNotAllowedError("DENY_REQUIRES_GLOBAL_ADMIN")
	return {
		actorId: admin.actorId,
		app: AUDIT_APP,
		targetUserId: data.userId,
		modules: [...ALPHA_ADMIN_MODULES],
		blocked: data.blocked,
	}
}

/**
 * O estado de "Bloqueado no copiloto" de uma pessoa, lido das linhas da lista de acessos:
 *   - `blocked` — bloqueio SEM OM, vivo e gravado aqui (inline), nos quatro papéis;
 *   - `partial` — em parte deles (bloquear completa; desbloquear retira o que houver);
 *   - `none`    — em nenhum.
 *
 * Só conta a linha inline: bloqueio que vem de política não se retira por aqui (desanexa-se a
 * política), e o botão de desbloquear afirmaria o que não pode cumprir. Vencido é ausência.
 * A lista traz esses bloqueios em qualquer OM aberta: os globais vêm como herdados
 * (`listAlphaPeopleFn`).
 */
export type CopilotBlockState = "blocked" | "partial" | "none"

export function copilotBlockState(grants: readonly GrantRowLike[], userId: string, now: number = Date.now()): CopilotBlockState {
	const blockedModules = new Set(
		grants
			.filter((g) => g.userId === userId && g.source === "inline" && g.effect === "deny" && g.unitId === null && !isExpiredGrant(g, now))
			.map((g) => g.module)
	)
	if (blockedModules.size === 0) return "none"
	return ALPHA_ADMIN_MODULES.every((module) => blockedModules.has(module)) ? "blocked" : "partial"
}

/**
 * As OMs que o seletor de concessão oferece: as da cobertura do administrador, e "Global"
 * só para o administrador global. O servidor reconfere tudo (`assertGrantable`); isto é
 * para a tela não oferecer o que vai ser recusado.
 */
export function adminUnitChoices(coverage: UnitCoverage, units: readonly UnitOption[]): { allowGlobal: boolean; units: UnitOption[] } {
	if (coverage === "all") return { allowGlobal: true, units: [...units] }
	const covered = new Set(coverage)
	return { allowGlobal: false, units: units.filter((unit) => covered.has(unit.id)) }
}

/**
 * O administrador pode mexer neste acesso SEU? Só o global, e nunca revogando o próprio
 * `alpha-admin`. Para a tela desabilitar o botão; o servidor decide de novo.
 */
export function canChangeOwnAccess(isGlobalAdmin: boolean, change: { action: "grant" | "revoke"; module?: AlphaAdminModule }): boolean {
	if (!isGlobalAdmin) return false
	return !(change.action === "revoke" && change.module === ALPHA_ROLE_GRANTS.admin.module)
}

/**
 * A lista pedida está dentro da administração? Uma OM da cobertura, ou `null` ("todas as
 * OMs", inclusive os grants globais) só para o administrador global.
 */
export function canListGrants(coverage: UnitCoverage, unitId: number | null): boolean {
	if (coverage === "all") return true
	return unitId !== null && coverage.includes(unitId)
}

/** O que a lista de acessos precisa de uma linha para decidir chave, lado e bloqueio. */
export interface GrantRowLike {
	source: "inline" | "policy"
	effect: GrantEffect
	userId: string
	module: AlphaAdminModule
	unitId: number | null
	level: number
	policyName?: string
	expiresAt: string | null
}

/**
 * Chave de React de uma linha. OM e nome da política entram porque a mesma pessoa pode ter
 * o mesmo papel em duas OMs, e duas políticas podem emprestar o MESMO papel; o lado
 * (`effect`) entra porque acesso e bloqueio coexistem na MESMA chave do banco — sem ele as
 * duas linhas nasceriam com a mesma chave e uma sumiria da lista.
 */
export function grantRowKey(grant: GrantRowLike): string {
	return `${grant.source}:${grant.effect}:${grant.userId}:${grant.module}:${grant.unitId ?? "global"}:${grant.policyName ?? ""}`
}

/** Vencido é ausência — de acesso ou de bloqueio (`NOT_EXPIRED`). */
export function isExpiredGrant(grant: Pick<GrantRowLike, "expiresAt">, now: number = Date.now()): boolean {
	return grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= now
}

/** Separa acessos de bloqueios: a tela nunca mostra um bloqueio como papel concedido. */
export function splitGrantsByEffect<T extends GrantRowLike>(grants: readonly T[]): { allows: T[]; denies: T[] } {
	return { allows: grants.filter((grant) => grant.effect === "allow"), denies: grants.filter((grant) => grant.effect === "deny") }
}

/**
 * Quanto os bloqueios da pessoa tiram de UM acesso:
 *   - `none`    — o acesso vale onde foi concedido;
 *   - `full`    — não vale em lugar nenhum (a OM dele está bloqueada; no global, todas);
 *   - `partial` — só no acesso GLOBAL: vale, menos nas OMs bloqueadas.
 *
 * Um acesso numa OM é `none` ou `full`: o que se pergunta é se a PRÓPRIA OM segue coberta.
 * Um bloqueio numa OM que ela apoia recorta o alcance dele lá embaixo, mas não o anula.
 */
export type DenyImpact = "none" | "partial" | "full"

/** O acesso cujo efeito se confere: papel (módulo), nível e OM (`null` = global). */
export type AllowUnderCheck = { module: AlphaAdminModule; level: number; unitId: number | null }

function toUserPermission(allow: AllowUnderCheck): UserPermission {
	return { module: allow.module, level: allow.level, unit_id: allow.unitId, kitchen_id: null, mess_hall_id: null }
}

/** Os bloqueios do papel no conjunto — o que pode recortar o acesso. */
function denyEntriesOf(module: AlphaAdminModule, permissions: readonly UserPermission[]): UserPermission[] {
	return permissions.filter((p) => p.module === module && p.level <= 0)
}

/**
 * O cálculo de {@link denyImpactOnAllow} precisa do grafo de apoio? Só quando há bloqueio
 * do papel E alguma das linhas envolvidas tem OM — quem não tem bloqueio não paga a leitura.
 */
export function denyImpactNeedsGraph(allow: AllowUnderCheck, permissions: readonly UserPermission[]): boolean {
	const denies = denyEntriesOf(allow.module, permissions)
	return denies.length > 0 && needsSupportGraph([toUserPermission(allow), ...denies], [allow.module])
}

/**
 * Os bloqueios de `permissions` anulam este acesso?
 *
 * A decisão é a MESMA que a API do α toma ao resolver o papel (`resolveAlphaAccess`): a
 * precedência de deny de `resolveEffectivePermissions` e a cobertura por OM de
 * `resolveModuleUnitCoverage`, com o deny escopado expandindo pela hierarquia de apoio.
 * Por isso a tela não adivinha a partir de uma linha só:
 *   - bloqueio sem OM derruba o papel em todo lugar;
 *   - bloqueio numa OM APOIADORA derruba também as que ela apoia (deny no GAP-SJ anula o
 *     acesso no IAE);
 *   - bloqueio numa OM APOIADA não anula o acesso na apoiadora — só recorta o alcance.
 *
 * Só o acesso conferido e os bloqueios do papel entram no cálculo: deny vence allow venha
 * de onde vier, então "a OM do acesso segue coberta" é o mesmo que "nenhum bloqueio a
 * alcança", tenha a pessoa outros acessos do papel ou não.
 *
 * `permissions` são as VIVAS da pessoa, de qualquer origem (inline e política) — vencido é
 * ausência e não pode entrar aqui. `graph` só pode ser `null` quando
 * {@link denyImpactNeedsGraph} é `false`.
 */
export function denyImpactOnAllow(allow: AllowUnderCheck, permissions: readonly UserPermission[], graph: readonly UnitSupportEdge[] | null): DenyImpact {
	if (allow.level <= 0) throw new Error("denyImpactOnAllow: a linha conferida é um bloqueio, não um acesso")
	const denies = denyEntriesOf(allow.module, permissions)
	if (denies.length === 0) return "none"

	const effective = resolveEffectivePermissions([toUserPermission(allow)], denies)
	const coverage = resolveModuleUnitCoverage(effective, allow.module, graph, allow.level)

	if (allow.unitId !== null) return coversUnit(coverage, allow.unitId) ? "none" : "full"
	if (coverage === "all") return "none"
	return isEmptyCoverage(coverage) ? "full" : "partial"
}

/** Uma linha da lista no formato do PBAC — para a resolução, a origem (inline/política) não importa. */
function rowToUserPermission(row: GrantRowLike): UserPermission {
	return { module: row.module, level: row.level, unit_id: row.unitId, kitchen_id: null, mess_hall_id: null }
}

/**
 * Marca cada linha da lista com o efeito dos bloqueios sobre ela ({@link denyImpactOnAllow}),
 * a partir das OUTRAS linhas da mesma pessoa e do mesmo papel — inline e de política. Bloqueio
 * vencido não conta (é ausência); acesso vencido e bloqueio saem `none` (o vencido já tem a
 * marca própria).
 *
 * A lista precisa trazer os bloqueios que alcançam o que está na tela — os sem OM e os das
 * OMs apoiadoras, e não só os das OMs listadas (`listAlphaPeopleFn`). `graph` é o grafo de apoio
 * inteiro.
 */
export function annotateDenyImpact<T extends GrantRowLike>(
	grants: readonly T[],
	graph: readonly UnitSupportEdge[],
	now: number = Date.now()
): Array<T & { denyImpact: DenyImpact }> {
	const liveDenies = new Map<string, UserPermission[]>()
	for (const grant of grants) {
		if (grant.effect !== "deny" || isExpiredGrant(grant, now)) continue
		const key = `${grant.userId}:${grant.module}`
		const list = liveDenies.get(key) ?? []
		list.push(rowToUserPermission(grant))
		liveDenies.set(key, list)
	}

	return grants.map((grant) => {
		if (grant.effect !== "allow" || isExpiredGrant(grant, now)) return { ...grant, denyImpact: "none" as const }
		const denies = liveDenies.get(`${grant.userId}:${grant.module}`) ?? []
		return { ...grant, denyImpact: denyImpactOnAllow(grant, denies, graph) }
	})
}

/**
 * As OMs que apoiam esta, transitivamente, sem ela mesma: o caminho de
 * `supporting_unit_id` acima. Um bloqueio em qualquer uma delas alcança esta OM. O
 * conjunto visitado corta ciclo.
 */
export function supportingUnitsOf(unitId: number, graph: readonly UnitSupportEdge[]): number[] {
	const supporterOf = new Map(graph.map((edge) => [edge.id, edge.supporting_unit_id]))
	const chain: number[] = []
	const seen = new Set<number>([unitId])
	let current = supporterOf.get(unitId) ?? null
	while (current !== null && !seen.has(current)) {
		seen.add(current)
		chain.push(current)
		current = supporterOf.get(current) ?? null
	}
	return chain
}

/**
 * A OM que o formulário de concessão parte: a da página. Em "todas" (e em qualquer escopo
 * sem OM), nada — grant global às cegas é o erro caro. O formulário é remontado a cada troca
 * de escopo (`key` na página), então este é o valor de TODA entrada numa OM.
 */
export function initialGrantUnit(scope: { kind: string; unitId: number | null }): number | null {
	return scope.kind === "unit" ? scope.unitId : null
}
