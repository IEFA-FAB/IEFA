/**
 * Tools MCP — Equipamentos.
 *
 * Wrappers finos sobre a superfície de agente de `@iefa/sisub-domain/agent`, a MESMA que o
 * chat dos módulos consome: entrada (schema Zod), teto e projeção definidos uma vez só. Foi a
 * duplicação desses três que fez chat e MCP divergirem em `list_recipes`.
 *
 * As três perguntas são tools distintas de propósito. Cruzar "o que a cozinha tem" com "o que
 * a preparação exige" em prosa é pedir que o modelo refaça o emparelhamento, e ele erra
 * exatamente onde o cálculo é sutil: o multifuncional que sabe quatro papéis mas exerce dois
 * por vez, e o volume, que vira RODADAS do mesmo forno em vez de mais fornos.
 */

import { toJsonSchema } from "@iefa/sisub-domain"
import {
	AgentCheckMenuEquipmentSchema,
	AgentCheckRecipeEquipmentSchema,
	AgentListEquipmentCatalogSchema,
	AgentListKitchenEquipmentSchema,
	AgentRecipeEquipmentSchema,
	agentCheckMenuEquipment,
	agentCheckRecipeEquipment,
	agentGetRecipeEquipment,
	agentListEquipmentCatalog,
	agentListKitchenEquipment,
} from "@iefa/sisub-domain/agent"
import { resolveCredential } from "../auth.ts"
import { getDb } from "../db.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_kitchen_equipment
// ---------------------------------------------------------------------------

const listKitchenEquipmentTool: ToolDefinition = {
	schema: {
		name: "list_kitchen_equipment",
		description:
			"Lista o parque de equipamentos instalado numa cozinha: como cada um é chamado, modelo, capacidade, as funções que assume e quantas zonas independentes tem (um iVario Pro 2-S tem duas cubas: assume várias funções, duas por vez). Requer permissão kitchen ou kitchen-production nível 1 naquela cozinha.",
		inputSchema: toJsonSchema(AgentListKitchenEquipmentSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AgentListKitchenEquipmentSchema.parse(args)
			const { items, ...rest } = await agentListKitchenEquipment(getDb(), ctx, input)
			return toolResult({ equipment: items, ...rest })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_recipe_equipment
// ---------------------------------------------------------------------------

const getRecipeEquipmentTool: ToolDefinition = {
	schema: {
		name: "get_recipe_equipment",
		description:
			"Lista o que UMA BATELADA de uma preparação exige de equipamento: papel (qualquer modelo que o assuma) ou modelo específico, quantidade simultânea e capacidade mínima. Volume não muda esta lista — 900 porções de uma receita que rende 100 são nove rodadas do mesmo forno, não nove fornos.",
		inputSchema: toJsonSchema(AgentRecipeEquipmentSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AgentRecipeEquipmentSchema.parse(args)
			const { items, ...counts } = await agentGetRecipeEquipment(getDb(), ctx, input)
			return toolResult({ requirements: items, ...counts })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// check_recipe_equipment
// ---------------------------------------------------------------------------

const checkRecipeEquipmentTool: ToolDefinition = {
	schema: {
		name: "check_recipe_equipment",
		description:
			"Verifica se uma cozinha consegue produzir uma preparação: o que falta de equipamento e, quando as porções são informadas, em quantas rodadas o volume cabe. Distingue 'parque não cadastrado' de 'parque insuficiente' — não afirme falta quando a cozinha ainda não cadastrou equipamento nenhum.",
		inputSchema: toJsonSchema(AgentCheckRecipeEquipmentSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AgentCheckRecipeEquipmentSchema.parse(args)
			return toolResult(await agentCheckRecipeEquipment(getDb(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// check_menu_equipment
// ---------------------------------------------------------------------------

const checkMenuEquipmentTool: ToolDefinition = {
	schema: {
		name: "check_menu_equipment",
		description:
			"Verifica a disputa de equipamento entre as preparações da MESMA refeição. Cada ficha isolada pode caber e o almoço não caber: três pratos pedindo forno combinado numa cozinha com um forno. Devolve quais preparações competem por cada equipamento.",
		inputSchema: toJsonSchema(AgentCheckMenuEquipmentSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AgentCheckMenuEquipmentSchema.parse(args)
			return toolResult(await agentCheckMenuEquipment(getDb(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// list_equipment_catalog
// ---------------------------------------------------------------------------

const listEquipmentCatalogTool: ToolDefinition = {
	schema: {
		name: "list_equipment_catalog",
		description:
			"Lista o catálogo de equipamentos: modelos (fabricante, capacidade, zonas independentes e funções que assumem) e o vocabulário completo de funções. É por esse vocabulário que a preparação declara o que exige.",
		inputSchema: toJsonSchema(AgentListEquipmentCatalogSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AgentListEquipmentCatalogSchema.parse(args)
			const { items, ...rest } = await agentListEquipmentCatalog(getDb(), ctx, input)
			return toolResult({ models: items, ...rest })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const equipmentTools: ToolDefinition[] = [
	listKitchenEquipmentTool,
	getRecipeEquipmentTool,
	checkRecipeEquipmentTool,
	checkMenuEquipmentTool,
	listEquipmentCatalogTool,
]
