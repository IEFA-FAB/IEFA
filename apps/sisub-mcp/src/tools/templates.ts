/**
 * Tools MCP — Módulo Templates Semanais
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 */

import {
	ApplyTemplateSchema,
	applyTemplate,
	CreateBlankTemplateSchema,
	CreateTemplateSchema,
	createBlankTemplate,
	createTemplate,
	DeleteTemplateSchema,
	deleteTemplate,
	ForkTemplateSchema,
	forkTemplate,
	GetTemplateSchema,
	getTemplate,
	getTemplateItems,
	ListTemplatesSchema,
	listDeletedTemplates,
	listTemplates,
	RestoreTemplateSchema,
	restoreTemplate,
	toJsonSchema,
	UpdateTemplateSchema,
	updateTemplate,
} from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_menu_templates
// ---------------------------------------------------------------------------

const listMenuTemplates: ToolDefinition = {
	schema: {
		name: "list_menu_templates",
		description:
			"Lista os templates de cardápio semanal ativos disponíveis para uma cozinha. Retorna templates globais (SDAB, kitchen_id null) e templates locais da cozinha informada. Inclui contagem de itens por template.",
		inputSchema: toJsonSchema(ListTemplatesSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListTemplatesSchema.parse(args ?? {})
			return toolResult(await listTemplates(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// list_deleted_templates
// ---------------------------------------------------------------------------

const listDeletedTemplatesTool: ToolDefinition = {
	schema: {
		name: "list_deleted_templates",
		description: "Lista os templates de cardápio removidos (soft-deleted) de uma cozinha, ordenados por data de remoção. Use restore_template para recuperar.",
		inputSchema: toJsonSchema(ListTemplatesSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListTemplatesSchema.parse(args ?? {})
			return toolResult(await listDeletedTemplates(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_template
// ---------------------------------------------------------------------------

const getTemplateTool: ToolDefinition = {
	schema: {
		name: "get_template",
		description:
			"Retorna um template completo (metadados + todos os itens com receitas) por ID. O usuário deve ter permissão de leitura na cozinha do template.",
		inputSchema: toJsonSchema(GetTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = GetTemplateSchema.parse(args)
			return toolResult(await getTemplate(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_template_items
// ---------------------------------------------------------------------------

const getTemplateItemsTool: ToolDefinition = {
	schema: {
		name: "get_template_items",
		description:
			"Retorna todos os itens (receitas) de um template semanal, organizados por dia_da_semana e tipo_de_refeição. Útil para visualizar o template antes de aplicá-lo.",
		inputSchema: toJsonSchema(GetTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = GetTemplateSchema.parse(args)
			return toolResult(await getTemplateItems(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// create_template
// ---------------------------------------------------------------------------

const createTemplateTool: ToolDefinition = {
	schema: {
		name: "create_template",
		description:
			"Cria um novo template de cardápio com metadados e opcionalmente seus itens. Se a inserção dos itens falhar, o template é removido (rollback compensatório). kitchen_id=null cria um template global (SDAB).",
		inputSchema: toJsonSchema(CreateTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateTemplateSchema.parse(args)
			return toolResult(await createTemplate(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// create_blank_template
// ---------------------------------------------------------------------------

const createBlankTemplateTool: ToolDefinition = {
	schema: {
		name: "create_blank_template",
		description: "Cria um template vazio (sem itens) para uma cozinha. Use update_template para adicionar itens depois.",
		inputSchema: toJsonSchema(CreateBlankTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateBlankTemplateSchema.parse(args)
			return toolResult(await createBlankTemplate(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// fork_template
// ---------------------------------------------------------------------------

const forkTemplateTool: ToolDefinition = {
	schema: {
		name: "fork_template",
		description:
			"Cria uma cópia local de um template existente (global ou de outra cozinha), registrando base_template_id. Os itens são copiados sem headcount_override. Se a inserção dos itens falhar, o template novo é removido (rollback compensatório).",
		inputSchema: toJsonSchema(ForkTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ForkTemplateSchema.parse(args)
			return toolResult(await forkTemplate(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// update_template
// ---------------------------------------------------------------------------

const updateTemplateTool: ToolDefinition = {
	schema: {
		name: "update_template",
		description:
			"Atualiza metadados de um template e, opcionalmente, substitui TODOS os seus itens (delete-all + re-insert). Se items for omitido, apenas os metadados são atualizados. Se items=[] vazio, todos os itens são removidos.",
		inputSchema: toJsonSchema(UpdateTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = UpdateTemplateSchema.parse(args)
			return toolResult(await updateTemplate(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// delete_template
// ---------------------------------------------------------------------------

const deleteTemplateTool: ToolDefinition = {
	schema: {
		name: "delete_template",
		description: "Soft-delete de um template (define deleted_at). Os itens são preservados e o template pode ser recuperado com restore_template.",
		inputSchema: toJsonSchema(DeleteTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = DeleteTemplateSchema.parse(args)
			await deleteTemplate(getDataClient(), ctx, input)
			return toolResult({ success: true, templateId: input.templateId, message: "Template removido (pode ser restaurado com restore_template)" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// restore_template
// ---------------------------------------------------------------------------

const restoreTemplateTool: ToolDefinition = {
	schema: {
		name: "restore_template",
		description: "Restaura um template soft-deleted, limpando deleted_at. Use list_deleted_templates para obter os IDs disponíveis.",
		inputSchema: toJsonSchema(RestoreTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = RestoreTemplateSchema.parse(args)
			await restoreTemplate(getDataClient(), ctx, input)
			return toolResult({ success: true, templateId: input.templateId, message: "Template restaurado com sucesso" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// apply_template
// ---------------------------------------------------------------------------

const applyTemplateTool: ToolDefinition = {
	schema: {
		name: "apply_template",
		description: `Aplica um template semanal a um intervalo de datas de uma cozinha.
Para cada data entre startDate e endDate:
  1. Soft-deletes os daily_menus existentes nessa data (para a cozinha)
  2. Calcula qual dia do template corresponde à data (baseado em startDayOfWeek)
  3. Cria novos daily_menus com os itens do template

startDayOfWeek indica qual dia do template (1=seg … 7=dom) corresponde à startDate.

O template deve ser global (SDAB) ou pertencer à mesma cozinha de destino.

Exemplo: aplicar um template de 7 dias começando segunda-feira (startDayOfWeek=1)
com startDate=2026-04-13 e endDate=2026-04-19 gera uma semana completa.`,
		inputSchema: toJsonSchema(ApplyTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ApplyTemplateSchema.parse(args)
			return toolResult(await applyTemplate(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const templateTools: ToolDefinition[] = [
	listMenuTemplates,
	listDeletedTemplatesTool,
	getTemplateTool,
	getTemplateItemsTool,
	createTemplateTool,
	createBlankTemplateTool,
	forkTemplateTool,
	updateTemplateTool,
	deleteTemplateTool,
	restoreTemplateTool,
	applyTemplateTool,
]
