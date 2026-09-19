/**
 * @module count.fn
 * Inventário: abertura com escopo, folha cega, lançamentos de várias pessoas,
 * recontagem da divergência grande e aprovação por quem não contou.
 *
 * O requisito era "uma ferramenta para ajudar a refazer o inventário", e o
 * que faz dela ferramenta em vez de planilha são três coisas que o servidor
 * precisa garantir sozinho:
 *
 *  • **a cozinha não para para contar** — a diferença de cada linha é contra o
 *    saldo do ledger no INSTANTE em que se contou, não o de agora;
 *  • **a cegueira é do servidor** — esconder o saldo só no React é esconder de
 *    quem não quer ver, porque a resposta continua trazendo o número;
 *  • **quem contou não aprova** — e isso é decidido no banco, sob trava, junto
 *    com o lançamento do ajuste.
 *
 * CLIENT: getServerClient (service role, schemas inventory/kitchen).
 * AUTH: `storage` nível 2 conta; nível 3 abre, encerra e aprova.
 * TABLES: inventory.inventory_count(_entry), count_scope_item.
 * @domain kitchen
 * @migration 20260920120000_inventory_count_operable
 */

import { hasPermission } from "@iefa/pbac"
import { evaluateCountLine } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

export const COUNT_TYPES = ["annual", "responsibility_transfer", "eventual", "rotating"] as const
export const COUNT_SCOPES = ["full", "conservation_class", "location", "item_list", "menu_cycle"] as const

/** Contagens abertas e recentes da cozinha. */
export const listInventoryCountsFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(20) }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const {
			data: rows,
			count,
			error,
		} = await inventory()
			.from("inventory_count")
			.select("id, status, type, scope, blind, round, competencia, created_at, expires_at, approved_at, adjustment_id, approved_by_own_entry", {
				count: "exact",
			})
			.eq("kitchen_id", data.kitchenId)
			.order("created_at", { ascending: false })
			.limit(data.limit)
		if (error) throw new Error(`Erro ao listar as contagens: ${error.message}`)
		return { counts: rows ?? [], total: count ?? (rows ?? []).length }
	})

export const openInventoryCountFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			type: z.enum(COUNT_TYPES),
			scope: z.enum(COUNT_SCOPES),
			scopeParams: z.record(z.string(), z.unknown()).default({}),
			blind: z.boolean().default(true),
			blindWaiverReason: z.string().max(300).optional(),
		})
	)
	.handler(async ({ data }) => {
		// abrir inventário é decisão de nível 3: ele trava o escopo contra
		// qualquer outra contagem da cozinha
		const { userId } = await requireStorageForKitchen(3, data.kitchenId)
		const { data: result, error } = await inventory().rpc("open_inventory_count", {
			p_kitchen_id: data.kitchenId,
			p_type: data.type,
			p_scope: data.scope,
			p_scope_params: data.scopeParams,
			p_blind: data.blind,
			p_blind_waiver_reason: data.blindWaiverReason?.trim() || null,
			p_user: userId,
		})
		if (error) throw new Error(`Erro ao abrir a contagem: ${error.message}`)
		const row = result?.[0]
		return { countId: row?.count_id as string, scopeItems: Number(row?.scope_items ?? 0) }
	})

interface CountSheetLine {
	key: string
	lotId: string | null
	ingredientId: string | null
	frozenPreparationId: string | null
	description: string
	measureUnit: string | null
	lotLabel: string | null
	expiryDate: string | null
	location: string | null
	counted: number
	entries: number
	/** `null` na contagem cega para quem não pode ver. */
	ledger: number | null
	difference: number | null
	differenceValue: number | null
	needsRecount: boolean | null
	found: boolean
	notCountedAccepted: boolean
	/**
	 * A linha é DESTA rodada. Numa recontagem, a folha mostra também as linhas
	 * que ficaram com a rodada anterior (é o conjunto que a aprovação lança),
	 * mas elas não aceitam lançamento, marcação nem recontagem daqui.
	 */
	ownRound: boolean
}

type CountLineRow = {
	lot_id: string | null
	ingredient_id: string | null
	frozen_preparation_id: string | null
	owner_count_id: string
	counted_qty: number | string | null
	entries: number
	counted_at: string | null
	ledger_qty: number | string
	accepted_not_counted: boolean
}

