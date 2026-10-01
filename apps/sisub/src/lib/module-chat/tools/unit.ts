/**
 * Unit module tools — anexos quantitativos do TR, ARP, empenhos, dashboard, settings.
 * Ported from server functions: quantity-estimate.fn.ts, arp.fn.ts, unit-dashboard.fn.ts, unit-settings.fn.ts
 *
 * As tabelas deste módulo NÃO moram no schema `kitchen`, que é o default do client do chat:
 * anexo e ARP em `procurement`, unidade em `core`, empenho em `finance`. Todo `untypedFrom`
 * daqui passa o schema — sem ele o PostgREST responde PGRST205 e a tool devolve
 * "Erro ao executar…" para qualquer pergunta.
 */

import { toJsonSchema } from "@iefa/sisub-domain"
import {
	AgentGetQuantityEstimateSchema,
	AgentListQuantityEstimatesSchema,
	AgentUpdateQuantityEstimateStatusSchema,
	agentGetQuantityEstimate,
	agentListQuantityEstimates,
	agentUpdateQuantityEstimateStatus,
	clampLimit,
} from "@iefa/sisub-domain/agent"
import { defaultVigenciaWindow } from "@/lib/arp-compras"
import { comprasApi, unwrapCompras } from "@/lib/compras.server"
import type { ModuleToolDefinition } from "./shared"
import { assertRouteScope, domainCtx, requireUnitPermission, requireUuid, safeInt, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

/**
 * Tetos das listagens do chat. O resultado da tool volta inteiro no prompt do
 * turno seguinte: um anexo com 72 itens já passa de 50 KB em `select("*")`, o
 * suficiente para o provider recusar a run.
 */
const LIST_DEFAULT = 25
const LIST_MAX = 100
/** Quantos IDs cabem num `in.(…)` sem estourar a linha de requisição do gateway. */
const EMPENHO_ID_BATCH = 100

function requireCurrentUnitId(ctx: Parameters<ModuleToolDefinition["handler"]>[1]): number {
	const unitId = safeInt(ctx.scopeId, "scopeId")
	requireUnitPermission(ctx, 1, { type: "unit", id: unitId })
	return unitId
}

/**
 * `list_quantity_estimates` — mesma definição no chat da Gestão Unidade e no do analytics local
 * (substitui `list_atas` e `get_atas`, que nunca foram chamadas: renomeadas sem alias). A leitura
 * mora em `@iefa/sisub-domain/agent` (schema, teto e `total`).
 */
export const listQuantityEstimates: ModuleToolDefinition = {
	name: "list_quantity_estimates",
	description:
		"Lista os anexos quantitativos do Termo de Referência (TR) da unidade atual da rota, dos mais recentes, com status (draft, completed, archived). O anexo quantitativo não é a Ata de Registro de Preços (ARP), que só existe após a homologação e é vinculada ao anexo. Não recebe ID de unidade; o escopo vem do contexto autenticado.",
	parameters: toJsonSchema(AgentListQuantityEstimatesSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = safeInt(ctx.scopeId, "scopeId")
		const input = AgentListQuantityEstimatesSchema.parse(args)
		const { items, ...counts } = await agentListQuantityEstimates(ctx.db, domainCtx(ctx), { ...input, unitId })
		return toolOk({ quantityEstimates: items, ...counts })
	},
}

const getQuantityEstimate: ModuleToolDefinition = {
	name: "get_quantity_estimate",
	description:
		"Retorna um anexo quantitativo do TR: cabeçalho, cozinhas com os cardápios considerados e uma página de itens (quantidade estimada, preço, CATMAT). Use itemSearch/limit para chegar num item específico sem trazer a lista inteira.",
	parameters: toJsonSchema(AgentGetQuantityEstimateSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentGetQuantityEstimateSchema.parse(args)
		const detail = await agentGetQuantityEstimate(ctx.db, domainCtx(ctx), input)
		// O detalhe já traz a OM dona: o anexo de outra unidade não chega ao modelo.
		assertRouteScope(ctx, "unit", detail.unit_id)
		return toolOk(detail)
	},
}

const updateQuantityEstimateStatusTool: ModuleToolDefinition = {
	name: "update_quantity_estimate_status",
	description:
		"Atualiza o status de um anexo quantitativo do TR: draft → completed (concluir) → archived. Concluir exige a justificativa da quantidade máxima quando algum item passa do acréscimo de referência, e congela a memória de cálculo.",
	parameters: toJsonSchema(AgentUpdateQuantityEstimateStatusSchema),
	requiredLevel: 2,
	async handler(args, ctx) {
		const input = AgentUpdateQuantityEstimateStatusSchema.parse(args)
		// Escopo da rota ANTES da escrita: concluir é irreversível (congela a memória de cálculo).
		// Só a OM dona é lida; anexo ausente segue para a operation, que responde "não encontrado".
		if (ctx.scopeId != null) {
			const { data: owner, error } = await untypedFrom(ctx, "quantity_estimate", "procurement")
				.select("unit_id")
				.eq("id", input.quantityEstimateId)
				.maybeSingle()
			if (error) return toolErr(sanitizeDbError(error, "update_quantity_estimate_status:escopo"))
			if (owner?.unit_id != null) assertRouteScope(ctx, "unit", owner.unit_id)
		}
		// A operation confere `unit:2` na OM DONA do anexo, a transição, a segmentação e a
		// justificativa, e congela o snapshot na conclusão — o que o `update` cru desta tool pulava.
		// Anexo ainda no wizard não conclui pelo chat.
		await agentUpdateQuantityEstimateStatus(ctx.db, domainCtx(ctx), input)
		return toolOk({ quantityEstimateId: input.quantityEstimateId, status: input.status })
	},
}

const getUnitDashboard: ModuleToolDefinition = {
	name: "get_unit_dashboard",
	// A descrição anterior prometia "itens com saldo baixo, status ARP", que esta tool nunca
	// devolveu — o modelo chamava por isso e depois inventava o que não veio.
	description:
		"Retorna o resumo da unidade atual da rota: quantos anexos quantitativos concluídos (status completed) existem e os 10 mais recentes (título, status, data).",
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)
		// Erro de leitura sobe como erro da tool, nunca como lista vazia: `recentQuantityEstimates: []`
		// com cara de sucesso fazia o modelo afirmar que a unidade não tinha anexo nenhum.
		const [completed, recent] = await Promise.all([
			agentListQuantityEstimates(ctx.db, domainCtx(ctx), { unitId, status: "completed", limit: 1 }),
			agentListQuantityEstimates(ctx.db, domainCtx(ctx), { unitId, limit: 10 }),
		])
		return toolOk({
			completedQuantityEstimateCount: completed.total,
			recentQuantityEstimates: recent.items.map(({ id, title, status, created_at }) => ({ id, title, status, created_at })),
		})
	},
}

