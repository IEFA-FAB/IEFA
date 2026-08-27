/**
 * Leituras de EQUIPAMENTO prontas para agentes — a mesma resposta para o chat dos módulos e
 * para o servidor MCP.
 *
 * O que estas funções acrescentam às operations: teto de itens, projeção enxuta e rótulos no
 * lugar de uuid. Um modelo não tem o que fazer com `role_id`: ou imprime o identificador cru
 * numa resposta que ninguém lê, ou omite a informação. Aqui o papel chega como "Forno
 * combinado" e o modelo consegue escrever a frase.
 *
 * As três perguntas que a superfície responde, e por que são três e não uma:
 *   1. o que a cozinha TEM (`agentListKitchenEquipment`);
 *   2. o que a preparação EXIGE (`agentGetRecipeEquipment`);
 *   3. se uma coisa cabe na outra (`agentCheckRecipeEquipment` / `agentCheckMenuEquipment`).
 * Deixar o modelo cruzar 1 com 2 sozinho seria pedir que ele refizesse o emparelhamento em
 * prosa — e ele erraria exatamente onde o cálculo é sutil: o multifuncional que sabe quatro
 * papéis mas exerce dois por vez.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	evaluateMenuEquipmentFitness,
	evaluateRecipeEquipmentFitness,
	fetchRecipeEquipment,
	listEquipmentModels,
	listEquipmentRoles,
	listKitchenEquipment,
} from "../operations/equipment.ts"
import type { UserContext } from "../types/context.ts"
import { clampLimit } from "./budget.ts"
import type { AgentList } from "./reads.ts"
import type {
	AgentCheckMenuEquipment,
	AgentCheckRecipeEquipment,
	AgentListEquipmentCatalog,
	AgentListKitchenEquipment,
	AgentRecipeEquipment,
} from "./schemas.ts"

function paginate<T>(rows: T[], limit: number): AgentList<T> {
	return { items: rows.slice(0, limit), returned: Math.min(rows.length, limit), total: rows.length, limit }
}

// ── O que a cozinha tem ───────────────────────────────────────────────────

export interface AgentEquipmentUnit {
	id: string
	/** Como a cozinha chama o equipamento ("Forno 1"). */
	label: string
	model: string
	/** Capacidade anunciada pelo fabricante ("2 × 25 L", "10 × GN 1/1"). */
	capacity: string | null
	/** Papéis EFETIVOS, já com as exceções da unidade aplicadas. */
	roles: string[]
	/** Zonas independentes: quantas exigências a unidade atende ao mesmo tempo. */
	slots: number
	status: string
}

export interface AgentKitchenEquipment extends AgentList<AgentEquipmentUnit> {
	kitchen_id: number
	/**
	 * Parque de QUEM COZINHA. Difere de `kitchen_id` quando um refeitório é servido por
	 * cozinha central — e sem dizer isso o modelo afirmaria que o refeitório tem fornos.
	 */
	producing_kitchen_id: number
	delegated: boolean
}

export async function agentListKitchenEquipment(db: SisubDb, ctx: UserContext, input: AgentListKitchenEquipment): Promise<AgentKitchenEquipment> {
	const limit = clampLimit(input.limit)
	const units = await listKitchenEquipment(db, ctx, { kitchenId: input.kitchenId, includeInactive: input.includeInactive ?? false })

	const roles = await listEquipmentRoles(db, ctx, {})
	const roleName = new Map(roles.map((r) => [r.id, r.name]))

	const rows: AgentEquipmentUnit[] = units.map((unit) => ({
		id: unit.id,
		label: unit.label,
		model: [unit.model?.manufacturer, unit.model?.name].filter(Boolean).join(" ") || "Modelo desconhecido",
		capacity: unit.model?.capacity_label ?? null,
		roles: unit.effective_role_ids.map((id) => roleName.get(id) ?? id),
		slots: unit.effective_slots,
		status: unit.status,
	}))

	// A cozinha produtora sai do próprio cálculo de atendimento; aqui o parque já é o dela
	// (a operation resolve o escopo), então o par informado é o pedido.
	return { ...paginate(rows, limit), kitchen_id: input.kitchenId, producing_kitchen_id: input.kitchenId, delegated: false }
}

// ── O que a preparação exige ──────────────────────────────────────────────

export interface AgentEquipmentRequirement {
	/** Rótulo do alvo: papel ("Forno combinado") ou modelo ("Rational iVario Pro L"). */
	target: string
	target_kind: "papel" | "modelo"
	/** Unidades simultâneas POR BATELADA. */
	quantity: number
	/** `por batelada` = o volume vira ciclos; `fixo` = a leva inteira usa a mesma unidade. */
	scaling: "por batelada" | "fixo na leva"
	batch_portions: number | null
	min_capacity: string | null
	notes: string | null
	/** true = a exigência está amarrada a uma etapa do fluxo de produção. */
	bound_to_step: boolean
}

export async function agentGetRecipeEquipment(db: SisubDb, ctx: UserContext, input: AgentRecipeEquipment): Promise<AgentList<AgentEquipmentRequirement>> {
	const requirements = await fetchRecipeEquipment(db, ctx, { recipeId: input.recipeId })
	const rows: AgentEquipmentRequirement[] = requirements.map((req) => ({
		target: req.model != null ? [req.model.manufacturer, req.model.name].filter(Boolean).join(" ") : (req.role?.name ?? "Equipamento"),
		target_kind: req.model != null ? "modelo" : "papel",
		quantity: req.quantity,
		scaling: req.scaling === "fixed" ? "fixo na leva" : "por batelada",
		batch_portions: req.batch_portions,
		min_capacity: req.min_capacity_liters != null ? `${req.min_capacity_liters} L` : req.min_capacity_gn != null ? `${req.min_capacity_gn} GN` : null,
		notes: req.notes,
		bound_to_step: req.recipe_step_id != null,
	}))
	// Lista por receita, não catálogo: o teto existe pela regra da casa, não porque cresça.
	return paginate(rows, clampLimit(null))
}

