/**
 * MCP Server factory — cria e configura um Server MCP com todas as tools,
 * resources e prompts do módulo Kitchen Planning do sisub.
 *
 * O JWT do usuário é capturado em closure na criação do servidor.
 * Cada chamada de tool faz: resolveUserContext(jwt) → valida token → verifica PBAC.
 *
 * Uso:
 *   const server = createMcpServer(jwt)
 *   await server.connect(transport)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
	CallToolRequestSchema,
	ErrorCode,
	GetPromptRequestSchema,
	ListPromptsRequestSchema,
	ListResourcesRequestSchema,
	ListToolsRequestSchema,
	McpError,
	ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { resolveUserContext } from "./auth.ts"
import { getDataClient } from "./supabase.ts"
import { planningTools } from "./tools/planning.ts"
import { requireKitchenPermission, safeInt } from "./tools/shared.ts"
import { templateTools } from "./tools/templates.ts"

// Todas as tools registradas (planning + templates)
const allTools = [...planningTools, ...templateTools]

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMcpServer(jwt: string): Server {
	const server = new Server(
		{ name: "sisub-mcp", version: "0.1.0" },
		{
			capabilities: {
				tools: {},
				resources: {},
				prompts: {},
			},
		}
	)

	// ── Tools ─────────────────────────────────────────────────────────────────

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: allTools.map((t) => t.schema),
	}))

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args = {} } = request.params

		const tool = allTools.find((t) => t.schema.name === name)
		if (!tool) {
			throw new McpError(ErrorCode.MethodNotFound, `Tool não encontrada: ${name}`)
		}

		return tool.handler(args, jwt)
	})

	// ── Resources ─────────────────────────────────────────────────────────────

	server.setRequestHandler(ListResourcesRequestSchema, async () => ({
		resources: [
			{
				uri: "sisub://kitchen/{kitchenId}/today",
				name: "Cardápio de hoje",
				description: "Cardápio completo do dia atual para uma cozinha, com todos os itens e receitas.",
				mimeType: "application/json",
			},
			{
				uri: "sisub://kitchen/{kitchenId}/planning/{year}/{month}",
				name: "Calendário mensal",
				description: "Calendário de planejamento mensal com todos os menus e seus status.",
				mimeType: "application/json",
			},
			{
				uri: "sisub://kitchen/{kitchenId}/templates",
				name: "Templates disponíveis",
				description: "Lista de templates semanais disponíveis para a cozinha (locais + globais).",
				mimeType: "application/json",
			},
		],
	}))

	server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
		const { uri } = request.params

		// sisub://kitchen/{kitchenId}/today
		const todayMatch = uri.match(/^sisub:\/\/kitchen\/(\d+)\/today$/)
		if (todayMatch) {
			// H3: regex já garante dígitos, mas safeInt faz coerção defensiva
			const kitchenId = safeInt(todayMatch[1], "kitchenId")
			const ctx = await resolveUserContext(jwt)
			requireKitchenPermission(ctx, 1, { type: "kitchen", id: kitchenId })

			const today = new Date().toISOString().split("T")[0]
			const db = getDataClient()
			const { data, error } = await db
				.from("daily_menu")
				.select(`*, meal_type:meal_type_id(*), menu_items:menu_items(*, recipe_origin:recipe_origin_id(*))`)
				.eq("kitchen_id", kitchenId)
				.eq("service_date", today)
				.is("deleted_at", null)

			// M3: não expor mensagem de erro do banco ao cliente
			if (error) {
				process.stderr.write(`[sisub-mcp] Resource today error: ${error.message}\n`)
				throw new McpError(ErrorCode.InternalError, "Erro ao carregar cardápio de hoje. Tente novamente.")
			}

			const menus = (data ?? []).map((m) => ({
				...m,
				menu_items: (m.menu_items ?? []).filter((i: { deleted_at: string | null }) => !i.deleted_at),
			}))

			return {
				contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ date: today, kitchenId, menus }, null, 2) }],
			}
		}

		// sisub://kitchen/{kitchenId}/planning/{year}/{month}
		const planningMatch = uri.match(/^sisub:\/\/kitchen\/(\d+)\/planning\/(\d{4})\/(\d{2})$/)
		if (planningMatch) {
			const kitchenId = safeInt(planningMatch[1], "kitchenId") // H3
			const year = planningMatch[2]
			const month = planningMatch[3]
			const ctx = await resolveUserContext(jwt)
			requireKitchenPermission(ctx, 1, { type: "kitchen", id: kitchenId })

			const startDate = `${year}-${month}-01`
			const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()
			const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`

			const db = getDataClient()
			const { data, error } = await db
				.from("daily_menu")
				.select(`id, service_date, meal_type_id, status, forecasted_headcount, meal_type:meal_type_id(name)`)
				.eq("kitchen_id", kitchenId)
				.gte("service_date", startDate)
				.lte("service_date", endDate)
				.is("deleted_at", null)
				.order("service_date")
				.order("meal_type_id")

			if (error) {
				process.stderr.write(`[sisub-mcp] Resource planning error: ${error.message}\n`)
				throw new McpError(ErrorCode.InternalError, "Erro ao carregar calendário. Tente novamente.")
			}

			return {
				contents: [
					{
						uri,
						mimeType: "application/json",
						text: JSON.stringify({ year, month, kitchenId, startDate, endDate, menus: data ?? [] }, null, 2),
					},
				],
			}
		}

		// sisub://kitchen/{kitchenId}/templates
		const templatesMatch = uri.match(/^sisub:\/\/kitchen\/(\d+)\/templates$/)
		if (templatesMatch) {
			const kitchenId = safeInt(templatesMatch[1], "kitchenId") // H3
			const ctx = await resolveUserContext(jwt)
			requireKitchenPermission(ctx, 1, { type: "kitchen", id: kitchenId })

			const db = getDataClient()
			// H3: kitchenId já passou por safeInt — interpolação segura
			const { data, error } = await db
				.from("menu_template")
				.select(`*, items:menu_template_items(count)`)
				.is("deleted_at", null)
				.or(`kitchen_id.is.null,kitchen_id.eq.${kitchenId}`)
				.order("name")

			if (error) {
				process.stderr.write(`[sisub-mcp] Resource templates error: ${error.message}\n`)
				throw new McpError(ErrorCode.InternalError, "Erro ao carregar templates. Tente novamente.")
			}

			const templates = (data ?? []).map((t) => ({
				...t,
				item_count: Array.isArray(t.items) ? ((t.items[0] as { count: number } | undefined)?.count ?? 0) : 0,
			}))

			return {
				contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ kitchenId, templates }, null, 2) }],
			}
		}

		throw new McpError(ErrorCode.InvalidRequest, `Resource desconhecida: ${uri}`)
	})

	// ── Prompts ───────────────────────────────────────────────────────────────

	server.setRequestHandler(ListPromptsRequestSchema, async () => ({
		prompts: [
			{
				name: "plan_week",
				description: "Planeja um cardápio semanal completo para uma cozinha, sugerindo receitas ou aplicando templates existentes.",
				arguments: [
					{ name: "kitchenId", description: "ID da cozinha", required: true },
					{ name: "weekStartDate", description: "Data de início da semana (YYYY-MM-DD, preferencialmente uma segunda-feira)", required: true },
					{ name: "headcount", description: "Número previsto de comensais", required: true },
				],
			},
			{
				name: "apply_template_wizard",
				description: "Guia interativo para selecionar e aplicar um cardápio semanal ao próximo período de uma cozinha.",
				arguments: [{ name: "kitchenId", description: "ID da cozinha", required: true }],
			},
		],
	}))

	server.setRequestHandler(GetPromptRequestSchema, async (request) => {
		const { name, arguments: args = {} } = request.params

		switch (name) {
			case "plan_week": {
				const { kitchenId, weekStartDate, headcount } = args as Record<string, string>
				return {
					description: "Planejamento semanal de cardápio",
					messages: [
						{
							role: "user" as const,
							content: {
								type: "text" as const,
								text: `Você é um assistente especializado em planejamento de cardápios militares do sistema SISUB.

Planeje a semana de **${weekStartDate}** (7 dias) para a **cozinha ID ${kitchenId}** com **${headcount} comensais**.

Siga estas etapas:
1. Use \`list_kitchens\` para confirmar o nome da cozinha ${kitchenId}
2. Use \`get_meal_types\` para listar os tipos de refeição disponíveis
3. Use \`list_menu_templates\` com kitchenId=${kitchenId} para verificar templates existentes
4. Use \`list_recipes\` com kitchenId=${kitchenId} para ver receitas disponíveis
5. Use \`get_planning_calendar\` para ver o planejamento atual da semana
6. Baseado no que encontrar:
   - Se existir um template adequado → use \`apply_template\` para aplicá-lo
   - Se não → crie os menus com \`create_daily_menu\` e adicione itens com \`add_menu_item\`
7. Garanta variedade nutricional, considerando café da manhã, almoço e jantar para cada dia

Ao final, apresente um resumo do cardápio planejado em formato de tabela (dia × refeição).`,
							},
						},
					],
				}
			}

			case "apply_template_wizard": {
				const { kitchenId } = args as Record<string, string>
				return {
					description: "Assistente para aplicação de template semanal",
					messages: [
						{
							role: "user" as const,
							content: {
								type: "text" as const,
								text: `Você é um assistente do sistema SISUB para gestão de cardápios.

Ajude o gestor a aplicar um template semanal para a **cozinha ID ${kitchenId}**.

Siga estas etapas interativamente:
1. Use \`list_menu_templates\` com kitchenId=${kitchenId} para listar os templates disponíveis
2. Apresente os templates encontrados e pergunte qual o gestor deseja usar
3. Use \`get_template_items\` no template escolhido para mostrar o cardápio previsto
4. Pergunte:
   - Qual a data de início para aplicação (primeira data)
   - Quantas semanas deseja replicar (1-4 semanas)
   - Qual dia do template corresponde à data de início (startDayOfWeek: 1=seg … 7=dom)
5. Calcule o array de targetDates com base nas respostas
6. Use \`apply_template\` para aplicar o template
7. Confirme com \`get_planning_calendar\` que os menus foram criados corretamente
8. Apresente um resumo do resultado`,
							},
						},
					],
				}
			}

			default:
				throw new McpError(ErrorCode.InvalidRequest, `Prompt desconhecido: ${name}`)
		}
	})

	return server
}
