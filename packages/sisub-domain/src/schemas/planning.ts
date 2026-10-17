import { z } from "zod"
import { DateSchema, KitchenIdSchema, MenuGroupKeySchema, RecommendedProportionSchema, UuidSchema } from "./common.ts"
import { ApplyEventTemplateSchema } from "./templates.ts"

export const DailyMenuFetchSchema = z.object({
	kitchenId: KitchenIdSchema,
	startDate: DateSchema,
	endDate: DateSchema,
})
export type DailyMenuFetch = z.infer<typeof DailyMenuFetchSchema>

export const DayDetailsFetchSchema = z.object({
	kitchenId: KitchenIdSchema,
	date: DateSchema,
})
export type DayDetailsFetch = z.infer<typeof DayDetailsFetchSchema>

export const UpsertDailyMenuSchema = z.object({
	kitchenId: KitchenIdSchema,
	serviceDate: DateSchema,
	mealTypeId: UuidSchema,
	forecastedHeadcount: z.number().int().positive().optional(),
})
export type UpsertDailyMenu = z.infer<typeof UpsertDailyMenuSchema>

export const AddMenuItemSchema = z.object({
	dailyMenuId: UuidSchema,
	recipeId: UuidSchema,
	plannedPortionQuantity: z.number().positive().optional(),
	excludedFromProcurement: z.union([z.literal(0), z.literal(1)]).optional(),
	itemGroup: MenuGroupKeySchema.nullable().optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	recommendedProportion: RecommendedProportionSchema.nullable(),
})
export type AddMenuItem = z.infer<typeof AddMenuItemSchema>

export const UpdateMenuItemSchema = z.object({
	menuItemId: UuidSchema,
	plannedPortionQuantity: z.number().positive().optional(),
	excludedFromProcurement: z.union([z.literal(0), z.literal(1)]).optional(),
	itemGroup: MenuGroupKeySchema.nullable().optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	recommendedProportion: RecommendedProportionSchema.nullable(),
})
export type UpdateMenuItem = z.infer<typeof UpdateMenuItemSchema>

export const RemoveMenuItemSchema = z.object({
	menuItemId: UuidSchema,
})
export type RemoveMenuItem = z.infer<typeof RemoveMenuItemSchema>

export const RestoreMenuItemSchema = z.object({
	menuItemId: UuidSchema,
})
export type RestoreMenuItem = z.infer<typeof RestoreMenuItemSchema>

export const UpdateHeadcountSchema = z.object({
	dailyMenuId: UuidSchema,
	forecastedHeadcount: z.number().int().positive(),
})
export type UpdateHeadcount = z.infer<typeof UpdateHeadcountSchema>

/** Registro de substituição no item do dia (`menu_items.substitutions`, chave = insumo que faltou ou `recipe_swap`). */
export const SubstitutionEntrySchema = z.object({
	type: z.string(),
	rationale: z.string(),
	updated_at: z.string(),
	/** Insumo que entrou no lugar (a chave do registro é o insumo que faltou). */
	substitute_ingredient_id: UuidSchema.nullable().optional(),
	/** Nome do substituto como o turno o lê — também cobre o que não está no catálogo. */
	substitute_description: z.string().max(200).nullable().optional(),
	/** Troca de preparação (`recipe_swap`): de qual preparação o item veio. */
	from_recipe_id: UuidSchema.nullable().optional(),
	from_recipe_name: z.string().nullable().optional(),
	/** Quem registrou (usuário da sessão ou da chave MCP). Registros antigos não têm. */
	recorded_by: UuidSchema.nullable().optional(),
	/** `mcp` quando quem registrou foi um agente pelo servidor MCP; ausente na tela. */
	source: z.literal("mcp").optional(),
})

export type SubstitutionEntry = z.infer<typeof SubstitutionEntrySchema>

export const GetTrashItemsSchema = z.object({
	kitchenId: KitchenIdSchema,
})
export type GetTrashItems = z.infer<typeof GetTrashItemsSchema>

/**
 * Tudo o que UM cardápio (evento, apoio ou semanal) pôs num dia do calendário — identificado
 * pela origem gravada no item (`menu_items.origin_template_id`). É o grão dos imprevistos: a
 * viagem cancelada tira o apoio inteiro do dia, a adiada o leva para outra data, sem o
 * usuário caçar preparação por preparação.
 */
export const DayOriginSchema = z.object({
	kitchenId: KitchenIdSchema,
	date: DateSchema,
	originTemplateId: UuidSchema,
})
export type DayOrigin = z.infer<typeof DayOriginSchema>

export const RemoveOriginFromDaySchema = DayOriginSchema
export type RemoveOriginFromDay = z.infer<typeof RemoveOriginFromDaySchema>

/**
 * Efetivo (kits, no apoio) de um evento ou apoio aplicado ao dia SEM efetivo: as preparações
 * dele que ainda não têm porções passam a ter, pela proporção de cada uma. É o caminho que a
 * aplicação sem efetivo promete ("as porções são calculadas quando você informar").
 */
export const SizeOriginOnDaySchema = DayOriginSchema.extend({
	headcount: z.number().int().positive().max(100_000),
})
export type SizeOriginOnDay = z.infer<typeof SizeOriginOnDaySchema>

export const MoveOriginToDateSchema = DayOriginSchema.extend({
	/** Data de destino. Os ajustes feitos no dia (porções, trocas, substitutos) vão junto. */
	toDate: DateSchema,
})
export type MoveOriginToDate = z.infer<typeof MoveOriginToDateSchema>