// ── Se uma coisa cabe na outra ────────────────────────────────────────────

export interface AgentEquipmentFitness {
	/** true = a cozinha roda UMA batelada da lista mínima. */
	satisfied: boolean
	/** true = a preparação não declara equipamento; não há o que verificar. */
	unspecified: boolean
	/** true = a cozinha não cadastrou parque nenhum. Diferente de "parque insuficiente". */
	park_not_registered: boolean
	producing_kitchen_id: number
	delegated: boolean
	missing: { target: string; required: number; satisfied: number }[]
	assigned: { target: string; units: string[] }[]
	/** Volume: quantas bateladas, quantas ao mesmo tempo, quantas rodadas. */
	volume: { portions: number | null; batch_portions: number | null; batches: number; parallel: number; cycles: number | null } | null
}

export async function agentCheckRecipeEquipment(db: SisubDb, ctx: UserContext, input: AgentCheckRecipeEquipment): Promise<AgentEquipmentFitness> {
	const fitness = await evaluateRecipeEquipmentFitness(db, ctx, {
		recipeId: input.recipeId,
		kitchenId: input.kitchenId,
		portions: input.portions ?? null,
	})

	return {
		satisfied: fitness.satisfied,
		unspecified: fitness.unspecified,
		park_not_registered: fitness.units_considered === 0 && !fitness.unspecified,
		producing_kitchen_id: fitness.producing_kitchen_id,
		delegated: fitness.delegated,
		missing: fitness.requirements
			.filter((req) => req.missing > 0)
			.map((req) => ({ target: req.target_label, required: req.required, satisfied: req.satisfied })),
		assigned: fitness.requirements
			.filter((req) => req.assigned_unit_labels.length > 0)
			.map((req) => ({ target: req.target_label, units: req.assigned_unit_labels })),
		volume:
			fitness.portions != null
				? {
						portions: fitness.portions,
						batch_portions: fitness.batch_portions,
						batches: fitness.batches,
						parallel: fitness.max_parallel_batches,
						cycles: fitness.cycles,
					}
				: null,
	}
}

export interface AgentMenuEquipmentFitness {
	satisfied: boolean
	park_not_registered: boolean
	producing_kitchen_id: number
	delegated: boolean
	/** Disputa por alvo, com as preparações que competem — sem os nomes o aviso não é acionável. */
	contention: { target: string; required: number; satisfied: number; missing: number; competing: string[] }[]
	items: { recipe: string; portions: number | null; batches: number; declares_equipment: boolean }[]
}

export async function agentCheckMenuEquipment(db: SisubDb, ctx: UserContext, input: AgentCheckMenuEquipment): Promise<AgentMenuEquipmentFitness> {
	const fitness = await evaluateMenuEquipmentFitness(db, ctx, { dailyMenuId: input.dailyMenuId })
	return {
		satisfied: fitness.satisfied,
		park_not_registered: fitness.units_considered === 0,
		producing_kitchen_id: fitness.producing_kitchen_id,
		delegated: fitness.delegated,
		contention: fitness.targets.map((target) => ({
			target: target.target_label,
			required: target.required,
			satisfied: target.satisfied,
			missing: target.missing,
			competing: target.competing_items.map((item) => item.recipe_name),
		})),
		items: fitness.items.map((item) => ({
			recipe: item.recipe_name,
			portions: item.portions,
			batches: item.batches,
			declares_equipment: !item.unspecified,
		})),
	}
}

// ── Catálogo (papéis e modelos) ───────────────────────────────────────────

export interface AgentEquipmentCatalogEntry {
	id: string
	name: string
	manufacturer: string | null
	capacity: string | null
	slots: number
	roles: string[]
}

export interface AgentEquipmentCatalog extends AgentList<AgentEquipmentCatalogEntry> {
	/** Vocabulário completo de papéis — é por ele que a exigência da preparação fala. */
	roles: { id: string; name: string; category: string }[]
}

export async function agentListEquipmentCatalog(db: SisubDb, ctx: UserContext, input: AgentListEquipmentCatalog): Promise<AgentEquipmentCatalog> {
	const limit = clampLimit(input.limit)
	const roles = await listEquipmentRoles(db, ctx, {})
	const roleName = new Map(roles.map((r) => [r.id, r.name]))
	const models = await listEquipmentModels(db, ctx, { kitchenId: input.kitchenId ?? null, search: input.search ?? null, roleId: input.roleId ?? null })

	const rows: AgentEquipmentCatalogEntry[] = models.map((model) => ({
		id: model.id,
		name: model.name,
		manufacturer: model.manufacturer,
		capacity: model.capacity_label,
		slots: model.simultaneous_slots,
		roles: model.roles.map((link) => link.role?.name ?? roleName.get(link.role_id) ?? link.role_id),
	}))

	return { ...paginate(rows, limit), roles: roles.map((r) => ({ id: r.id, name: r.name, category: r.category })) }
}
