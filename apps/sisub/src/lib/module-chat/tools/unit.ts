/**
 * Unit module tools — ATAs, ARP, empenhos, dashboard, settings.
 * Ported from server functions: ata.fn.ts, arp.fn.ts, unit-dashboard.fn.ts, unit-settings.fn.ts
 */

import type { ModuleToolDefinition } from "./shared"
import { requireUnitPermission, requireUuid, safeInt, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

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
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)

		const { data, error } = await untypedFrom(ctx, "procurement_list").select("*").eq("unit_id", unitId).order("created_at", { ascending: false })

		if (error) return toolErr(sanitizeDbError(error, "list_atas"))
		return toolOk(data ?? [])
	},
}

const getAtaDetails: ModuleToolDefinition = {
	name: "get_ata_details",
	description: "Retorna detalhes completos de uma ATA com cozinhas, seleções e itens.",
	parameters: {
		type: "object",
		properties: {
			ataId: { type: "string", description: "ID (UUID) da ATA" },
		},
		required: ["ataId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const ataId = requireUuid(args.ataId, "ataId")

		const { data: ata, error } = await ctx.supabase
			.from("procurement_list")
			.select(`*, kitchens:procurement_list_kitchen(*, selections:procurement_list_selection(*)), items:procurement_list_item(*)`)
			.eq("id", ataId)
			.single()

		if (error || !ata) return toolErr("ATA não encontrada")

		requireUnitPermission(ctx, 1, { type: "unit", id: ata.unit_id })
		return toolOk(ata)
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

		const { data: ata, error: fetchError } = await untypedFrom(ctx, "procurement_list").select("unit_id").eq("id", ataId).single()
		if (fetchError || !ata) return toolErr("ATA não encontrada")

		requireUnitPermission(ctx, 2, { type: "unit", id: ata.unit_id })

		const { data, error } = await untypedFrom(ctx, "procurement_list").update({ status }).eq("id", ataId).select().single()
		if (error) return toolErr(sanitizeDbError(error, "update_ata_status"))
		return toolOk(data)
	},
}

const getUnitDashboard: ModuleToolDefinition = {
	name: "get_unit_dashboard",
	description: "Retorna dados do dashboard da unidade atual da rota: ATAs publicadas, itens com saldo baixo, status ARP.",
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)

		// Published ATAs count
		const { count: ataCount } = await untypedFrom(ctx, "procurement_list")
			.select("id", { count: "exact", head: true })
			.eq("unit_id", unitId)
			.eq("status", "published")

		// All ATAs for listing
		const { data: atas } = await ctx.supabase
			.from("procurement_list")
			.select("id, name, status, created_at")
			.eq("unit_id", unitId)
			.order("created_at", { ascending: false })
			.limit(10)

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

		const { data, error } = await untypedFrom(ctx, "units").select("*").eq("id", unitId).single()
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

		const { data: unit, error } = await untypedFrom(ctx, "units").select("uasg").eq("id", unitId).single()
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
	description: "Lista empenhos (compromissos orçamentários) de uma ATA.",
	parameters: {
		type: "object",
		properties: {
			ataId: { type: "string", description: "ID (UUID) da ATA" },
		},
		required: ["ataId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const ataId = requireUuid(args.ataId, "ataId")

		const { data: ata, error: ataError } = await untypedFrom(ctx, "procurement_list").select("unit_id").eq("id", ataId).single()
		if (ataError || !ata) return toolErr("ATA não encontrada")

		requireUnitPermission(ctx, 1, { type: "unit", id: ata.unit_id })

		const { data, error } = await untypedFrom(ctx, "empenho").select("*").eq("ata_id", ataId).order("created_at", { ascending: false })
		if (error) return toolErr(sanitizeDbError(error, "list_empenhos"))
		return toolOk(data ?? [])
	},
}

export const unitTools: ModuleToolDefinition[] = [listAtas, getAtaDetails, updateAtaStatus, getUnitDashboard, getUnitSettings, searchArp, listEmpenhos]