/**
 * A folha.
 *
 * As linhas e a referência de cada uma vêm de `inventory.count_lines` — a
 * MESMA função que a aprovação lança. A folha calculava a linha sem lote por
 * conta própria, e a tela dizia diferença zero onde a aprovação lançava perda.
 *
 * `reveal` decide se o saldo viaja na resposta, e é calculado AQUI, com o nível
 * do usuário e o estado do documento — nunca vem do cliente. Nível 2 só vê o
 * saldo depois do FIM (aprovada, rejeitada, vencida): na revisão ele ainda pode
 * ser chamado a recontar, e recontagem de quem viu o esperado não é cega.
 */
export const fetchCountSheetFn = createServerFn({ method: "GET" })
	.validator(z.object({ countId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count, error: countError } = await inv
			.from("inventory_count")
			.select(
				"id, kitchen_id, status, type, scope, blind, round, parent_count_id, competencia, created_at, expires_at, created_by, approved_at, approval_exception_reason, approved_by, approved_by_own_entry"
			)
			.eq("id", data.countId)
			.maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		const kitchenId = Number(count.kitchen_id)
		const ctx = await requireStorageForKitchen(2, kitchenId)

		const finished = ["approved", "rejected", "expired"].includes(String(count.status))
		const isManager = hasPermission(ctx.permissions, "storage", 3, { type: "kitchen", id: kitchenId })
		// A rodada SUBSTITUÍDA pela recontagem não se abre para o nível 2 enquanto
		// a recontagem corre: ali estão as quantidades que a rodada anterior deu —
		// e, se ela não era cega, o saldo — e a recontagem é cega justamente para
		// quem reconta não confirmar o número de antes.
		if (count.status === "recount" && !isManager) {
			throw new Error("Esta rodada foi substituída pela recontagem e fica disponível ao nível 3 até o fim da contagem")
		}
		const reveal = !count.blind || finished || isManager

		const rows = await readAllPages<CountLineRow>("as linhas da contagem", (from, to) =>
			inv
				.rpc("count_lines", { p_count_id: data.countId })
				.order("ingredient_id", { ascending: true, nullsFirst: false })
				.order("frozen_preparation_id", { ascending: true, nullsFirst: false })
				.order("lot_id", { ascending: true, nullsFirst: true })
				.order("owner_count_id", { ascending: true })
				.range(from, to)
		)

		const scope = await readAllPages<{ ingredient_id: string | null; frozen_preparation_id: string | null; found: boolean; not_counted_accepted: boolean }>(
			"o escopo da contagem",
			(from, to) =>
				inv
					.from("count_scope_item")
					.select("id, ingredient_id, frozen_preparation_id, found, not_counted_accepted")
					.eq("count_id", data.countId)
					.order("id")
					.range(from, to)
		)
		const scopeByItem = new Map(scope.map((item) => [item.ingredient_id ?? item.frozen_preparation_id ?? "", item]))

		const lotIds = rows.map((row) => row.lot_id).filter(Boolean) as string[]
		const lots = await readAllPagesIn<{
			id: string
			short_code: string | null
			lot_code: string | null
			expiry_date: string | null
			location: string | null
			unit_cost: number | string | null
		}>("os lotes da contagem", lotIds, (chunk, from, to) =>
			inv.from("stock_lot").select("id, short_code, lot_code, expiry_date, location, unit_cost").in("id", chunk).order("id").range(from, to)
		)
		const lotById = new Map(lots.map((lot) => [lot.id, lot]))

		const ingredientIds = [...new Set(rows.map((row) => row.ingredient_id).filter(Boolean))] as string[]
		const frozenIds = [...new Set(rows.map((row) => row.frozen_preparation_id).filter(Boolean))] as string[]
		const kit = kitchen()
		const describe = new Map<string, { description: string; measureUnit: string | null }>()
		for (const row of await readAllPagesIn<{ id: string; description: string; measure_unit: string | null }>("os insumos", ingredientIds, (chunk, from, to) =>
			kit.from("ingredient").select("id, description, measure_unit").in("id", chunk).order("id").range(from, to)
		)) {
			describe.set(row.id, { description: row.description, measureUnit: row.measure_unit })
		}
		for (const row of await readAllPagesIn<{ id: string; description: string }>("as preparações", frozenIds, (chunk, from, to) =>
			kit.from("frozen_preparation").select("id, description").in("id", chunk).order("id").range(from, to)
		)) {
			describe.set(row.id, { description: row.description, measureUnit: null })
		}

		// Custo, para medir a divergência em DINHEIRO. Sem ele o valor da diferença
		// era sempre zero, o piso nunca era passado e "recontar as divergentes"
		// nunca aparecia. Lote: o custo do lote; item: o custo médio da cozinha.
		const avgCost = new Map<string, number>()
		if (reveal) {
			for (const row of await readAllPagesIn<{ ingredient_id: string | null; frozen_preparation_id: string | null; avg_unit_cost: number | string | null }>(
				"os custos médios",
				[...ingredientIds, ...frozenIds],
				(chunk, from, to) =>
					inv
						.from("stock_cost")
						.select("ingredient_id, frozen_preparation_id, avg_unit_cost")
						.eq("kitchen_id", kitchenId)
						.or(`ingredient_id.in.(${chunk.join(",")}),frozen_preparation_id.in.(${chunk.join(",")})`)
						.order("ingredient_id", { ascending: true, nullsFirst: false })
						.order("frozen_preparation_id", { ascending: true, nullsFirst: false })
						.range(from, to)
			)) {
				const key = row.ingredient_id ?? row.frozen_preparation_id
				if (key && row.avg_unit_cost != null) avgCost.set(key, Number(row.avg_unit_cost))
			}
		}
		const tolerance = await countToleranceFor(kitchenId)

		const lines: CountSheetLine[] = rows.map((row) => {
			const itemKey = row.ingredient_id ?? row.frozen_preparation_id ?? ""
			const lot = row.lot_id ? lotById.get(row.lot_id) : undefined
			const counted = row.counted_qty == null ? 0 : Number(row.counted_qty)
			const ledger = Number(row.ledger_qty)
			const unitCost = lot?.unit_cost != null ? Number(lot.unit_cost) : (avgCost.get(itemKey) ?? 0)
			// linha sem lançamento e não aceita ainda não tem veredito: ninguém contou
			const judged = reveal && (row.entries > 0 || row.accepted_not_counted)
			const verdict = judged ? evaluateCountLine({ counted, ledger, unitCost }, tolerance) : null
			const scopeItem = scopeByItem.get(itemKey)
			return {
				key: `${row.owner_count_id}:${row.lot_id ? `l:${row.lot_id}` : `i:${itemKey}`}`,
				lotId: row.lot_id,
				ingredientId: row.ingredient_id,
				frozenPreparationId: row.frozen_preparation_id,
				description: describe.get(itemKey)?.description ?? "(item sem cadastro)",
				measureUnit: describe.get(itemKey)?.measureUnit ?? null,
				lotLabel: lot?.short_code ?? lot?.lot_code ?? null,
				expiryDate: lot?.expiry_date ?? null,
				location: lot?.location ?? null,
				counted,
				entries: row.entries,
				ledger: reveal ? ledger : null,
				difference: verdict?.difference ?? null,
				differenceValue: verdict?.differenceValue ?? null,
				needsRecount: verdict?.needsRecount ?? null,
				found: scopeItem?.found ?? false,
				notCountedAccepted: row.accepted_not_counted,
				ownRound: row.owner_count_id === data.countId,
			}
		})

		lines.sort((a, b) => a.description.localeCompare(b.description, "pt-BR") || (a.lotLabel ?? "").localeCompare(b.lotLabel ?? ""))
		return {
			count,
			reveal,
			lines,
			scopeItems: scope.length,
			notCounted: lines.filter((line) => line.ownRound && line.entries === 0 && !line.notCountedAccepted).length,
		}
	})