const getUnitSettings: ModuleToolDefinition = {
	name: "get_unit_settings",
	description: "Retorna configurações da unidade atual da rota: endereço, código UASG.",
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)

		const { data, error } = await untypedFrom(ctx, "units", "core")
			.select(
				"id, code, display_name, uasg, address_logradouro, address_numero, address_complemento, address_bairro, address_municipio, address_uf, address_cep"
			)
			.eq("id", unitId)
			.single()
		if (error) return toolErr(sanitizeDbError(error, "get_unit_settings"))
		return toolOk(data)
	},
}

const searchArp: ModuleToolDefinition = {
	name: "search_arp",
	description: "Busca Atas de Registro de Preço (ARP) pela UASG da unidade atual da rota.",
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)

		const { data: unit, error } = await untypedFrom(ctx, "units", "core").select("uasg").eq("id", unitId).single()
		if (error) return toolErr(sanitizeDbError(error, "search_arp:get_unit_uasg"))

		const uasg = String(unit?.uasg ?? "").trim()
		if (!uasg) return toolErr("Unidade sem código UASG configurado")

		const vigencia = defaultVigenciaWindow()

		try {
			const page = unwrapCompras(
				await comprasApi.GET("/modulo-arp/1_consultarARP", {
					params: {
						query: {
							pagina: 1,
							tamanhoPagina: 20,
							codigoUnidadeGerenciadora: uasg,
							dataVigenciaInicialMin: vigencia.min,
							dataVigenciaInicialMax: vigencia.max,
						},
					},
				})
			)
			// A guarda de objeto fica: um corpo que não é objeto (a API já devolveu
			// texto solto em 200) seria espalhado caractere a caractere no
			// resultado da tool, e o modelo leria `{"0":"t","1":"e",…}`.
			return toolOk({ uasg, vigencia, ...(page && typeof page === "object" ? page : { resultado: [] }) })
		} catch (err) {
			return toolErr(err instanceof Error ? err.message : "Erro ao consultar Compras.gov.br")
		}
	},
}

