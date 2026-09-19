/**
 * Ninguém tira a PRÓPRIA administração de acessos — por nenhum caminho.
 *
 * ## Por que simular, e não enumerar casos
 *
 * A primeira versão enumerava: baixar o nível do próprio grant de `admin`, pôr prazo nele,
 * desanexar a política que dá `admin`… e cada revisão achava mais um caminho. O último: um
 * DENY. Transformar um statement de uma política anexada ao ator em `admin:0`, acrescentar
 * `admin:0` a essa política, ou anexar-se a uma política que contém esse deny — deny vence
 * allow em `hasPermission`, o ator perde `admin` e, se era o último, ninguém mais volta pela
 * tela (conserto só por SQL).
 *
 * Então a regra é uma só, sobre o RESULTADO: para toda mutação que pode mexer no conjunto
 * efetivo do próprio ator, calcula-se o conjunto efetivo DEPOIS da mudança — com a MESMA
 * resolução que o guard usa (grant inline + statements das políticas anexadas vivas, deny com
 * precedência, vencido é ausente; `resolveEffectivePermissions`/`hasPermission` do @iefa/pbac)
 * — e recusa-se se `admin` no nível que o console exige deixaria de valer.
 *
 * Prazo INTRODUZIDO pela mudança é avaliado nos DOIS momentos: agora (a linha vale — um deny
 * com prazo tranca já) e depois de vencer (a linha sumiu — um allow com prazo tranca depois).
 * Perder a administração em qualquer dos dois é recusado; não há "prazo seguro" a validar
 * contra o relógio.
 *
 * A foto do estado atual vem numa consulta só (`loadActorAccessSnapshot`), com o "vencido"
 * calculado pelo `now()` do BANCO, como na resolução. A checagem é do app, antes da função
 * auditada — não há trava entre a foto e a escrita, e é aceitável: a corrida exige outro
 * administrador mexendo no acesso do ator no mesmo instante, e o log registra os dois.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission, resolveEffectivePermissions, type UserPermission } from "@iefa/pbac"
import { sql } from "drizzle-orm"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

/** Módulo e nível que o console de acessos exige (`requirePermission(ctx, "admin", 2)`). */
export const SELF_GUARD_MODULE = "admin"
export const SELF_GUARD_LEVEL = 2

/** Frase da recusa geral: a mudança tiraria a administração do próprio ator. */
export const SELF_ADMIN_LOSS_MESSAGE =
	"Esta alteração tiraria a sua própria administração de acessos — um bloqueio vence qualquer concessão, e sem ela você fica fora do console. Peça a outro administrador."

type Scopes = { unit_id: number | null; kitchen_id: number | null; mess_hall_id: number | null }

export type SnapshotPermission = Scopes & {
	id: string
	module: string
	level: number
	/** Vencido pelo `now()` do banco. */
	expired: boolean
	/** Prazo introduzido pela mudança simulada — vale agora, some depois (os dois são avaliados). */
	ending?: boolean
}

export type SnapshotStatement = Scopes & { id: string; module: string; level: number }

export type SnapshotPolicy = { id: string; deleted: boolean; statements: SnapshotStatement[] }

export type SnapshotAttachment = { policy_id: string; expired: boolean; ending?: boolean }

/** O que decide o acesso efetivo do ator: grants inline, anexos e as políticas envolvidas. */
export type ActorAccessSnapshot = {
	inline: SnapshotPermission[]
	attachments: SnapshotAttachment[]
	policies: SnapshotPolicy[]
}

/** A mudança a simular — uma por operação de escrita de acesso. */
export type AccessChange =
	| { kind: "inline-upsert"; row: Omit<SnapshotPermission, "expired"> & { expired?: boolean } }
	| { kind: "inline-delete"; id: string }
	| { kind: "statement-upsert"; policyId: string; statement: SnapshotStatement }
	| { kind: "statement-delete"; statementId: string }
	| { kind: "attach"; policyId: string; ending: boolean }
	| { kind: "detach"; policyId: string }
	| { kind: "policy-deleted"; policyId: string; deleted: boolean }

/**
 * O conjunto efetivo, exatamente como a resolução do guard o monta. `endingGone`: as linhas com
 * prazo introduzido pela mudança já venceram (o "depois"); sem ele, ainda valem (o "agora").
 */
export function effectivePermissions(snapshot: ActorAccessSnapshot, endingGone = false): UserPermission[] {
	const toPermission = (p: Scopes & { module: string; level: number }): UserPermission =>
		({ module: p.module, level: p.level, unit_id: p.unit_id, kitchen_id: p.kitchen_id, mess_hall_id: p.mess_hall_id }) as UserPermission
	const inline = snapshot.inline.filter((p) => !p.expired && !(endingGone && p.ending)).map(toPermission)
	const policyById = new Map(snapshot.policies.map((policy) => [policy.id, policy]))
	const fromPolicies = snapshot.attachments
		.filter((a) => !a.expired && !(endingGone && a.ending))
		.flatMap((a) => {
			const policy = policyById.get(a.policy_id)
			return policy && !policy.deleted ? policy.statements.map(toPermission) : []
		})
	return resolveEffectivePermissions(inline, fromPolicies)
}