/**
 * Tolerância da CONTAGEM (`count_tolerance_*`), com os defaults do banco. A
 * folha usava a tolerância da SAÍDA do dia — outra regra, de outro documento.
 */
async function countToleranceFor(kitchenId: number) {
	const { data: row, error } = await inventory()
		.from("kitchen_stock_settings")
		.select("count_tolerance_pct, count_tolerance_value")
		.eq("kitchen_id", kitchenId)
		.maybeSingle()
	if (error) throw new Error(`Erro ao carregar a tolerância da contagem: ${error.message}`)
	return {
		percent: Number(row?.count_tolerance_pct ?? 5),
		floorValue: Number(row?.count_tolerance_value ?? 50),
	}
}

/**
 * Lançamentos, em lote.
 *
 * Em lote porque é assim que a fila offline reenvia: 15 leituras de uma vez ao
 * sair da câmara. `client_event_id` é o que impede as 15 de virarem 30, e o
 * conflito é IGNORADO em vez de virar erro — o reenvio é o caminho normal, não
 * uma exceção.
 */
export const postCountEntriesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			countId: z.uuid(),
			entries: z
				.array(
					z.object({
						clientEventId: z.string().min(8).max(64),
						lotId: z.uuid().optional(),
						ingredientId: z.uuid().optional(),
						frozenPreparationId: z.uuid().optional(),
						quantity: z.number().min(0),
						deviceAt: z.string().optional(),
						overwrite: z.boolean().default(false),
						note: z.string().max(200).optional(),
					})
				)
				.min(1)
				.max(200),
		})
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count, error: countError } = await inv
			.from("inventory_count")
			.select("id, kitchen_id, status, created_at")
			.eq("id", data.countId)
			.maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(count.kitchen_id))
		if (!["draft", "counting"].includes(String(count.status))) {
			throw new Error(`Contagem em "${count.status}" não aceita lançamento`)
		}

		for (const entry of data.entries) {
			const targets = [entry.lotId, entry.ingredientId, entry.frozenPreparationId].filter(Boolean).length
			if (targets !== 1) throw new Error("Cada lançamento aponta para UM alvo: lote, insumo ou preparação")
		}

		// O instante vale para a diferença, e quem o escolhe NÃO é o cliente. O
		// `deviceAt` do dispositivo é guardado como veio, mas o `counted_at` fica
		// preso à janela que o SERVIDOR conhece: da última entrega deste usuário
		// nesta contagem (ou da abertura) até agora. Aceito como veio, o nível 2
		// escolhia o instante de referência — antes de um recebimento, por exemplo
		// — e com ele a diferença. Escopo e cozinha do lote são conferidos pelo
		// gatilho do banco, que também trava a contagem.
		const receivedAt = new Date()
		const { data: last, error: lastError } = await inv
			.from("inventory_count_entry")
			.select("created_at")
			.eq("count_id", data.countId)
			.eq("counted_by", userId)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle()
		if (lastError) throw new Error(`Erro ao conferir os lançamentos anteriores: ${lastError.message}`)
		const floor = new Date(Math.max(new Date(String(count.created_at)).getTime(), last?.created_at ? new Date(String(last.created_at)).getTime() : 0))
		const clamp = (deviceAt: string | undefined): Date => {
			if (!deviceAt) return receivedAt
			const at = new Date(deviceAt)
			if (Number.isNaN(at.getTime())) return receivedAt
			return new Date(Math.min(receivedAt.getTime(), Math.max(floor.getTime(), at.getTime())))
		}

		const { error } = await inv.from("inventory_count_entry").upsert(
			data.entries.map((entry) => {
				const countedAt = clamp(entry.deviceAt)
				return {
					count_id: data.countId,
					lot_id: entry.lotId ?? null,
					ingredient_id: entry.ingredientId ?? null,
					frozen_preparation_id: entry.frozenPreparationId ?? null,
					quantity: entry.quantity,
					client_event_id: entry.clientEventId,
					counted_at: countedAt.toISOString(),
					device_at: entry.deviceAt ?? null,
					clock_skew_ms: entry.deviceAt ? countedAt.getTime() - new Date(entry.deviceAt).getTime() || 0 : null,
					overwrite: entry.overwrite,
					counted_by: userId,
					note: entry.note?.trim() || null,
				}
			}),
			{ onConflict: "count_id,client_event_id", ignoreDuplicates: true }
		)
		if (error) throw new Error(`Erro ao gravar os lançamentos: ${error.message}`)
		return { received: data.entries.length, receivedAt: receivedAt.toISOString() }
	})

