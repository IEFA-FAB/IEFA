/**
 * Contratos de entrada das leituras expostas a agentes de IA.
 *
 * Uma definição só, consumida pelos dois: o chat dos módulos converte com `toJsonSchema`
 * para o formato function-calling e o servidor MCP para `inputSchema`. Enquanto cada lado
 * escrevia o seu JSON Schema à mão, os dois divergiam em silêncio — e divergiram: o chat
 * ordenava por uma coluna inexistente e listava versões repetidas que a dedup do domínio
 * já resolvia.
 *
 * **Todo parâmetro opcional é `.nullish()`, não `.optional()`.** Modelo não omite campo: ele
 * preenche com `null` (`{"limit":2,"search":null}` é o que o llama-3.3 mandou de verdade).
 * Com `.optional()` puro o engine do @tanstack/ai rejeitava a chamada — o schema Zod viaja
 * junto do JSON Schema e é ele quem valida os argumentos. O modelo lia o erro, tentava de
 * novo com sintaxe de function call quebrada, e o provider matava a run inteira com um 400
 * `tool_use_failed`. `null` aqui significa "não informado"; quem consome normaliza com
 * `?? undefined`.
 */

import { z } from "zod"
import { KitchenIdSchema } from "../schemas/common.ts"
import { AGENT_LIST_MAX } from "./budget.ts"

const LimitSchema = z.number().int().positive().max(AGENT_LIST_MAX).nullish().describe(`Quantos itens retornar (máximo ${AGENT_LIST_MAX})`)

export const AgentListRecipesSchema = z.object({
	kitchenId: KitchenIdSchema.nullish().describe("ID da cozinha — retorna as receitas globais mais as locais dessa cozinha"),
	search: z.string().max(200).nullish().describe("Busca parcial no nome, sem distinguir caixa"),
	limit: LimitSchema,
})
export type AgentListRecipes = z.infer<typeof AgentListRecipesSchema>

export const AgentListIngredientsSchema = z.object({
	search: z.string().max(200).nullish().describe("Busca parcial na descrição, sem distinguir caixa"),
	folderId: z.uuid().nullish().describe("ID da pasta/categoria"),
	limit: LimitSchema,
})
export type AgentListIngredients = z.infer<typeof AgentListIngredientsSchema>

export const AgentListPreparationsSchema = z.object({
	search: z.string().max(200).nullish().describe("Busca parcial na descrição, sem distinguir caixa"),
	limit: LimitSchema,
})
export type AgentListPreparations = z.infer<typeof AgentListPreparationsSchema>

// ── Equipamento ───────────────────────────────────────────────────────────

export const AgentListKitchenEquipmentSchema = z.object({
	kitchenId: KitchenIdSchema.describe("ID da cozinha cujo parque instalado será listado"),
	includeInactive: z.boolean().nullish().describe("Inclui equipamento em manutenção ou baixado. Por padrão só o ativo, que é o que produz"),
	limit: LimitSchema,
})
export type AgentListKitchenEquipment = z.infer<typeof AgentListKitchenEquipmentSchema>

export const AgentRecipeEquipmentSchema = z.object({
	recipeId: z.uuid().describe("ID da preparação"),
})
export type AgentRecipeEquipment = z.infer<typeof AgentRecipeEquipmentSchema>

export const AgentCheckRecipeEquipmentSchema = z.object({
	recipeId: z.uuid().describe("ID da preparação"),
	kitchenId: KitchenIdSchema.describe("ID da cozinha que produziria"),
	portions: z
		.number()
		.positive()
		.max(1_000_000)
		.nullish()
		.describe("Quantas porções produzir. Sem isto responde só se a cozinha TEM o equipamento; com isto acrescenta bateladas e rodadas"),
})
export type AgentCheckRecipeEquipment = z.infer<typeof AgentCheckRecipeEquipmentSchema>

export const AgentCheckMenuEquipmentSchema = z.object({
	dailyMenuId: z.uuid().describe("ID do cardápio do dia (uma refeição de uma cozinha numa data)"),
})
export type AgentCheckMenuEquipment = z.infer<typeof AgentCheckMenuEquipmentSchema>

export const AgentListEquipmentCatalogSchema = z.object({
	kitchenId: KitchenIdSchema.nullish().describe("Inclui os modelos próprios dessa cozinha além do catálogo global"),
	roleId: z.uuid().nullish().describe("Só modelos que assumem este papel"),
	search: z.string().max(200).nullish().describe("Busca parcial no nome do modelo, sem distinguir caixa"),
	limit: LimitSchema,
})
export type AgentListEquipmentCatalog = z.infer<typeof AgentListEquipmentCatalogSchema>