/** O estado depois da mudança. Pura. */
export function applyAccessChange(snapshot: ActorAccessSnapshot, change: AccessChange): ActorAccessSnapshot {
	switch (change.kind) {
		case "inline-upsert": {
			const row: SnapshotPermission = { ...change.row, expired: change.row.expired ?? false }
			return { ...snapshot, inline: [...snapshot.inline.filter((p) => p.id !== row.id), row] }
		}
		case "inline-delete":
			return { ...snapshot, inline: snapshot.inline.filter((p) => p.id !== change.id) }
		case "statement-upsert":
			return {
				...snapshot,
				policies: snapshot.policies.map((policy) =>
					policy.id === change.policyId
						? { ...policy, statements: [...policy.statements.filter((s) => s.id !== change.statement.id), change.statement] }
						: policy
				),
			}
		case "statement-delete":
			return {
				...snapshot,
				policies: snapshot.policies.map((policy) => ({ ...policy, statements: policy.statements.filter((s) => s.id !== change.statementId) })),
			}
		case "attach":
			return {
				...snapshot,
				attachments: [
					...snapshot.attachments.filter((a) => a.policy_id !== change.policyId),
					{ policy_id: change.policyId, expired: false, ending: change.ending },
				],
			}
		case "detach":
			return { ...snapshot, attachments: snapshot.attachments.filter((a) => a.policy_id !== change.policyId) }
		case "policy-deleted":
			return { ...snapshot, policies: snapshot.policies.map((policy) => (policy.id === change.policyId ? { ...policy, deleted: change.deleted } : policy)) }
	}
}

const isAdmin = (permissions: UserPermission[]) => hasPermission(permissions, SELF_GUARD_MODULE, SELF_GUARD_LEVEL)

/**
 * A mudança tira do ator a administração que ele TEM hoje — agora, ou quando um prazo que ela
 * introduz vencer? Pura. Quem já não é administrador não tem o que perder (e nem chega aqui:
 * o guard da operação o recusou antes).
 */
export function wouldLoseAdministration(snapshot: ActorAccessSnapshot, change: AccessChange): boolean {
	if (!isAdmin(effectivePermissions(snapshot))) return false
	const after = applyAccessChange(snapshot, change)
	return !isAdmin(effectivePermissions(after)) || !isAdmin(effectivePermissions(after, true))
}

/** A política está anexada ao ator (vigente ou não)? */
export function isAttached(snapshot: ActorAccessSnapshot, policyId: string): boolean {
	return snapshot.attachments.some((a) => a.policy_id === policyId)
}

/**
 * Foto do acesso do ator, numa consulta só: grants inline, anexos, e as políticas anexadas
 * (removidas inclusive — restaurar uma devolve os statements dela) mais `extraPolicyId`
 * (a política que o ator vai anexar). "Vencido" pelo `now()` do banco.
 */
export async function loadActorAccessSnapshot(db: SisubDb, actorId: string, extraPolicyId: string | null = null): Promise<ActorAccessSnapshot> {
	const rows = (await runQuery("FETCH_FAILED", () =>
		db.execute(sql`/* actor-access-snapshot */
			with att as (
				select a.policy_id, (a.expires_at is not null and a.expires_at <= now()) as expired
				from access_control.user_policy_attachment a
				where a.user_id = ${actorId}::uuid
			)
			select jsonb_build_object(
				'inline', coalesce((
					select jsonb_agg(jsonb_build_object(
						'id', up.id, 'module', up.module, 'level', up.level,
						'unit_id', up.unit_id, 'kitchen_id', up.kitchen_id, 'mess_hall_id', up.mess_hall_id,
						'expired', (up.expires_at is not null and up.expires_at <= now())
					))
					from access_control.user_permissions up where up.user_id = ${actorId}::uuid
				), '[]'::jsonb),
				'attachments', coalesce((select jsonb_agg(jsonb_build_object('policy_id', att.policy_id, 'expired', att.expired)) from att), '[]'::jsonb),
				'policies', coalesce((
					select jsonb_agg(jsonb_build_object(
						'id', p.id,
						'deleted', p.deleted_at is not null,
						'statements', coalesce((
							select jsonb_agg(jsonb_build_object(
								'id', s.id, 'module', s.module, 'level', s.level,
								'unit_id', s.unit_id, 'kitchen_id', s.kitchen_id, 'mess_hall_id', s.mess_hall_id
							))
							from access_control.policy_statement s where s.policy_id = p.id
						), '[]'::jsonb)
					))
					from access_control.policy p
					where p.id in (select policy_id from att) or p.id = ${extraPolicyId}::uuid
				), '[]'::jsonb)
			) as snapshot
		`)
	)) as unknown as Array<{ snapshot: unknown }>
	const raw = rows[0]?.snapshot
	const snapshot = (typeof raw === "string" ? JSON.parse(raw) : raw) as ActorAccessSnapshot | undefined
	if (!snapshot) throw new DomainError("FETCH_FAILED", "não foi possível ler o acesso atual para conferir a própria administração")
	return snapshot
}

/**
 * Recusa a mudança que tiraria do ator a própria administração. `message` troca a frase geral
 * quando o chamador sabe dizer o motivo com mais precisão (prazo, por exemplo).
 */
export function refuseIfLosesAdministration(snapshot: ActorAccessSnapshot, change: AccessChange, message = SELF_ADMIN_LOSS_MESSAGE): void {
	if (wouldLoseAdministration(snapshot, change)) throw new DomainError("GRANT_NOT_ALLOWED", message)
}
