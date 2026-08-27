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

// ── Pane ──────────────────────────────────────────────────────────────────
// Os enums moram aqui, e não no util que deriva a condição: o contrato do domínio é um só, e
// duas listas de severidade em arquivos diferentes divergem no dia em que alguém acrescentar
// uma terceira. `utils/equipment-condition.ts` importa os TIPOS daqui.

export const EQUIPMENT_ISSUE_SEVERITIES = ["degraded", "inoperative"] as const
export const EquipmentIssueSeveritySchema = z.enum(EQUIPMENT_ISSUE_SEVERITIES)
export type EquipmentIssueSeverity = z.infer<typeof EquipmentIssueSeveritySchema>

export const EQUIPMENT_ISSUE_STATUSES = ["open", "in_repair", "resolved", "dismissed"] as const
export const EquipmentIssueStatusSchema = z.enum(EQUIPMENT_ISSUE_STATUSES)
export type EquipmentIssueStatus = z.infer<typeof EquipmentIssueStatusSchema>

export const EQUIPMENT_ISSUE_CATEGORIES = ["mechanical", "electrical", "gas", "hydraulic", "refrigeration", "structural", "other"] as const
export const EquipmentIssueCategorySchema = z.enum(EQUIPMENT_ISSUE_CATEGORIES)
export type EquipmentIssueCategory = z.infer<typeof EquipmentIssueCategorySchema>

// ── Manutenção ────────────────────────────────────────────────────────────

export const MAINTENANCE_KINDS = ["preventive", "inspection", "cleaning", "calibration", "legal"] as const
export const MaintenanceKindSchema = z.enum(MAINTENANCE_KINDS)
export type MaintenanceKind = z.infer<typeof MaintenanceKindSchema>

/** O log aceita tudo que o plano aceita, mais `corrective` — conserto não planejado não tem plano. */
export const MAINTENANCE_LOG_KINDS = [...MAINTENANCE_KINDS, "corrective"] as const
export const MaintenanceLogKindSchema = z.enum(MAINTENANCE_LOG_KINDS)
export type MaintenanceLogKind = z.infer<typeof MaintenanceLogKindSchema>

export const MAINTENANCE_PROVIDERS = ["in_house", "contract", "manufacturer"] as const
export const MaintenanceProviderSchema = z.enum(MAINTENANCE_PROVIDERS)
export type MaintenanceProvider = z.infer<typeof MaintenanceProviderSchema>

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
	/** Patrimônio: quando entrou em operação, até quando tem garantia, de quem veio. */
	installedOn: DateSchema.nullish(),
	warrantyUntil: DateSchema.nullish(),
	supplier: z.string().max(200).nullish(),
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
	installedOn: DateSchema.nullish(),
	warrantyUntil: DateSchema.nullish(),
	supplier: z.string().max(200).nullish(),
	notes: z.string().max(2000).nullish(),
	/** Quando presente, SUBSTITUI as exceções de papel da unidade. Ausente = mantém. */
	roleOverrides: z.array(UnitRoleOverrideSchema).nullish(),
})
export type UpdateEquipmentUnit = z.infer<typeof UpdateEquipmentUnitSchema>

export const DeleteEquipmentUnitSchema = z.object({ unitId: UuidSchema })
export type DeleteEquipmentUnit = z.infer<typeof DeleteEquipmentUnitSchema>

// ── Pane ──────────────────────────────────────────────────────────────────

export const ListEquipmentIssuesSchema = z.object({
	kitchenId: KitchenIdSchema,
	unitId: UuidSchema.nullish(),
	/** Só as que ainda pesam (`open`/`in_repair`). false = histórico completo. */
	onlyOpen: z.boolean().default(true),
	limit: z.number().int().positive().max(500).default(100),
})
export type ListEquipmentIssues = z.infer<typeof ListEquipmentIssuesSchema>

export const ReportEquipmentIssueSchema = z.object({
	unitId: UuidSchema,
	severity: EquipmentIssueSeveritySchema,
	category: EquipmentIssueCategorySchema.default("other"),
	/** Obrigatória: "quebrou" sem descrição não dá para nenhum gestor agir. */
	description: z.string().min(1).max(2000),
})
export type ReportEquipmentIssue = z.infer<typeof ReportEquipmentIssueSchema>

