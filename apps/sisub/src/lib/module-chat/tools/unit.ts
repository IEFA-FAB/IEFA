/**
 * Unit module tools — ATAs, ARP, empenhos, dashboard, settings.
 * Ported from server functions: ata.fn.ts, arp.fn.ts, unit-dashboard.fn.ts, unit-settings.fn.ts
 */

import type { ModuleToolDefinition } from "./shared"
import { requireUnitPermission, requireUuid, safeInt, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

const listAtas: ModuleToolDefinition = {
	name: "list_atas",
	description: "Lista ATAs de licitação da unidade com status e contagens.",
	parameters: {
		type: "object",
		properties: {
			unitId: { type: "number", description: "ID da unidade" },
		},
		required: ["unitId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = safeInt(args.unitId, "unitId")
		requireUnitPermission(ctx, 1, { type: "unit", id: unitId })

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
	description: "Retorna dados do dashboard da unidade: ATAs publicadas, itens com saldo baixo, status ARP.",
	parameters: {
		type: "object",
		properties: {
			unitId: { type: "number", description: "ID da unidade" },
		},
		required: ["unitId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = safeInt(args.unitId, "unitId")
		requireUnitPermission(ctx, 1, { type: "unit", id: unitId })

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
	description: "Retorna configurações da unidade: endereço, código UASG.",
	parameters: {
		type: "object",
		properties: {
			unitId: { type: "number", description: "ID da unidade" },
		},
		required: ["unitId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = safeInt(args.unitId, "unitId")
		requireUnitPermission(ctx, 1, { type: "unit", id: unitId })

		const { data, error } = await untypedFrom(ctx, "units").select("*").eq("id", unitId).single()
		if (error) return toolErr(sanitizeDbError(error, "get_unit_settings"))
		return toolOk(data)
	},
}

const searchArp: ModuleToolDefinition = {
	name: "search_arp",
	description: "Busca Atas de Registro de Preço (ARP) no Compras.gov.br pela UASG da unidade.",
	parameters: {
		type: "object",
		properties: {
			unitId: { type: "number", description: "ID da unidade" },
		},
		required: ["unitId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = safeInt(args.unitId, "unitId")
		requireUnitPermission(ctx, 1, { type: "unit", id: unitId })

		// Get unit UASG code
		const { data: unit } = await untypedFrom(ctx, "units").select("uasg_code").eq("id", unitId).single()
		if (!unit?.uasg_code) return toolErr("Unidade sem código UASG configurado")

		// Search local ARP records
		const { data, error } = await untypedFrom(ctx, "arp").select("*").eq("uasg_code", unit.uasg_code).order("created_at", { ascending: false })
		if (error) return toolErr(sanitizeDbError(error, "search_arp"))
		return toolOk(data ?? [])
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
