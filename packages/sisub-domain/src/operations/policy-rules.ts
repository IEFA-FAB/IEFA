/**
 * Regras de política de revisão do catálogo — CRUD + soft-delete em `procurement.policy_rule`.
 *
 * NÃO confundir com `operations/policies.ts`, que trata das políticas PBAC do
 * `access_control`. Aqui a "política" é o critério de qualidade que o revisor (humano ou
 * modelo) aplica a insumo e preparação.
 *
 * A tabela é do catálogo da SDAB: não tem coluna de dono (`kitchen_id`/`unit_id`), logo o
 * gate é o módulo `global` — leitura em `:1`, escrita em `:2`. Era exatamente o que o
 * server fn já exigia; a barreira só desceu para o domínio, onde o Drizzle bypassa RLS.
 *
 * `policy_rule` é flat (sem relations) → `db.select` com colunas explícitas, sem `db.query`.
 */

import { policyRuleInProcurement, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { CreatePolicyRule, DeletePolicyRule, ListPolicyRules, PolicyTarget, UpdatePolicyRule } from "../schemas/policy-rules.ts"
import type { UserContext } from "../types/context.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"

/**
 * Linha de `policy_rule` no contrato snake_case do app.
 *
 * `target` é `text` com CHECK no banco, então o tipo gerado o entrega como `string`; o app
 * consome `PolicyTarget` (e usa o valor para escolher chave de query). Estreitar aqui mantém
 * o contrato honesto sem depender de cast no chamador.
 */
export type PolicyRuleRow = Omit<Tables<"policy_rule">, "target"> & { target: PolicyTarget }

const POLICY_RULE_COLS = {
	id: policyRuleInProcurement.id,
	// Passthrough tipado: a coluna é `text`, o CHECK do banco garante o par de valores.
	target: sql<PolicyTarget>`${policyRuleInProcurement.target}`,
	title: policyRuleInProcurement.title,
	description: policyRuleInProcurement.description,
	display_order: policyRuleInProcurement.displayOrder,
	active: policyRuleInProcurement.active,
	created_at: policyRuleInProcurement.createdAt,
	updated_at: policyRuleInProcurement.updatedAt,
	deleted_at: policyRuleInProcurement.deletedAt,
} as const

export async function listPolicyRules(db: SisubDb, ctx: UserContext, input: ListPolicyRules): Promise<PolicyRuleRow[]> {
	requirePermission(ctx, "global", 1)

	const conditions: SQL[] = [eq(policyRuleInProcurement.target, input.target), isNull(policyRuleInProcurement.deletedAt)]
	if (input.activeOnly) conditions.push(eq(policyRuleInProcurement.active, true))

	return runQuery("FETCH_FAILED", () =>
		db
			.select(POLICY_RULE_COLS)
			.from(policyRuleInProcurement)
			.where(and(...conditions))
			.orderBy(asc(policyRuleInProcurement.displayOrder), asc(policyRuleInProcurement.createdAt))
	)
}

export async function createPolicyRule(db: SisubDb, ctx: UserContext, input: CreatePolicyRule): Promise<PolicyRuleRow> {
	requirePermission(ctx, "global", 2)

	return insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(policyRuleInProcurement)
			.values({
				target: input.target,
				title: input.title,
				description: input.description,
				displayOrder: input.display_order ?? 0,
			})
			.returning(POLICY_RULE_COLS)
	)
}

export async function updatePolicyRule(db: SisubDb, ctx: UserContext, input: UpdatePolicyRule): Promise<PolicyRuleRow> {
	requirePermission(ctx, "global", 2)

	// `updated_at` é carimbado sempre, inclusive num patch vazio — o app depende disso para
	// reordenar sem tocar em conteúdo.
	const updates: Partial<typeof policyRuleInProcurement.$inferInsert> = { updatedAt: new Date().toISOString() }
	if (input.title !== undefined) updates.title = input.title
	if (input.description !== undefined) updates.description = input.description
	if (input.display_order !== undefined) updates.displayOrder = input.display_order
	if (input.active !== undefined) updates.active = input.active

	// `deleted_at IS NULL` no predicado: editar regra já excluída não casa nada e falha como
	// "não encontrada", em vez de ressuscitar conteúdo pelo caminho da edição.
	return insertOneOrFail("UPDATE_FAILED", `policy_rule ${input.id} not found`, () =>
		db
			.update(policyRuleInProcurement)
			.set(updates)
			.where(and(eq(policyRuleInProcurement.id, input.id), isNull(policyRuleInProcurement.deletedAt)))
			.returning(POLICY_RULE_COLS)
	)
}

export async function deletePolicyRule(db: SisubDb, ctx: UserContext, input: DeletePolicyRule): Promise<void> {
	requirePermission(ctx, "global", 2)

	await mutateOrFail("DELETE_FAILED", `policy_rule ${input.id} not found`, () =>
		db
			.update(policyRuleInProcurement)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(policyRuleInProcurement.id, input.id), isNull(policyRuleInProcurement.deletedAt)))
			.returning({ id: policyRuleInProcurement.id })
	)
}
