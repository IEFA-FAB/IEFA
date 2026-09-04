import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Regras de política de revisão do catálogo da SDAB (`procurement.policy_rule`).
 *
 * NÃO confundir com `schemas/policies.ts`: aquele descreve as políticas PBAC
 * (`access_control`), este descreve o critério de qualidade que um insumo ou uma
 * preparação precisa satisfazer na revisão.
 *
 * Os campos de escrita ficam em snake_case (`display_order`) porque este é o contrato
 * já gravado e consumido pelo app — o mesmo motivo de `PurchaseItemWriteSchema`.
 */

/** Alvo da regra: catálogo de insumos ou de preparações. Valor de domínio — não traduzir. */
export const POLICY_TARGETS = ["product", "recipe"] as const
export const PolicyTargetSchema = z.enum(POLICY_TARGETS)
export type PolicyTarget = z.infer<typeof PolicyTargetSchema>

export const ListPolicyRulesSchema = z.object({
	target: PolicyTargetSchema,
	/** `true` devolve só as regras com `active = true` (usado na geração do prompt de revisão). */
	activeOnly: z.boolean().optional(),
})
export type ListPolicyRules = z.infer<typeof ListPolicyRulesSchema>

export const CreatePolicyRuleSchema = z.object({
	target: PolicyTargetSchema,
	title: z.string().min(3, "Mínimo de 3 caracteres"),
	description: z.string().min(10, "Mínimo de 10 caracteres"),
	display_order: z.number().int().min(0).optional(),
})
export type CreatePolicyRule = z.infer<typeof CreatePolicyRuleSchema>

export const UpdatePolicyRuleSchema = z.object({
	id: UuidSchema,
	title: z.string().min(3).optional(),
	description: z.string().min(10).optional(),
	display_order: z.number().int().min(0).optional(),
	active: z.boolean().optional(),
})
export type UpdatePolicyRule = z.infer<typeof UpdatePolicyRuleSchema>

export const DeletePolicyRuleSchema = z.object({
	id: UuidSchema,
})
export type DeletePolicyRule = z.infer<typeof DeletePolicyRuleSchema>
