import { z } from "zod"
import { DateSchema, EditScopeSchema, KitchenIdSchema, MenuGroupKeySchema, RecommendedProportionSchema, UuidSchema } from "./common.ts"
import { MenuGroupSchema } from "./menu-groups.ts"

export const ListTemplatesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type ListTemplates = z.infer<typeof ListTemplatesSchema>

export const GetTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type GetTemplate = z.infer<typeof GetTemplateSchema>

/** Regimes de cardápio: rotina semanal, evento pontual, exceção previsível. */
export const TemplateTypeSchema = z.enum(["weekly", "event", "exception"])
export type TemplateType = z.infer<typeof TemplateTypeSchema>

/** Ocorrências mensais esperadas — só faz sentido para exceção; multiplica o custeio na Ata. */
export const ExpectedMonthlyOccurrencesSchema = z.number().int().positive()

export const TemplateItemSchema = z.object({
	dayOfWeek: z.number().int().min(1).max(7),
	mealTypeId: UuidSchema,
	recipeId: UuidSchema,
	/**
	 * `.nullish()`, não `.optional()`: este objeto vive DENTRO de um array exposto a modelo
	 * (`create_template`/`update_template`), e o `dropUnexpectedNulls` do despacho não desce
	 * em array de propósito — posição em array é significativa. Um `headcountOverride: null`
	 * aninhado chegava ao Zod e matava a chamada com `tool_use_failed`, sem mensagem.
	 * `buildTemplateItemRows` já trata `null` como ausência (`!= null`).
	 */
	headcountOverride: z.number().int().positive().nullish(),
	/** Grupo canônico dentro da refeição (prato principal, guarnição, …). */
	itemGroup: MenuGroupKeySchema.nullable().optional(),
	/** Posição dentro do grupo, dentro da célula (dia+refeição). `null` cai no índice do array. */
	sortOrder: z.number().int().nonnegative().nullish(),
	/** Proporção recomendada de consumo (%), advisory. */
	recommendedProportion: RecommendedProportionSchema.nullable(),
	/**
	 * Refeição do evento a que o item pertence — obrigatória em template de evento, proibida
	 * nos demais. Num item de evento o `mealTypeId` enviado é ignorado: quem manda é o horário
	 * da refeição (`TemplateEventMealSchema.mealTypeId`). `.nullish()` pelo mesmo motivo de
	 * `headcountOverride`: vive dentro de array exposto a modelo.
	 */
	eventMealId: UuidSchema.nullish(),
})
export type TemplateItem = z.infer<typeof TemplateItemSchema>

/** Teto de refeições num evento e de grupos na composição de cada uma — freio, não regra da norma. */
export const MAX_EVENT_MEALS = 30
export const MAX_EVENT_MEAL_GROUPS = 20

/**
 * Refeição PRÓPRIA de um evento (coquetel, jantar de gala…). O evento tem zero ou mais, e cada
 * uma tem nome, horário no calendário e composição próprios — nada disso é compartilhado com
 * os tipos de refeição do rancho nem com os conjuntos de grupos deles.
 */
export const TemplateEventMealSchema = z.object({
	/**
	 * Id estável da refeição, gerado por quem a cria (o editor). É o que os itens citam em
	 * `eventMealId` no mesmo payload, antes de a refeição existir no banco.
	 */
	id: UuidSchema,
	name: z.string().trim().min(1).max(80),
	/** Horário do calendário em que a refeição é servida — onde o "Aplicar ao calendário" põe os itens. */
	mealTypeId: UuidSchema,
	/** Composição: as colunas da refeição, na ordem de leitura. Chave repetida é recusada. */
	groups: z.array(MenuGroupSchema).min(1).max(MAX_EVENT_MEAL_GROUPS),
})
export type TemplateEventMeal = z.infer<typeof TemplateEventMealSchema>

/** Efetivo base por (dia + refeição) do template. headcount_override do item é exceção. */
export const TemplateMealSchema = z.object({
	dayOfWeek: z.number().int().min(1).max(7),
	mealTypeId: UuidSchema,
	baseHeadcount: z.number().int().positive().nullable(),
})
export type TemplateMeal = z.infer<typeof TemplateMealSchema>

