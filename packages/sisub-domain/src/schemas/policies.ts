import { z } from "zod"
import { KitchenIdSchema, UuidSchema } from "./common.ts"
import { APP_MODULES } from "./permissions.ts"

/**
 * Nível de um statement. Mesma escala dos grants: 0 = deny explícito, 1 = leitura,
 * 2 = escrita, 3 = administração do módulo.
 */
export const PolicyLevelSchema = z.number().int().min(0).max(3)

/**
 * Statement de política: a MESMA forma de um grant. Colapsa com os grants inline antes de
 * qualquer checagem, então nenhum guard, rota ou componente precisa saber que políticas
 * existem.
 *
 * O `superRefine` espelha a check constraint do banco — validar aqui dá erro legível em vez
 * de violação de constraint crua.
 */
export const PolicyStatementInputSchema = z
	.object({
		module: z.enum(APP_MODULES),
		level: PolicyLevelSchema,
		unit_id: KitchenIdSchema.nullable().optional(),
		kitchen_id: KitchenIdSchema.nullable().optional(),
		mess_hall_id: KitchenIdSchema.nullable().optional(),
	})
	.superRefine((value, ctx) => {
		const scopes = [value.unit_id, value.kitchen_id, value.mess_hall_id].filter((id) => id != null)
		if (scopes.length > 1) {
			ctx.addIssue({
				code: "custom",
				message: "Um statement aceita no máximo um escopo (unidade, cozinha ou refeitório)",
				path: ["unit_id"],
			})
		}
	})
export type PolicyStatementInput = z.infer<typeof PolicyStatementInputSchema>

export const ListPoliciesSchema = z.object({
	/** Inclui as removidas por soft delete. Default: só as vivas. */
	includeDeleted: z.boolean().optional(),
})
export type ListPolicies = z.infer<typeof ListPoliciesSchema>

export const FetchPolicySchema = z.object({ policyId: UuidSchema })
export type FetchPolicy = z.infer<typeof FetchPolicySchema>

export const CreatePolicySchema = z.object({
	name: z.string().min(3, "Mínimo de 3 caracteres").max(120),
	description: z.string().max(500).nullable().optional(),
})
export type CreatePolicy = z.infer<typeof CreatePolicySchema>

export const UpdatePolicySchema = z.object({
	policyId: UuidSchema,
	name: z.string().min(3).max(120).optional(),
	// nullable: null limpa a descrição; undefined = não mexe.
	description: z.string().max(500).nullable().optional(),
})
export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>

export const DeletePolicySchema = z.object({ policyId: UuidSchema })
export type DeletePolicy = z.infer<typeof DeletePolicySchema>

export const RestorePolicySchema = z.object({ policyId: UuidSchema })
export type RestorePolicy = z.infer<typeof RestorePolicySchema>

export const AddPolicyStatementSchema = z.object({
	policyId: UuidSchema,
	statement: PolicyStatementInputSchema,
})
export type AddPolicyStatement = z.infer<typeof AddPolicyStatementSchema>

export const UpdatePolicyStatementSchema = z.object({
	statementId: UuidSchema,
	statement: PolicyStatementInputSchema,
})
export type UpdatePolicyStatement = z.infer<typeof UpdatePolicyStatementSchema>

export const RemovePolicyStatementSchema = z.object({ statementId: UuidSchema })
export type RemovePolicyStatement = z.infer<typeof RemovePolicyStatementSchema>

export const AttachPolicySchema = z.object({
	userId: UuidSchema,
	policyId: UuidSchema,
})
export type AttachPolicy = z.infer<typeof AttachPolicySchema>

export const DetachPolicySchema = AttachPolicySchema
export type DetachPolicy = z.infer<typeof DetachPolicySchema>

export const ListUserPoliciesSchema = z.object({ userId: UuidSchema })
export type ListUserPolicies = z.infer<typeof ListUserPoliciesSchema>
