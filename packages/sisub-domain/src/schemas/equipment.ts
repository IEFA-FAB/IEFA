/**
 * Schemas dos equipamentos de cozinha.
 *
 * Três camadas, espelhando catálogo × instância (igual a ingredient × recipe_ingredients):
 *   papel (`equipment_role`) → modelo (`equipment_model`) → unidade física (`equipment_unit`),
 * e do lado da preparação a lista mínima (`recipe_equipment_requirement`).
 *
 * A exigência aponta para um PAPEL ("1 forno combinado" — serve qualquer modelo que o assuma)
 * XOR para um MODELO ("1 Rational iVario Pro L" — quando a ficha depende daquele equipamento).
 * O XOR é validado aqui e no banco (check `recipe_equipment_requirement_target_xor`).
 *
 * Opcional exposto a modelo é `.nullish()`, nunca `.optional()` puro — modelo não omite campo,
 * manda `null` (ver CLAUDE.md, seção de ferramentas de IA).
 */

import { z } from "zod"
import { DateSchema, KitchenIdSchema, UuidSchema } from "./common.ts"

export const EQUIPMENT_ROLE_CATEGORIES = ["coccao", "preparo", "conservacao", "apoio"] as const
export const EquipmentRoleCategorySchema = z.enum(EQUIPMENT_ROLE_CATEGORIES)
export type EquipmentRoleCategory = z.infer<typeof EquipmentRoleCategorySchema>

export const EQUIPMENT_UNIT_STATUSES = ["active", "maintenance", "decommissioned"] as const
export const EquipmentUnitStatusSchema = z.enum(EQUIPMENT_UNIT_STATUSES)
export type EquipmentUnitStatus = z.infer<typeof EquipmentUnitStatusSchema>

// ── Catálogo ──────────────────────────────────────────────────────────────

export const ListEquipmentRolesSchema = z.object({
	category: EquipmentRoleCategorySchema.nullish(),
	search: z.string().max(200).nullish(),
})
export type ListEquipmentRoles = z.infer<typeof ListEquipmentRolesSchema>

/**
 * Papel novo no catálogo. `code` é a chave natural citada por seed e import — slug minúsculo,
 * imutável depois de criado (renomear o rótulo é `name`, não `code`).
 */
export const CreateEquipmentRoleSchema = z.object({
	code: z
		.string()
		.min(2)
		.max(60)
		.regex(/^[a-z][a-z0-9_]*$/, "code deve ser um slug minúsculo (letras, números e _)"),
	name: z.string().min(1).max(200),
	description: z.string().max(2000).nullish(),
	category: EquipmentRoleCategorySchema.default("coccao"),
	sortOrder: z.number().int().nonnegative().default(100),
})
export type CreateEquipmentRole = z.infer<typeof CreateEquipmentRoleSchema>

export const UpdateEquipmentRoleSchema = z.object({
	roleId: UuidSchema,
	name: z.string().min(1).max(200).nullish(),
	description: z.string().max(2000).nullish(),
	category: EquipmentRoleCategorySchema.nullish(),
	sortOrder: z.number().int().nonnegative().nullish(),
})
export type UpdateEquipmentRole = z.infer<typeof UpdateEquipmentRoleSchema>

export const DeleteEquipmentRoleSchema = z.object({ roleId: UuidSchema })
export type DeleteEquipmentRole = z.infer<typeof DeleteEquipmentRoleSchema>

export const ListEquipmentModelsSchema = z.object({
	/** Cozinha cujos modelos próprios entram no resultado. O catálogo global entra sempre. */
	kitchenId: KitchenIdSchema.nullish(),
	/** Só modelos que assumem este papel. */
	roleId: UuidSchema.nullish(),
	search: z.string().max(200).nullish(),
})
export type ListEquipmentModels = z.infer<typeof ListEquipmentModelsSchema>

/** Papel que o modelo assume. `isPrimary` é o papel de catálogo — no máximo um por modelo. */
export const ModelRoleSchema = z.object({
	roleId: UuidSchema,
	isPrimary: z.boolean().default(false),
	notes: z.string().max(500).nullish(),
})
export type ModelRole = z.infer<typeof ModelRoleSchema>

export const CreateEquipmentModelSchema = z.object({
	manufacturer: z.string().max(120).nullish(),
	name: z.string().min(1).max(200),
	/** Capacidade de UMA zona, não do equipamento inteiro (iVario Pro 2-S = 25 L, não 50). */
	slotCapacityLiters: z.number().positive().nullish(),
	slotCapacityGn: z.number().int().positive().nullish(),
	capacityLabel: z.string().max(120).nullish(),
	/** Zonas independentes (cubas, bocas, câmaras): quantas exigências a unidade atende ao mesmo tempo. */
	simultaneousSlots: z.number().int().positive().default(1),
	powerKw: z.number().positive().nullish(),
	isGeneric: z.boolean().default(false),
	/** null = modelo do catálogo global (exige `global:2`). */
	kitchenId: KitchenIdSchema.nullish(),
	notes: z.string().max(2000).nullish(),
	roles: z.array(ModelRoleSchema).min(1, "informe ao menos um papel que o modelo assume"),
})
export type CreateEquipmentModel = z.infer<typeof CreateEquipmentModelSchema>