const listEmpenhos: ModuleToolDefinition = {
	name: "list_empenhos",
	description: "Lista empenhos (compromissos orçamentários) de um anexo quantitativo, via ARP vinculada, dos mais recentes para os mais antigos.",
	parameters: {
		type: "object",
		properties: {
			quantityEstimateId: { type: "string", description: "ID (UUID) do anexo quantitativo" },
			limit: { type: "number", description: `Quantos empenhos retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: ["quantityEstimateId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const quantityEstimateId = requireUuid(args.quantityEstimateId, "quantityEstimateId")
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)

		const { data: quantityEstimate, error: quantityEstimateError } = await untypedFrom(ctx, "quantity_estimate", "procurement")
			.select("unit_id")
			.eq("id", quantityEstimateId)
			.single()
		if (quantityEstimateError || !quantityEstimate) return toolErr("Anexo quantitativo não encontrado")

		requireUnitPermission(ctx, 1, { type: "unit", id: quantityEstimate.unit_id })
		assertRouteScope(ctx, "unit", quantityEstimate.unit_id)

		// `finance.empenho` não aponta para o anexo — o vínculo é o `arp_item_id` dos itens da NE
		// (`finance.empenho_item`). Filtrar pelo anexo (o que esta tool fazia) é coluna inexistente:
		// erro, nunca lista. O caminho é anexo → ARPs → itens de ARP → itens de NE → NEs.
		const { data: arps, error: arpsError } = await untypedFrom(ctx, "arp", "procurement").select("id").eq("quantity_estimate_id", quantityEstimateId)
		if (arpsError) return toolErr(sanitizeDbError(arpsError, "list_empenhos:arps"))

		const arpIds = (arps ?? []).map((a: { id: string }) => a.id)
		if (arpIds.length === 0) return toolOk({ empenhos: [], returned: 0, total: 0, limit })

		const { data: arpItems, error: itemsError } = await untypedFrom(ctx, "arp_item", "procurement")
			.select("id, numero_item, descricao_item, medida_catmat")
			.in("arp_id", arpIds)
		if (itemsError) return toolErr(sanitizeDbError(itemsError, "list_empenhos:arp_items"))

		const itemById = new Map((arpItems ?? []).map((i: { id: string }) => [i.id, i]))
		if (itemById.size === 0) return toolOk({ empenhos: [], returned: 0, total: 0, limit })

		// Um anexo grande tem centenas de itens, e `in.(…)` viaja na query string: um `IN` único
		// com 300 UUIDs estoura o limite de linha de requisição do gateway. Vai em lotes.
		// O vínculo é pelos ITENS da NE (20260926214000): uma NE com arroz, feijão e óleo cobre
		// três itens do anexo.
		const itemIds = Array.from(itemById.keys())
		const neItems: Array<{ empenho_id: string; arp_item_id: string; quantity: number | null; value: number }> = []
		for (let start = 0; start < itemIds.length; start += EMPENHO_ID_BATCH) {
			const { data, error } = await untypedFrom(ctx, "empenho_item", "finance")
				.select("empenho_id, arp_item_id, quantity, value")
				.in("arp_item_id", itemIds.slice(start, start + EMPENHO_ID_BATCH))
			if (error) return toolErr(sanitizeDbError(error, "list_empenhos:itens"))
			neItems.push(...(data ?? []))
		}
		const empenhoIds = [...new Set(neItems.map((row) => row.empenho_id))]
		const total = empenhoIds.length
		const rows: Record<string, unknown>[] = []
		for (let start = 0; start < empenhoIds.length; start += EMPENHO_ID_BATCH) {
			const { data, error } = await untypedFrom(ctx, "empenho", "finance")
				.select("id, numero_empenho, data_empenho, valor_total, nota_lancamento, status")
				.in("id", empenhoIds.slice(start, start + EMPENHO_ID_BATCH))
			if (error) return toolErr(sanitizeDbError(error, "list_empenhos"))
			rows.push(...(data ?? []))
		}

		// O item entra pela descrição: `arp_item_id` sozinho não diz o que foi empenhado.
		const empenhos = rows
			.sort((a, b) => String(b.data_empenho ?? "").localeCompare(String(a.data_empenho ?? "")))
			.slice(0, limit)
			.map((empenho) => ({
				...empenho,
				itens: neItems
					.filter((row) => row.empenho_id === empenho.id)
					.map((row) => {
						const item = itemById.get(String(row.arp_item_id)) as
							| { numero_item?: number | null; descricao_item?: string | null; medida_catmat?: string | null }
							| undefined
						return {
							item: item?.descricao_item ?? null,
							item_numero: item?.numero_item ?? null,
							item_medida: item?.medida_catmat ?? null,
							quantidade: row.quantity,
							valor: row.value,
						}
					}),
			}))

		return toolOk({ empenhos, returned: empenhos.length, total, limit })
	},
}

export const unitTools: ModuleToolDefinition[] = [
	listQuantityEstimates,
	getQuantityEstimate,
	updateQuantityEstimateStatusTool,
	getUnitDashboard,
	getUnitSettings,
	searchArp,
	listEmpenhos,
]
