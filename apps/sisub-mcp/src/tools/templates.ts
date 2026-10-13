/**
 * Tools MCP — Módulo Templates Semanais
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 */

import {
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
	ListTemplatesSchema,
	listDeletedTemplates,
	listTemplates,
	RestoreTemplateSchema,
	restoreTemplate,
	SaveTemplateEditSchema,
	saveTemplateEdit,
	toJsonSchema,
} from "@iefa/sisub-domain"
import { AGENT_APPLY_TEMPLATE_MAX_DATES, AgentApplyTemplateSchema, agentApplyTemplate, agentGetTemplateItems } from "@iefa/sisub-domain/agent"
import type { z } from "zod"
import { resolveCredential } from "../auth.ts"
import { getDb } from "../db.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_menu_templates
// ---------------------------------------------------------------------------

const listMenuTemplates: ToolDefinition = {
	schema: {
		name: "list_menu_templates",
		description:
			"Lista os templates de cardápio semanal ativos disponíveis para uma cozinha. Retorna templates globais (SDAB, kitchen_id null) e templates locais da cozinha informada. Inclui contagem de itens por template. `template_type` distingue: weekly (cardápio semanal), event (evento) e apoio (cardápio de apoio: lanches de bordo/apoio do Módulo 7, coffee break, café de reunião).",
		inputSchema: toJsonSchema(ListTemplatesSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListTemplatesSchema.parse(args ?? {})
			return toolResult(await listTemplates(getDb(), ctx, input))
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
			return toolResult(await listDeletedTemplates(getDb(), ctx, input))
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
			"Retorna um template por ID: metadados, efetivo base por dia/refeição e os itens com a receita pelo nome. O usuário deve ter permissão de leitura na cozinha do template. Para a ficha técnica de um prato, chame get_recipe.",
		inputSchema: toJsonSchema(GetTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = GetTemplateSchema.parse(args)
			// Metadados da operation, itens da projeção de agente: `getTemplate` devolve a linha
			// completa da receita em cada item e um template semanal cheio tem ~100 itens — o
			// resultado batia no teto de payload e o cliente MCP não recebia nada.
			const [{ items: _items, ...template }, items] = await Promise.all([getTemplate(getDb(), ctx, input), agentGetTemplateItems(getDb(), ctx, input)])
			return toolResult({ ...template, items })
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
			"Retorna os itens de um template semanal, por dia_da_semana e tipo_de_refeição, com a receita pelo nome. Útil para visualizar o template antes de aplicá-lo. Para a ficha técnica de um prato, chame get_recipe.",
		inputSchema: toJsonSchema(GetTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = GetTemplateSchema.parse(args)
			return toolResult(await agentGetTemplateItems(getDb(), ctx, input))
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
			"Cria um novo template de cardápio com metadados e opcionalmente seus itens. Se a inserção dos itens falhar, o template é removido (rollback compensatório). kitchen_id=null cria um template global (SDAB). `template_type` distingue: weekly (cardápio semanal), event (evento) e apoio (cardápio de apoio: lanches de bordo/apoio do Módulo 7, coffee break, café de reunião). Evento e apoio têm refeições próprias em `eventMeals` (id UUID gerado por você, nome, mealTypeId = horário do calendário, groups = composição como entradas/volantes, com minItems/maxItems opcionais = quantas preparações o grupo espera, baseHeadcount = efetivo da refeição, ou kits no apoio); cada item cita a refeição em `eventMealId` e usa um grupo da composição dela (apoio simples: uma refeição 'Kit' sem grupos). O item se dimensiona por `headcountOverride` (pessoas) ou `recommendedProportion` (% do efetivo da refeição; no apoio, porções por kit × 100: 200 = 2 por kit). Template GLOBAL (kitchen_id=null) guarda só quantidade relativa: headcountOverride, baseHeadcount e expectedMonthlyOccurrences são recusados (GLOBAL_TEMPLATE_ABSOLUTE_QUANTITY) — o número é da cozinha. Evento GLOBAL é uma variante de UMA refeição (GLOBAL_EVENT_SINGLE_MEAL): café da manhã, brunch, almoço, coquetel e jantar de um padrão são modelos separados; `folderId` põe o modelo na pasta do catálogo (ex.: Padrão B › Coquetel), e dois modelos da mesma pasta não podem ter o mesmo nome.",
		inputSchema: toJsonSchema(CreateTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateTemplateSchema.parse(args)
			return toolResult(await createTemplate(getDb(), ctx, input))
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
		description:
			"Cria um template vazio (sem itens) para uma cozinha. Use update_template para adicionar itens depois. `template_type` distingue: weekly (cardápio semanal), event (evento) e apoio (cardápio de apoio: lanches de bordo/apoio do Módulo 7, coffee break, café de reunião). Template global não aceita expectedMonthlyOccurrences.",
		inputSchema: toJsonSchema(CreateBlankTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = CreateBlankTemplateSchema.parse(args)
			return toolResult(await createBlankTemplate(getDb(), ctx, input))
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
			"Cria uma cópia local de um template existente (global ou de outra cozinha), registrando base_template_id. Da cópia de um template GLOBAL vêm preparações, grupos, refeições e proporções, sem efetivo, pax nem ocorrências por mês: a cozinha os informa depois. Entre cozinhas, a cópia leva tudo. Em evento/apoio, `occasionMealIds` escolhe quais refeições do template levar (ausente = todas): serve a evento da cozinha e a kit de apoio com mais de uma parte, porque o evento global tem uma refeição só. Cada refeição copiada guarda o modelo de origem.",
		inputSchema: toJsonSchema(ForkTemplateSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ForkTemplateSchema.parse(args)
			return toolResult(await forkTemplate(getDb(), ctx, input))
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
			"Atualiza metadados de um template e, opcionalmente, substitui TODOS os seus itens (delete-all + re-insert). Se items for omitido, apenas os metadados são atualizados. Se items=[] vazio, todos os itens são removidos. Exige `context`: com {scope:'kitchen',kitchenId} a edição de um template GLOBAL não o altera — cria uma cópia local daquela cozinha. Com {scope:'global'} edita o template global (exige permissão global nível 2). Em evento, `eventMeals` substitui TODAS as refeições do evento (a que não vier sai com os itens dela; omita para não mexer) e todo item precisa de `eventMealId`. Se a cozinha já tem a cópia de um evento global, envie eventMeals e items juntos. Em `eventMeals`, omitir `baseHeadcount` preserva o efetivo gravado; `null` o limpa. Apoio tem refeições próprias como o evento. Com {scope:'global'} não mande headcountOverride, meals com efetivo, baseHeadcount nem expectedMonthlyOccurrences: template global é só relativo; e evento global tem no máximo uma refeição em eventMeals.",
		inputSchema: toJsonSchema(SaveTemplateEditSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = SaveTemplateEditSchema.parse(args)
			return toolResult(await saveTemplateEdit(getDb(), ctx, input))
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
			await deleteTemplate(getDb(), ctx, input)
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
			await restoreTemplate(getDb(), ctx, input)
			return toolResult({ success: true, templateId: input.templateId, message: "Template restaurado com sucesso" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// apply_template
// ---------------------------------------------------------------------------

/**
 * Contrato de agente (`@iefa/sisub-domain/agent`), o mesmo do chat do sisub: só preenche
 * refeição vazia e no máximo {@link AGENT_APPLY_TEMPLATE_MAX_DATES} datas por chamada.
 *
 * Antes esta tool expunha o `ApplyTemplateSchema` da tela: `conflictMode: "replace"` num
 * intervalo `startDate`/`endDate` sem teto. Um texto injetado numa receita ou num nome de
 * template podia mandar o planejamento de meses para a lixeira numa chamada. Substituir fica
 * na tela, que mostra a prévia do que sai.
 *
 * O `.strict()` é só daqui: sem ele o zod 4 descarta `conflictMode`/`startDate` calado e a
 * chamada roda diferente do que o cliente pediu. Recusar diz ao cliente qual é a entrada nova.
 */
const ApplyTemplateToolSchema = AgentApplyTemplateSchema.strict()

const applyTemplateTool: ToolDefinition = {
	schema: {
		name: "apply_template",
		description: `Aplica um template semanal a datas de uma cozinha, no máximo ${AGENT_APPLY_TEMPLATE_MAX_DATES} datas por chamada.

Datas: informe \`targetDates\` com as datas exatas (YYYY-MM-DD). Só essas datas são tocadas;
para mais de ${AGENT_APPLY_TEMPLATE_MAX_DATES} datas, faça uma chamada por mês. \`startDate\`,
\`endDate\`, \`dates\` e \`conflictMode\` não são aceitos.

Só PREENCHE refeições que ainda não têm cardápio: o planejamento existente, inclusive ajustes
manuais, é preservado. Esta ferramenta nunca apaga nem substitui cardápio; para substituir,
oriente o usuário a aplicar pela tela de planejamento do sisub, que mostra a prévia do que vai
para a lixeira. Na resposta, \`datesSkipped\` lista as datas que já tinham refeição planejada.

startDayOfWeek (1=seg … 7=dom) é o dia da semana em que cai o dia 1 do template: as datas nesse dia da semana recebem o dia 1, as do dia seguinte o dia 2, e assim por diante.

O template deve ser semanal e global (SDAB) ou da mesma cozinha de destino.

Efetivo: \`headcounts\` ([{mealTypeId, headcount}]) informa o efetivo de cada refeição para
esta aplicação (o mesmo em todos os dias) e vence o do template. Template global não tem
efetivo, então informe-o aqui; \`headcount: null\` ou refeição sem efetivo deixa o dia com
"efetivo a definir", e as porções são calculadas quando o efetivo for informado.

Exemplo: aplicar um template de 7 dias começando segunda-feira (startDayOfWeek=1) na semana
de 13/04/2026: targetDates=["2026-04-13","2026-04-14", … ,"2026-04-19"].`,
		inputSchema: toJsonSchema(ApplyTemplateToolSchema),
	},
	async handler(args, credential) {
		// `safeParse` e não `parse`: o `ZodError` cairia no "Erro interno" do `handleToolError`,
		// e o cliente que ainda manda `startDate`/`conflictMode` precisa ler o que mudou. A
		// recusa vem antes da credencial porque não toca em dado nenhum.
		const parsed = ApplyTemplateToolSchema.safeParse(args)
		if (!parsed.success) return toolError(describeApplyTemplateInputError(parsed.error))
		try {
			const ctx = await resolveCredential(credential)
			return toolResult(await agentApplyTemplate(getDb(), ctx, parsed.data))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

/** Recusa de entrada que diz o caminho: `targetDates`, teto de datas e substituição só na tela. */
function describeApplyTemplateInputError(error: z.ZodError): string {
	const issues = error.issues.map((issue) => `${issue.path.length > 0 ? issue.path.map(String).join(".") : "entrada"}: ${issue.message}`).join("; ")
	return `Entrada inválida para apply_template (${issues}). Informe targetDates com até ${AGENT_APPLY_TEMPLATE_MAX_DATES} datas YYYY-MM-DD; startDate, endDate, dates e conflictMode não são aceitos. A ferramenta só preenche refeições vazias: substituir cardápio existente é só pela tela de planejamento.`
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