/**
 * Transição de pane. `status` é o campo do ciclo; `severity` existe porque a gestão pode
 * reclassificar ("não é que não liga, é que aquece devagar") sem abrir outra pane.
 */
export const UpdateEquipmentIssueSchema = z.object({
	issueId: UuidSchema,
	status: EquipmentIssueStatusSchema.nullish(),
	severity: EquipmentIssueSeveritySchema.nullish(),
	resolutionNote: z.string().max(2000).nullish(),
})
export type UpdateEquipmentIssue = z.infer<typeof UpdateEquipmentIssueSchema>

// ── Manutenção ────────────────────────────────────────────────────────────

export const ListMaintenancePlansSchema = z.object({
	/** null = só os planos globais. Preenchido = globais + os da cozinha. */
	kitchenId: KitchenIdSchema.nullish(),
	roleId: UuidSchema.nullish(),
	modelId: UuidSchema.nullish(),
	limit: z.number().int().positive().max(500).default(200),
})
export type ListMaintenancePlans = z.infer<typeof ListMaintenancePlansSchema>

/** Planos que valem para UMA unidade, resolvidos pelos papéis EFETIVOS dela. */
export const ListApplicablePlansSchema = z.object({ unitId: UuidSchema })
export type ListApplicablePlans = z.infer<typeof ListApplicablePlansSchema>

const MaintenancePlanFieldsSchema = z.object({
	title: z.string().min(1).max(200),
	kind: MaintenanceKindSchema.default("preventive"),
	intervalDays: z.number().int().positive().max(3650),
	toleranceDays: z.number().int().nonnegative().max(365).default(0),
	instructions: z.string().max(4000).nullish(),
	estimatedMinutes: z.number().int().positive().max(10_000).nullish(),
	isRequired: z.boolean().default(true),
	sortOrder: z.number().int().nonnegative().default(100),
})

/**
 * Âncora XOR, igual à exigência da preparação: a rotina é do PAPEL (toda coifa, de qualquer
 * marca) ou de um MODELO (a guarnição daquele forno). O refine espelha o CHECK
 * `equipment_maintenance_plan_target_xor` — rejeitar aqui dá mensagem; deixar chegar no banco dá 23514.
 *
 * `toleranceDays < intervalDays` também é CHECK no banco: folga maior que o próprio período
 * tornaria a rotina inalcançável — ela nunca venceria.
 */
export const CreateMaintenancePlanSchema = MaintenancePlanFieldsSchema.extend({
	roleId: UuidSchema.nullish(),
	modelId: UuidSchema.nullish(),
	/** null = plano global (Catálogo Global). Preenchido = rotina da própria cozinha. */
	kitchenId: KitchenIdSchema.nullish(),
})
	.refine((v) => (v.roleId == null) !== (v.modelId == null), { message: "Informe roleId OU modelId, nunca os dois" })
	.refine((v) => v.toleranceDays < v.intervalDays, { message: "toleranceDays deve ser menor que intervalDays" })
export type CreateMaintenancePlan = z.infer<typeof CreateMaintenancePlanSchema>

export const UpdateMaintenancePlanSchema = z.object({
	planId: UuidSchema,
	title: z.string().min(1).max(200).nullish(),
	kind: MaintenanceKindSchema.nullish(),
	intervalDays: z.number().int().positive().max(3650).nullish(),
	toleranceDays: z.number().int().nonnegative().max(365).nullish(),
	instructions: z.string().max(4000).nullish(),
	estimatedMinutes: z.number().int().positive().max(10_000).nullish(),
	isRequired: z.boolean().nullish(),
	sortOrder: z.number().int().nonnegative().nullish(),
})
export type UpdateMaintenancePlan = z.infer<typeof UpdateMaintenancePlanSchema>

export const DeleteMaintenancePlanSchema = z.object({ planId: UuidSchema })
export type DeleteMaintenancePlan = z.infer<typeof DeleteMaintenancePlanSchema>