export const UpdateEquipmentModelSchema = z.object({
	modelId: UuidSchema,
	manufacturer: z.string().max(120).nullish(),
	name: z.string().min(1).max(200).nullish(),
	slotCapacityLiters: z.number().positive().nullish(),
	slotCapacityGn: z.number().int().positive().nullish(),
	capacityLabel: z.string().max(120).nullish(),
	simultaneousSlots: z.number().int().positive().nullish(),
	powerKw: z.number().positive().nullish(),
	notes: z.string().max(2000).nullish(),
	/** Quando presente, SUBSTITUI a lista de papéis do modelo. Ausente = mantém. */
	roles: z.array(ModelRoleSchema).min(1).nullish(),
})
export type UpdateEquipmentModel = z.infer<typeof UpdateEquipmentModelSchema>

export const DeleteEquipmentModelSchema = z.object({ modelId: UuidSchema })
export type DeleteEquipmentModel = z.infer<typeof DeleteEquipmentModelSchema>

// ── Parque instalado ──────────────────────────────────────────────────────

export const ListKitchenEquipmentSchema = z.object({
	kitchenId: KitchenIdSchema,
	/** Inclui manutenção/baixa. Por padrão só o que está ativo — é o que produz. */
	includeInactive: z.boolean().default(false),
})
export type ListKitchenEquipment = z.infer<typeof ListKitchenEquipmentSchema>

/** Exceção de papel na unidade: `available` true adiciona (acessório), false remove (defeito). */
export const UnitRoleOverrideSchema = z.object({
	roleId: UuidSchema,
	available: z.boolean(),
	notes: z.string().max(500).nullish(),
})
export type UnitRoleOverride = z.infer<typeof UnitRoleOverrideSchema>

export const CreateEquipmentUnitSchema = z.object({
	kitchenId: KitchenIdSchema,
	modelId: UuidSchema,
	label: z.string().min(1).max(200),
	assetTag: z.string().max(60).nullish(),
	serialNumber: z.string().max(120).nullish(),
	status: EquipmentUnitStatusSchema.default("active"),
	/** Override do modelo (cuba interditada, boca queimada). null = herda do modelo. */
	simultaneousSlots: z.number().int().positive().nullish(),
	acquiredOn: DateSchema.nullish(),
	notes: z.string().max(2000).nullish(),
	roleOverrides: z.array(UnitRoleOverrideSchema).default([]),
})
export type CreateEquipmentUnit = z.infer<typeof CreateEquipmentUnitSchema>

export const UpdateEquipmentUnitSchema = z.object({
	unitId: UuidSchema,
	label: z.string().min(1).max(200).nullish(),
	modelId: UuidSchema.nullish(),
	assetTag: z.string().max(60).nullish(),
	serialNumber: z.string().max(120).nullish(),
	status: EquipmentUnitStatusSchema.nullish(),
	simultaneousSlots: z.number().int().positive().nullish(),
	acquiredOn: DateSchema.nullish(),
	notes: z.string().max(2000).nullish(),
	/** Quando presente, SUBSTITUI as exceções de papel da unidade. Ausente = mantém. */
	roleOverrides: z.array(UnitRoleOverrideSchema).nullish(),
})
export type UpdateEquipmentUnit = z.infer<typeof UpdateEquipmentUnitSchema>

export const DeleteEquipmentUnitSchema = z.object({ unitId: UuidSchema })
export type DeleteEquipmentUnit = z.infer<typeof DeleteEquipmentUnitSchema>

// ── Exigência da preparação ───────────────────────────────────────────────

export const EquipmentRequirementSchema = z
	.object({
		/** Amarra a exigência a uma etapa do fluxo de produção. null = exigência da preparação inteira. */
		recipeStepId: UuidSchema.nullish(),
		roleId: UuidSchema.nullish(),
		modelId: UuidSchema.nullish(),
		quantity: z.number().int().positive().max(99).default(1),
		/** Comparada com a capacidade de UMA zona: "caldeira de pelo menos 100 L" não é atendida por duas de 50. */
		minCapacityLiters: z.number().positive().nullish(),
		minCapacityGn: z.number().int().positive().nullish(),
		notes: z.string().max(500).nullish(),
	})
	.refine((v) => (v.roleId != null) !== (v.modelId != null), {
		message: "a exigência precisa de exatamente um alvo (roleId XOR modelId)",
	})
export type EquipmentRequirement = z.infer<typeof EquipmentRequirementSchema>

export const FetchRecipeEquipmentSchema = z.object({ recipeId: UuidSchema })
export type FetchRecipeEquipment = z.infer<typeof FetchRecipeEquipmentSchema>

/** Replace transacional da lista inteira — mesmo contrato do fluxo de produção. */
export const SaveRecipeEquipmentSchema = z.object({
	recipeId: UuidSchema,
	requirements: z.array(EquipmentRequirementSchema),
})
export type SaveRecipeEquipment = z.infer<typeof SaveRecipeEquipmentSchema>

export const EvaluateRecipeEquipmentFitnessSchema = z.object({
	recipeId: UuidSchema,
	kitchenId: KitchenIdSchema,
})
export type EvaluateRecipeEquipmentFitness = z.infer<typeof EvaluateRecipeEquipmentFitnessSchema>