/**
 * Item fora da folha que apareceu na prateleira entra no escopo. A função do
 * banco trava a contagem e confere o status; item de outra contagem aberta é
 * recusado com o nome do problema. (Antes era um `upsert(onConflict)` contra
 * índice de EXPRESSÃO — sempre 42P10 —, sem guarda de status.)
 */
export const addFoundItemFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), ingredientId: z.uuid().optional(), frozenPreparationId: z.uuid().optional() }))
	.handler(async ({ data }) => {
		if ((data.ingredientId == null) === (data.frozenPreparationId == null)) {
			throw new Error("Informe o insumo OU a preparação")
		}
		const inv = inventory()
		const { data: count, error: countError } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(2, Number(count.kitchen_id))

		const { data: added, error } = await inv.rpc("add_found_item", {
			p_count_id: data.countId,
			p_ingredient_id: data.ingredientId ?? null,
			p_frozen_preparation_id: data.frozenPreparationId ?? null,
		})
		if (error) throw new Error(`Erro ao incluir o achado: ${error.message}`)
		return { added: added === true }
	})

/**
 * Item do escopo que ninguém contou só vira zero com esta marcação. O gatilho
 * do banco recusa a marcação em contagem já encerrada — sem ele, a marca
 * gravada depois da aprovação dizia "sucesso" e o item nunca era zerado.
 */
