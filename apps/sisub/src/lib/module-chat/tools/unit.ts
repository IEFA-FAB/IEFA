/**
 * Unit module tools — ATAs, ARP, empenhos, dashboard, settings.
 * Ported from server functions: ata.fn.ts, arp.fn.ts, unit-dashboard.fn.ts, unit-settings.fn.ts
 *
 * As tabelas deste módulo NÃO moram no schema `kitchen`, que é o default do client do chat:
 * ATA e ARP em `procurement`, unidade em `core`, empenho em `finance`. Todo `untypedFrom`
 * daqui passa o schema — sem ele o PostgREST responde PGRST205 e a tool devolve
 * "Erro ao executar…" para qualquer pergunta.
 */

import { clampLimit } from "@iefa/sisub-domain/agent"
import type { ModuleToolDefinition } from "./shared"
import { requireUnitPermission, requireUuid, safeInt, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

/**
 * Tetos das listagens do chat. O resultado da tool volta inteiro no prompt do
 * turno seguinte: uma ATA com 72 itens já passa de 50 KB em `select("*")`, o
 * suficiente para o provider recusar a run.
 */
const LIST_DEFAULT = 25
const LIST_MAX = 100
const ATA_ITEMS_DEFAULT = 30
const ATA_ITEMS_MAX = 100
/** Quantos IDs cabem num `in.(…)` sem estourar a linha de requisição do gateway. */
const EMPENHO_ID_BATCH = 100

const COMPRAS_BASE = "https://dadosabertos.compras.gov.br"
const COMPRAS_TIMEOUT_MS = 30_000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

function requireCurrentUnitId(ctx: Parameters<ModuleToolDefinition["handler"]>[1]): number {
	const unitId = safeInt(ctx.scopeId, "scopeId")
	requireUnitPermission(ctx, 1, { type: "unit", id: unitId })
	return unitId
}

async function fetchComprasJson(url: string): Promise<unknown> {
	const res = await fetch(url, {
		signal: AbortSignal.timeout(COMPRAS_TIMEOUT_MS),
		headers: { accept: "application/json" },
	})
	if (!res.ok) {
		const body = await res.text().catch(() => "")
		throw new Error(`HTTP ${res.status} ao consultar Compras.gov.br\nURL: ${url}\nResposta: ${body || res.statusText}`)
	}
	return res.json()
}

function toIsoDate(date: Date): string {
	return date.toISOString().slice(0, 10)
}

function arpVigenciaWindow(): { min: string; max: string } {
	const max = new Date()
	const min = new Date(max.getTime() - 365 * ONE_DAY_MS)
	return { min: toIsoDate(min), max: toIsoDate(max) }
}

const listAtas: ModuleToolDefinition = {
	name: "list_atas",
	description: "Lista ATAs de licitação da unidade atual da rota. Não recebe ID de unidade; o escopo vem do contexto autenticado.",
	parameters: {
		type: "object",
		properties: {
			limit: { type: "number", description: `Quantas ATAs retornar, das mais recentes (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
		additionalProperties: false,
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = requireCurrentUnitId(ctx)
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)

		// `deleted_at IS NULL` como em `get_atas` do local-analytics: sem ele a ATA na lixeira
		// aparece como viva e o modelo a oferece para empenhar.
		const { data, error, count } = await untypedFrom(ctx, "procurement_list", "procurement")
			.select("id, title, status, unit_id, created_at, updated_at", { count: "exact" })
			.eq("unit_id", unitId)
			.is("deleted_at", null)
			.order("created_at", { ascending: false })
			.limit(limit)

		if (error) return toolErr(sanitizeDbError(error, "list_atas"))
		return toolOk({ atas: data ?? [], returned: data?.length ?? 0, total: count ?? data?.length ?? 0, limit })
	},
}

const getAtaDetails: ModuleToolDefinition = {
	name: "get_ata_details",
	description:
		"Retorna detalhes de uma ATA: cabeçalho, cozinhas com seleções e uma página de itens. Use itemSearch/limit para chegar num item específico sem trazer a lista inteira.",
	parameters: {
		type: "object",
		properties: {
			ataId: { type: "string", description: "ID (UUID) da ATA" },
			itemSearch: { type: "string", description: "Filtra os itens pelo nome do insumo (parcial, sem distinguir caixa)" },
			limit: { type: "number", description: `Quantos itens retornar (padrão ${ATA_ITEMS_DEFAULT}, máximo ${ATA_ITEMS_MAX})` },
		},
		required: ["ataId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const ataId = requireUuid(args.ataId, "ataId")
		const limit = clampLimit(args.limit, ATA_ITEMS_DEFAULT, ATA_ITEMS_MAX)
		const itemSearch = args.itemSearch != null ? String(args.itemSearch).slice(0, 200).toLowerCase() : undefined

		const { data: ata, error } = await ctx.supabase
			.schema("procurement")
			.from("procurement_list")
			.select(`*, kitchens:procurement_list_kitchen(*, selections:procurement_list_selection(*)), items:procurement_list_item(*)`)
			.eq("id", ataId)
			.single()

		if (error || !ata) return toolErr("ATA não encontrada")

		requireUnitPermission(ctx, 1, { type: "unit", id: ata.unit_id })

		// A ATA inteira em `select("*")` passa de 50 KB com ~70 itens — mais do que
		// cabe num turno. O cabeçalho e as cozinhas vão inteiros; os itens vão
		// filtrados, paginados e só com as colunas que a conversa usa.
		const { items, ...header } = ata as typeof ata & { items?: Array<Record<string, unknown>> }
		const allItems = items ?? []
		const matched = itemSearch
			? allItems.filter((i) =>
					String(i.ingredient_name ?? "")
						.toLowerCase()
						.includes(itemSearch)
				)
			: allItems

		return toolOk({
			...header,
			items: matched.slice(0, limit).map((i) => ({
				id: i.id,
				ingredient_id: i.ingredient_id,
				ingredient_name: i.ingredient_name,
				measure_unit: i.measure_unit,
				total_quantity: i.total_quantity,
				unit_price: i.unit_price,
				catmat_item_codigo: i.catmat_item_codigo,
			})),
			items_returned: Math.min(matched.length, limit),
			items_matched: matched.length,
			items_total: allItems.length,
			items_limit: limit,
		})
	},
}

const updateAtaStatus: ModuleToolDefinition = {
	name: "update_ata_status",
	description: "Atualiza o status de uma ATA (draft → published → archived).",
	parameters: {
		type: "object",
		properties: {
			ataId: { type: "string", description: "ID (UUID) da ATA" },
			status: { type: "string", description: "Novo status: draft, published, ou archived" },
		},
		required: ["ataId", "status"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		const ataId = requireUuid(args.ataId, "ataId")
		const status = String(args.status).trim()

		if (!["draft", "published", "archived"].includes(status)) {
			return toolErr("Status deve ser: draft, published ou archived")
		}

		const { data: ata, error: fetchError } = await untypedFrom(ctx, "procurement_list", "procurement").select("unit_id").eq("id", ataId).single()
		if (fetchError || !ata) return toolErr("ATA não encontrada")

		requireUnitPermission(ctx, 2, { type: "unit", id: ata.unit_id })

		const { data, error } = await untypedFrom(ctx, "procurement_list", "procurement").update({ status }).eq("id", ataId).select().single()
		if (error) return toolErr(sanitizeDbError(error, "update_ata_status"))
		return toolOk(data)
	},
}

const getUnitDashboard: ModuleToolDefinition = {
	name: "get_unit_dashboard",
	// A descrição anterior prometia "itens com saldo baixo, status ARP", que esta tool nunca
	// devolveu — o modelo chamava por isso e depois inventava o que não veio.
	description: "Retorna o resumo da unidade atual da rota: quantas ATAs publicadas existem e as 10 ATAs mais recentes (título, status, data).",
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)

		// Published ATAs count
		const { count: ataCount, error: countError } = await untypedFrom(ctx, "procurement_list", "procurement")
			.select("id", { count: "exact", head: true })
			.eq("unit_id", unitId)
			.eq("status", "published")
			.is("deleted_at", null)

		if (countError) return toolErr(sanitizeDbError(countError, "get_unit_dashboard:count"))

		// All ATAs for listing. A coluna é `title` — `name` não existe em
		// `procurement.procurement_list`, e o erro dela era descartado junto com o `data`:
		// a tool respondia `recentAtas: []` com cara de sucesso e o modelo afirmava que a
		// unidade não tinha ATA nenhuma. Falha silenciosa mente pior do que falha barulhenta.
		const { data: atas, error: listError } = await ctx.supabase
			.schema("procurement")
			.from("procurement_list")
			.select("id, title, status, created_at")
			.eq("unit_id", unitId)
			.is("deleted_at", null)
			.order("created_at", { ascending: false })
			.limit(10)

		if (listError) return toolErr(sanitizeDbError(listError, "get_unit_dashboard:list"))

		return toolOk({
			publishedAtaCount: ataCount ?? 0,
			recentAtas: atas ?? [],
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

		const vigencia = arpVigenciaWindow()
		const params = new URLSearchParams({
			pagina: "1",
			tamanhoPagina: "20",
			codigoUnidadeGerenciadora: uasg,
			dataVigenciaInicialMin: vigencia.min,
			dataVigenciaInicialMax: vigencia.max,
		})

		try {
			const data = await fetchComprasJson(`${COMPRAS_BASE}/modulo-arp/1_consultarARP?${params}`)
			return toolOk({ uasg, ...(data && typeof data === "object" ? data : { resultado: [] }) })
		} catch (err) {
			return toolErr(err instanceof Error ? err.message : "Erro ao consultar Compras.gov.br")
		}
	},
}

const listEmpenhos: ModuleToolDefinition = {
	name: "list_empenhos",
	description: "Lista empenhos (compromissos orçamentários) de uma ATA, dos mais recentes para os mais antigos.",
	parameters: {
		type: "object",
		properties: {
			ataId: { type: "string", description: "ID (UUID) da ATA" },
			limit: { type: "number", description: `Quantos empenhos retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: ["ataId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const ataId = requireUuid(args.ataId, "ataId")
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)

		const { data: ata, error: ataError } = await untypedFrom(ctx, "procurement_list", "procurement").select("unit_id").eq("id", ataId).single()
		if (ataError || !ata) return toolErr("ATA não encontrada")

		requireUnitPermission(ctx, 1, { type: "unit", id: ata.unit_id })

		// `finance.empenho` não tem `ata_id` — o vínculo é `arp_item_id`. Filtrar por `ata_id`
		// (o que esta tool fazia) é coluna inexistente: erro, nunca lista. O caminho é
		// ATA → ARPs → itens de ARP → empenhos desses itens.
		const { data: arps, error: arpsError } = await untypedFrom(ctx, "procurement_arp", "procurement").select("id").eq("ata_id", ataId)
		if (arpsError) return toolErr(sanitizeDbError(arpsError, "list_empenhos:arps"))

		const arpIds = (arps ?? []).map((a: { id: string }) => a.id)
		if (arpIds.length === 0) return toolOk({ empenhos: [], returned: 0, total: 0, limit })

		const { data: arpItems, error: itemsError } = await untypedFrom(ctx, "procurement_arp_item", "procurement")
			.select("id, numero_item, descricao_item, medida_catmat")
			.in("arp_id", arpIds)
		if (itemsError) return toolErr(sanitizeDbError(itemsError, "list_empenhos:arp_items"))

		const itemById = new Map((arpItems ?? []).map((i: { id: string }) => [i.id, i]))
		if (itemById.size === 0) return toolOk({ empenhos: [], returned: 0, total: 0, limit })

		// Uma ATA grande tem centenas de itens, e `in.(…)` viaja na query string: um `IN` único
		// com 300 UUIDs estoura o limite de linha de requisição do gateway. Vai em lotes.
		const itemIds = Array.from(itemById.keys())
		const rows: Record<string, unknown>[] = []
		let total = 0
		for (let start = 0; start < itemIds.length; start += EMPENHO_ID_BATCH) {
			const { data, error, count } = await untypedFrom(ctx, "empenho", "finance")
				.select("id, arp_item_id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, valor_total, nota_lancamento, status", { count: "exact" })
				.in("arp_item_id", itemIds.slice(start, start + EMPENHO_ID_BATCH))
				.order("data_empenho", { ascending: false })
				.limit(limit)
			if (error) return toolErr(sanitizeDbError(error, "list_empenhos"))
			rows.push(...(data ?? []))
			total += count ?? data?.length ?? 0
		}

		// O item entra pela descrição: `arp_item_id` sozinho não diz o que foi empenhado.
		const empenhos = rows
			.sort((a, b) => String(b.data_empenho ?? "").localeCompare(String(a.data_empenho ?? "")))
			.slice(0, limit)
			.map(({ arp_item_id, ...empenho }) => {
				const item = itemById.get(String(arp_item_id)) as
					| { numero_item?: number | null; descricao_item?: string | null; medida_catmat?: string | null }
					| undefined
				return { ...empenho, item: item?.descricao_item ?? null, item_numero: item?.numero_item ?? null, item_medida: item?.medida_catmat ?? null }
			})

		return toolOk({ empenhos, returned: empenhos.length, total, limit })
	},
}

export const unitTools: ModuleToolDefinition[] = [listAtas, getAtaDetails, updateAtaStatus, getUnitDashboard, getUnitSettings, searchArp, listEmpenhos]