export const CreateTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	templateType: TemplateTypeSchema,
	expectedMonthlyOccurrences: ExpectedMonthlyOccurrencesSchema.nullable().optional(),
	items: z.array(TemplateItemSchema).optional(),
	meals: z.array(TemplateMealSchema).optional(),
	/** Só em evento. A ordem do array é a ordem das refeições no evento. */
	eventMeals: z.array(TemplateEventMealSchema).max(MAX_EVENT_MEALS).optional(),
})
export type CreateTemplate = z.infer<typeof CreateTemplateSchema>

export const CreateBlankTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	templateType: TemplateTypeSchema,
	expectedMonthlyOccurrences: ExpectedMonthlyOccurrencesSchema.nullable().optional(),
})
export type CreateBlankTemplate = z.infer<typeof CreateBlankTemplateSchema>

export const ForkTemplateSchema = z.object({
	sourceTemplateId: UuidSchema,
	targetKitchenId: KitchenIdSchema.optional(),
	newName: z.string().min(1).optional(),
	description: z.string().optional(),
})
export type ForkTemplate = z.infer<typeof ForkTemplateSchema>

export const UpdateTemplateSchema = z.object({
	templateId: UuidSchema,
	name: z.string().min(1).optional(),
	// nullable: null limpa a descrição; undefined = não mexe.
	description: z.string().nullable().optional(),
	templateType: TemplateTypeSchema.optional(),
	expectedMonthlyOccurrences: ExpectedMonthlyOccurrencesSchema.nullable().optional(),
	items: z.array(TemplateItemSchema).optional(),
	meals: z.array(TemplateMealSchema).optional(),
	/**
	 * Só em evento. Ausente = não mexe nas refeições. Presente = substitui a lista inteira: a
	 * refeição que não vier SAI, e leva junto os itens dela. Pelo mesmo motivo de `items`,
	 * não aceita `null` — "não mexi" e "apague as refeições" não podem ser a mesma coisa.
	 */
	eventMeals: z.array(TemplateEventMealSchema).max(MAX_EVENT_MEALS).optional(),
})
export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>

/**
 * Edição de template com o contexto declarado — mesma regra das preparações.
 *
 * `menu_template` NÃO é versionado: sem isso, a edição de um template global feita na tela
 * de uma cozinha sobrescrevia in-place o plano da FAB inteira, sem histórico.
 */
export const SaveTemplateEditSchema = UpdateTemplateSchema.extend({
	context: EditScopeSchema,
})
export type SaveTemplateEdit = z.infer<typeof SaveTemplateEditSchema>

export const DeleteTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type DeleteTemplate = z.infer<typeof DeleteTemplateSchema>

export const RestoreTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type RestoreTemplate = z.infer<typeof RestoreTemplateSchema>

export const ApplyTemplateSchema = z.object({
	templateId: UuidSchema,
	kitchenId: KitchenIdSchema,
	startDate: DateSchema,
	endDate: DateSchema,
	startDayOfWeek: z.number().int().min(1).max(7),
	/**
	 * Datas EXATAS a materializar. Quando vem preenchido, `startDate`/`endDate` só delimitam
	 * a janela — quem manda é esta lista.
	 *
	 * Existe porque o calendário deixa escolher dias soltos (ctrl+clique): colapsar a escolha
	 * em intervalo fazia "aplicar no dia 3 e no dia 20" tocar os dezoito dias no meio, e no
	 * modo "replace" isso APAGA o planejamento deles.
	 */
	dates: z.array(DateSchema).min(1).optional(),
	/**
	 * O que fazer com datas que já têm planejamento ativo:
	 * - "skip" (default): preserva o dia como está (inclusive ajustes manuais) e só materializa os vazios.
	 * - "replace": soft-delete do planejamento daquelas datas e re-materialização.
	 *
	 * O default é o preservador: o destrutivo tem de ser pedido. Antes era o contrário, e
	 * qualquer chamador que esquecesse o campo apagava o dia do usuário.
	 */
	conflictMode: z.enum(["replace", "skip"]).optional(),
})
export type ApplyTemplate = z.infer<typeof ApplyTemplateSchema>

/**
 * Materializa um evento/exceção em datas concretas do calendário. Diferente do
 * applyTemplate semanal, é ADITIVO: soma itens ao cardápio existente do dia sem
 * apagar o planejamento rotineiro.
 */
export const ApplyEventTemplateSchema = z.object({
	templateId: UuidSchema,
	kitchenId: KitchenIdSchema,
	dates: z.array(DateSchema).min(1),
})
export type ApplyEventTemplate = z.infer<typeof ApplyEventTemplateSchema>