export const LogMaintenanceSchema = z.object({
	unitId: UuidSchema,
	/** null = corretiva/avulsa. A maioria da manutenção real não corresponde a plano nenhum. */
	planId: UuidSchema.nullish(),
	/** Pane que originou o conserto. Fecha o ciclo relato → conserto. */
	issueId: UuidSchema.nullish(),
	kind: MaintenanceLogKindSchema.default("preventive"),
	performedOn: DateSchema,
	provider: MaintenanceProviderSchema.default("in_house"),
	cost: z.number().nonnegative().nullish(),
	notes: z.string().max(2000).nullish(),
	/** Encerra a pane de `issueId` como resolvida no mesmo movimento. Exige `kitchen:2`. */
	resolveIssue: z.boolean().default(false),
})
export type LogMaintenance = z.infer<typeof LogMaintenanceSchema>

export const ListMaintenanceLogsSchema = z.object({
	kitchenId: KitchenIdSchema,
	unitId: UuidSchema.nullish(),
	planId: UuidSchema.nullish(),
	limit: z.number().int().positive().max(500).default(100),
})
export type ListMaintenanceLogs = z.infer<typeof ListMaintenanceLogsSchema>

// ── Exigência da preparação ───────────────────────────────────────────────

export const EQUIPMENT_SCALING = ["per_batch", "fixed"] as const
export const EquipmentScalingSchema = z.enum(EQUIPMENT_SCALING)
export type EquipmentScaling = z.infer<typeof EquipmentScalingSchema>

export const EquipmentRequirementSchema = z
	.object({
		/**
		 * Amarra a exigência a uma etapa do fluxo de produção. null = exigência da preparação
		 * inteira. Exigências em etapas de níveis DIFERENTES do DAG não são concorrentes.
		 */
		recipeStepId: UuidSchema.nullish(),
		roleId: UuidSchema.nullish(),
		modelId: UuidSchema.nullish(),
		/** Unidades simultâneas POR BATELADA. Volume vira ciclos, não vira mais equipamento. */
		quantity: z.number().int().positive().max(99).default(1),
		/** `fixed` = a leva inteira usa a mesma unidade (ultracongelador, seladora, balança). */
		scaling: EquipmentScalingSchema.default("per_batch"),
		/** Porções cobertas por esta linha. null = a batelada é o `portion_yield` da receita. */
		batchPortions: z.number().positive().max(1_000_000).nullish(),
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

// ── Ponte com o catálogo de utensílios ────────────────────────────────────

/** Marca (ou desmarca, com `roleId` null) um utensílio como equipamento de um papel. */
export const SetUtensilRoleSchema = z.object({
	utensilId: UuidSchema,
	roleId: UuidSchema.nullable(),
})
export type SetUtensilRole = z.infer<typeof SetUtensilRoleSchema>

/** Sugestões de exigência derivadas do fluxo (etapas que usam utensílio mapeado a papel). */
export const SuggestRecipeEquipmentSchema = z.object({ recipeId: UuidSchema })
export type SuggestRecipeEquipment = z.infer<typeof SuggestRecipeEquipmentSchema>

export const EvaluateRecipeEquipmentFitnessSchema = z.object({
	recipeId: UuidSchema,
	kitchenId: KitchenIdSchema,
	/**
	 * Volume a produzir. Ausente = pergunta de capacidade funcional ("a cozinha tem o
	 * equipamento?"). Presente = acrescenta bateladas e ciclos ("cabe, em quantas rodadas?").
	 */
	portions: z.number().positive().max(1_000_000).nullish(),
})
export type EvaluateRecipeEquipmentFitness = z.infer<typeof EvaluateRecipeEquipmentFitnessSchema>

/**
 * Atendimento no nível do CARDÁPIO: as preparações de uma mesma refeição disputam o mesmo parque.
 * O `daily_menu` é a janela natural de concorrência — o almoço não briga por forno com a janta.
 */
export const EvaluateMenuEquipmentFitnessSchema = z.object({ dailyMenuId: UuidSchema })
export type EvaluateMenuEquipmentFitness = z.infer<typeof EvaluateMenuEquipmentFitnessSchema>