export const acceptNotCountedFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), ingredientId: z.uuid().optional(), frozenPreparationId: z.uuid().optional(), accepted: z.boolean() }))
	.handler(async ({ data }) => {
		if ((data.ingredientId == null) === (data.frozenPreparationId == null)) {
			throw new Error("Informe o insumo OU a preparação")
		}
		const inv = inventory()
		const { data: count, error: countError } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(3, Number(count.kitchen_id))

		// pela função do banco: ela trava a CONTAGEM antes da linha do escopo, a
		// ordem de todo o resto; o UPDATE direto invertia e dava deadlock com a
		// aprovação
		const { error } = await inv.rpc("set_not_counted_accepted", {
			p_count_id: data.countId,
			p_ingredient_id: data.ingredientId ?? null,
			p_frozen_preparation_id: data.frozenPreparationId ?? null,
			p_accepted: data.accepted,
		})
		if (error) throw new Error(`Erro ao marcar o item: ${error.message}`)
		return { accepted: data.accepted }
	})

/** Encerra a coleta e leva para revisão. */
export const reviewInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count, error: countError } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(3, Number(count.kitchen_id))

		// condicional ao status E conferida: sem o `select`, mudar nada contava
		// como sucesso
		const { data: moved, error } = await inv.from("inventory_count").update({ status: "review" }).eq("id", data.countId).eq("status", "counting").select("id")
		if (error) throw new Error(`Erro ao encerrar a coleta: ${error.message}`)
		if ((moved ?? []).length === 0) throw new Error("A contagem não está em coleta")
		return { status: "review" as const }
	})

/**
 * Abre a rodada seguinte com as linhas que divergiram muito.
 *
 * Rodada nova é contagem NOVA apontando para a anterior, e não uma edição da
 * mesma: a rodada anterior é prova de que a primeira contagem deu outro
 * número. As três escritas (anterior para `recount`, rodada nova, escopo dela)
 * vão numa função do banco, sob trava: separadas, uma falha no meio deixava a
 * anterior em `recount` sem filha, e dois cliques abriam duas filhas.
 */
export const openRecountFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				countId: z.uuid(),
				ingredientIds: z.array(z.uuid()).max(500).default([]),
				// preparação congelada divergente também se reconta — ficava de fora
				frozenPreparationIds: z.array(z.uuid()).max(500).default([]),
			})
			.refine((value) => value.ingredientIds.length + value.frozenPreparationIds.length > 0, { message: "Escolha os itens a recontar" })
	)
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count, error: countError } = await inv.from("inventory_count").select("id, kitchen_id, round").eq("id", data.countId).maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(3, Number(count.kitchen_id))

		const { data: created, error } = await inv.rpc("open_recount", {
			p_count_id: data.countId,
			p_ingredient_ids: [...new Set(data.ingredientIds)],
			p_frozen_preparation_ids: [...new Set(data.frozenPreparationIds)],
			p_user: userId,
		})
		if (error) throw new Error(`Erro ao abrir a recontagem: ${error.message}`)
		return { countId: created as string, round: Number(count.round) + 1 }
	})

export const approveInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), exceptionReason: z.string().max(300).optional() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count, error: countError } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(3, Number(count.kitchen_id))

		const { data: result, error } = await inv.rpc("approve_inventory_count", {
			p_count_id: data.countId,
			p_actor: userId,
			p_exception_reason: data.exceptionReason?.trim() || null,
		})
		if (error) throw new Error(`Erro ao aprovar a contagem: ${error.message}`)
		const row = result?.[0]
		return {
			adjustmentId: (row?.adjustment_id as string | null) ?? null,
			lines: Number(row?.lines ?? 0),
			differenceValue: Number(row?.difference_value ?? 0),
		}
	})

/** Rejeita a contagem sem lançar nada — sob trava, e nunca depois de aprovada. */
export const rejectInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), reason: z.string().min(5).max(300) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count, error: countError } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
		if (countError) throw new Error(`Erro ao carregar a contagem: ${countError.message}`)
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(3, Number(count.kitchen_id))

		const { error } = await inv.rpc("reject_inventory_count", { p_count_id: data.countId, p_actor: userId, p_reason: data.reason.trim() })
		if (error) throw new Error(`Erro ao rejeitar a contagem: ${error.message}`)
		return { rejected: true }
	})