/**
 * Troca o cardápio INTEIRO de um dia por outro (evento ou apoio): falta de luz, falta de água,
 * pane de equipamento. O que estava planejado vai para a lixeira (restaurável) e o cardápio de
 * contingência entra no lugar, numa transação só. Produção de pedido de lanche aceito fica: ela
 * é compromisso com a missão, não planejamento da cozinha.
 */
export const ReplaceDayWithTemplateSchema = z.object({
	kitchenId: KitchenIdSchema,
	date: DateSchema,
	templateId: UuidSchema,
	/** Efetivo (kits, no apoio) de cada refeição do cardápio de contingência — mesma regra de `ApplyEventTemplateSchema.headcounts`. */
	headcounts: ApplyEventTemplateSchema.shape.headcounts,
	/** Horário de cada refeição nesta troca — mesma regra de `ApplyEventTemplateSchema.slots`. */
	slots: ApplyEventTemplateSchema.shape.slots,
})
export type ReplaceDayWithTemplate = z.infer<typeof ReplaceDayWithTemplateSchema>

/**
 * Troca a preparação de um item do dia (faltou o alimento), mantendo porções, porcentagem,
 * grupo, posição e origem. O motivo é obrigatório: é o que a Produção Cozinha mostra ao turno.
 */
export const ReplaceMenuItemRecipeSchema = z.object({
	menuItemId: UuidSchema,
	recipeId: UuidSchema,
	rationale: z.string().trim().min(1).max(300),
})
export type ReplaceMenuItemRecipe = z.infer<typeof ReplaceMenuItemRecipeSchema>

/** Substitutos cadastrados na ficha para os insumos de um item do dia. */
export const MenuItemSubstituteOptionsSchema = z.object({
	menuItemId: UuidSchema,
})
export type MenuItemSubstituteOptions = z.infer<typeof MenuItemSubstituteOptionsSchema>

/** Um substituto de insumo registrado no item do dia (merge atômico, não reescreve o mapa). */
export const RecordMenuSubstitutionSchema = z.object({
	menuItemId: UuidSchema,
	/** Insumo que faltou — a chave do registro. */
	ingredientId: UuidSchema,
	substituteIngredientId: UuidSchema.nullable().optional(),
	substituteDescription: z.string().trim().min(1).max(200),
	rationale: z.string().trim().min(1).max(300),
})
export type RecordMenuSubstitution = z.infer<typeof RecordMenuSubstitutionSchema>

// ─── Edição em lote no calendário ─────────────────────────────────────────────

/** Dias escolhidos no calendário (até dois meses: o que a grade mostra com folga). */
const BulkDatesSchema = z.array(DateSchema).min(1).max(62)

/** Apaga o planejado de vários dias (vai para a lixeira). O que já começou a ser produzido fica. */
export const ClearPlannedDaysSchema = z.object({ kitchenId: KitchenIdSchema, dates: BulkDatesSchema })
export type ClearPlannedDays = z.infer<typeof ClearPlannedDaysSchema>

/**
 * Leva (ou copia) vários dias para outras datas mantendo o espaçamento entre eles: arrastar a
 * semana para a seguinte, repetir a semana passada. `replaceTarget` manda para a lixeira o que
 * já estava planejado no destino; sem ele, destino com preparação é recusado.
 */
export const ShiftPlannedDaysSchema = z.object({
	kitchenId: KitchenIdSchema,
	dates: BulkDatesSchema,
	offsetDays: z
		.number()
		.int()
		.min(-366)
		.max(366)
		.refine((n) => n !== 0, "Escolha outro dia de destino"),
	mode: z.enum(["move", "copy"]),
	replaceTarget: z.boolean().default(false),
})
export type ShiftPlannedDays = z.infer<typeof ShiftPlannedDaysSchema>

/** Troca uma preparação por outra em todos os itens dela nos dias escolhidos, com o motivo. */
export const ReplaceRecipeInDaysSchema = z.object({
	kitchenId: KitchenIdSchema,
	dates: BulkDatesSchema,
	fromRecipeId: UuidSchema,
	toRecipeId: UuidSchema,
	rationale: z.string().trim().min(1).max(300),
})
export type ReplaceRecipeInDays = z.infer<typeof ReplaceRecipeInDaysSchema>

/** Leva à versão vigente as preparações dos dias escolhidos que ficaram numa versão superada. */
export const RefreshRecipeVersionsInDaysSchema = z.object({ kitchenId: KitchenIdSchema, dates: BulkDatesSchema })
export type RefreshRecipeVersionsInDays = z.infer<typeof RefreshRecipeVersionsInDaysSchema>

/** Efetivo de várias refeições (dias selecionados), com o valor que a tela viu em cada uma. */
export const SetHeadcountInDaysSchema = z.object({
	kitchenId: KitchenIdSchema,
	entries: z
		.array(
			z.object({
				dailyMenuId: UuidSchema,
				forecastedHeadcount: z.number().int().positive(),
				/** Efetivo que a tela mostrava; `null` = vazio. Diferente do atual, a refeição fica. */
				expected: z.number().int().nonnegative().nullish(),
			})
		)
		.min(1)
		.max(400),
})
export type SetHeadcountInDays = z.infer<typeof SetHeadcountInDaysSchema>
