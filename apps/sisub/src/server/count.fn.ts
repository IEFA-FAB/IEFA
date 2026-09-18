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
import { evaluateCountLine, lineQuantity, unlottedReference } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
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
			.select("id, status, type, scope, blind, round, competencia, created_at, expires_at, approved_at, adjustment_id", { count: "exact" })
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
}

/**
 * A folha.
 *
 * `reveal` decide se o saldo viaja na resposta. Ele é calculado AQUI, com o
 * nível do usuário e o estado do documento, e nunca vem do cliente: a folha
 * cega que devolve o saldo "só para o React esconder" não é cega.
 */
export const fetchCountSheetFn = createServerFn({ method: "GET" })
	.validator(z.object({ countId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv
			.from("inventory_count")
			.select("id, kitchen_id, status, type, scope, blind, round, competencia, created_at, expires_at, created_by, approved_at, approval_exception_reason")
			.eq("id", data.countId)
			.maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		const ctx = await requireStorageForKitchen(2, Number(count.kitchen_id))

		// Cego enquanto está sendo contado, e só para quem conta. Nível 3 vê
		// porque é ele quem revisa e aprova — e depois de encerrada todo mundo vê,
		// senão a revisão não teria como ser conferida.
		const counting = count.status === "counting" || count.status === "recount" || count.status === "draft"
		const isManager = hasPermission(ctx.permissions, "storage", 3, { type: "kitchen", id: Number(count.kitchen_id) })
		const reveal = !count.blind || !counting || isManager

		const [{ data: scope }, { data: entries }] = await Promise.all([
			inv.from("count_scope_item").select("ingredient_id, frozen_preparation_id, found, not_counted_accepted").eq("count_id", data.countId),
			inv
				.from("inventory_count_entry")
				.select("lot_id, ingredient_id, frozen_preparation_id, quantity, counted_at, overwrite, counted_by")
				.eq("count_id", data.countId),
		])

		type Entry = {
			lot_id: string | null
			ingredient_id: string | null
			frozen_preparation_id: string | null
			quantity: number
			counted_at: string
			overwrite: boolean
		}
		const entryRows = (entries ?? []) as Entry[]

		// lotes da cozinha, para montar as linhas e resolver a referência sem lote
		const { data: lots } = await inv
			.from("stock_lot")
			.select("id, ingredient_id, frozen_preparation_id, short_code, lot_code, expiry_date, location")
			.eq("kitchen_id", Number(count.kitchen_id))
		type Lot = {
			id: string
			ingredient_id: string | null
			frozen_preparation_id: string | null
			short_code: string | null
			lot_code: string | null
			expiry_date: string | null
			location: string | null
		}
		const lotRows = (lots ?? []) as Lot[]
		const lotById = new Map(lotRows.map((lot) => [lot.id, lot]))

		// agrupa os lançamentos por linha (lote, ou item quando é o monte)
		const grouped = new Map<string, { lotId: string | null; ingredientId: string | null; frozenPreparationId: string | null; entries: Entry[] }>()
		for (const entry of entryRows) {
			const lot = entry.lot_id ? lotById.get(entry.lot_id) : undefined
			const key = entry.lot_id ? `l:${entry.lot_id}` : `i:${entry.ingredient_id ?? entry.frozen_preparation_id}`
			const line = grouped.get(key) ?? {
				lotId: entry.lot_id,
				ingredientId: entry.ingredient_id ?? lot?.ingredient_id ?? null,
				frozenPreparationId: entry.frozen_preparation_id ?? lot?.frozen_preparation_id ?? null,
				entries: [],
			}
			line.entries.push(entry)
			grouped.set(key, line)
		}

		// linhas do escopo que ninguém tocou também aparecem: é o item esquecido
		// na prateleira, e ele precisa estar visível para ser contado ou aceito
		type ScopeRow = { ingredient_id: string | null; frozen_preparation_id: string | null; found: boolean; not_counted_accepted: boolean }
		const scopeRows = (scope ?? []) as ScopeRow[]
		for (const item of scopeRows) {
			const key = `i:${item.ingredient_id ?? item.frozen_preparation_id}`
			const touched = [...grouped.values()].some((line) => line.ingredientId === item.ingredient_id && line.frozenPreparationId === item.frozen_preparation_id)
			if (!touched && !grouped.has(key)) {
				grouped.set(key, { lotId: null, ingredientId: item.ingredient_id, frozenPreparationId: item.frozen_preparation_id, entries: [] })
			}
		}

		const ingredientIds = [...new Set([...grouped.values()].map((line) => line.ingredientId).filter(Boolean))] as string[]
		const frozenIds = [...new Set([...grouped.values()].map((line) => line.frozenPreparationId).filter(Boolean))] as string[]
		const kit = kitchen()
		const describe = new Map<string, { description: string; measureUnit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: rows } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			for (const row of rows ?? []) describe.set(row.id, { description: row.description, measureUnit: row.measure_unit })
		}
		if (frozenIds.length > 0) {
			const { data: rows } = await kit.from("frozen_preparation").select("id, description").in("id", frozenIds)
			for (const row of rows ?? []) describe.set(row.id, { description: row.description, measureUnit: null })
		}

		const settings = await toleranceFor(Number(count.kitchen_id))
		const countedLotIdsByItem = new Map<string, string[]>()
		for (const line of grouped.values()) {
			if (!line.lotId) continue
			const key = line.ingredientId ?? line.frozenPreparationId ?? ""
			countedLotIdsByItem.set(key, [...(countedLotIdsByItem.get(key) ?? []), line.lotId])
		}

		const scopeByItem = new Map(scopeRows.map((item) => [item.ingredient_id ?? item.frozen_preparation_id ?? "", item]))
		const lines: CountSheetLine[] = []
		for (const [key, line] of grouped) {
			const itemKey = line.ingredientId ?? line.frozenPreparationId ?? ""
			const meta = describe.get(itemKey)
			const lot = line.lotId ? lotById.get(line.lotId) : undefined
			const counted = lineQuantity(line.entries.map((entry) => ({ quantity: Number(entry.quantity), countedAt: entry.counted_at, overwrite: entry.overwrite })))

			let ledger: number | null = null
			let verdict: { difference: number; differenceValue: number; needsRecount: boolean } | null = null
			if (reveal) {
				// o instante que vale é o do ÚLTIMO lançamento da linha; sem
				// lançamento nenhum, o de agora
				const instant = line.entries.reduce<string | null>((latest, entry) => (latest == null || entry.counted_at > latest ? entry.counted_at : latest), null)
				const { data: balance } = await inv.rpc("balance_at", {
					p_kitchen_id: Number(count.kitchen_id),
					p_lot_id: line.lotId,
					p_ingredient_id: line.lotId ? null : line.ingredientId,
					p_frozen_preparation_id: line.lotId ? null : line.frozenPreparationId,
					p_instant: instant ?? new Date().toISOString(),
				})
				ledger = Number(balance ?? 0)

				// A linha SEM lote de um item não se compara com o saldo do item
				// inteiro: ela responde pelos lotes que ninguém contou. Sem isso,
				// contar "arroz 5 KG" numa cozinha com L1 (contado) e L2 acusaria
				// sobra no item e falta em L2 — duas linhas de ajuste para um estoque
				// que está certo.
				if (!line.lotId) {
					const itemLots = lotRows.filter((row) => (row.ingredient_id ?? row.frozen_preparation_id) === itemKey).map((row) => ({ lotId: row.id, balance: 0 }))
					if (itemLots.length > 0) {
						const counted = countedLotIdsByItem.get(itemKey) ?? []
						for (const itemLot of itemLots) {
							const { data: lotBalance } = await inv.rpc("balance_at", {
								p_kitchen_id: Number(count.kitchen_id),
								p_lot_id: itemLot.lotId,
								p_ingredient_id: null,
								p_frozen_preparation_id: null,
								p_instant: instant ?? new Date().toISOString(),
							})
							itemLot.balance = Number(lotBalance ?? 0)
						}
						ledger = unlottedReference(0, itemLots, counted)
					}
				}

				const evaluated = evaluateCountLine({ counted, ledger, unitCost: 0 }, { percent: settings.tolerancePct, floorValue: settings.toleranceFloorValue })
				verdict = { difference: evaluated.difference, differenceValue: evaluated.differenceValue, needsRecount: evaluated.needsRecount }
			}

			const scopeItem = scopeByItem.get(itemKey)
			lines.push({
				key,
				lotId: line.lotId,
				ingredientId: line.ingredientId,
				frozenPreparationId: line.frozenPreparationId,
				description: meta?.description ?? "(item sem cadastro)",
				measureUnit: meta?.measureUnit ?? null,
				lotLabel: lot?.short_code ?? lot?.lot_code ?? null,
				expiryDate: lot?.expiry_date ?? null,
				location: lot?.location ?? null,
				counted,
				entries: line.entries.length,
				ledger,
				difference: verdict?.difference ?? null,
				differenceValue: verdict?.differenceValue ?? null,
				needsRecount: verdict?.needsRecount ?? null,
				found: scopeItem?.found ?? false,
				notCountedAccepted: scopeItem?.not_counted_accepted ?? false,
			})
		}

		lines.sort((a, b) => a.description.localeCompare(b.description, "pt-BR") || (a.lotLabel ?? "").localeCompare(b.lotLabel ?? ""))
		return {
			count,
			reveal,
			lines,
			scopeItems: scopeRows.length,
			notCounted: lines.filter((line) => line.entries === 0).length,
		}
	})

/** Tolerâncias da cozinha, com os defaults do banco. */
async function toleranceFor(kitchenId: number) {
	const { data: row } = await inventory()
		.from("kitchen_stock_settings")
		.select("issue_tolerance_pct, issue_tolerance_floor_value")
		.eq("kitchen_id", kitchenId)
		.maybeSingle()
	return {
		tolerancePct: Number(row?.issue_tolerance_pct ?? 10),
		toleranceFloorValue: Number(row?.issue_tolerance_floor_value ?? 20),
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
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id, status").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(2, Number(count.kitchen_id))
		if (!["draft", "counting", "recount"].includes(String(count.status))) {
			throw new Error(`Contagem em "${count.status}" não aceita lançamento`)
		}

		for (const entry of data.entries) {
			const targets = [entry.lotId, entry.ingredientId, entry.frozenPreparationId].filter(Boolean).length
			if (targets !== 1) throw new Error("Cada lançamento aponta para UM alvo: lote, insumo ou preparação")
		}

		// O desvio do relógio e a janela de sincronização são resolvidos no
		// CLIENTE (`resolveCountedAt`), que é quem conhece o instante do
		// dispositivo; aqui o servidor guarda o que recebeu e, quando não veio
		// nada, usa o próprio relógio — que é o caso online.
		const receivedAt = new Date().toISOString()
		const { error } = await inv.from("inventory_count_entry").upsert(
			data.entries.map((entry) => ({
				count_id: data.countId,
				lot_id: entry.lotId ?? null,
				ingredient_id: entry.ingredientId ?? null,
				frozen_preparation_id: entry.frozenPreparationId ?? null,
				quantity: entry.quantity,
				client_event_id: entry.clientEventId,
				counted_at: entry.deviceAt ?? receivedAt,
				device_at: entry.deviceAt ?? null,
				overwrite: entry.overwrite,
				counted_by: userId,
				note: entry.note?.trim() || null,
			})),
			{ onConflict: "count_id,client_event_id", ignoreDuplicates: true }
		)
		if (error) throw new Error(`Erro ao gravar os lançamentos: ${error.message}`)
		return { received: data.entries.length, receivedAt }
	})

/** Item fora da folha que apareceu na prateleira entra no escopo. */
export const addFoundItemFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), ingredientId: z.uuid().optional(), frozenPreparationId: z.uuid().optional() }))
	.handler(async ({ data }) => {
		if ((data.ingredientId == null) === (data.frozenPreparationId == null)) {
			throw new Error("Informe o insumo OU a preparação")
		}
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id, status").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(2, Number(count.kitchen_id))

		const { error } = await inv.from("count_scope_item").upsert(
			{
				count_id: data.countId,
				kitchen_id: Number(count.kitchen_id),
				ingredient_id: data.ingredientId ?? null,
				frozen_preparation_id: data.frozenPreparationId ?? null,
				found: true,
			},
			{ onConflict: "count_id,ingredient_id", ignoreDuplicates: true }
		)
		// item já em contagem aberta noutra folha bate no índice de sobreposição
		if (error) throw new Error(`Erro ao incluir o achado: ${error.message}. Ele pode estar em outra contagem aberta`)
		return { added: true }
	})

/** Item do escopo que ninguém contou só vira zero com esta marcação. */
export const acceptNotCountedFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), ingredientId: z.uuid().optional(), frozenPreparationId: z.uuid().optional(), accepted: z.boolean() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(3, Number(count.kitchen_id))

		let query = inv.from("count_scope_item").update({ not_counted_accepted: data.accepted }).eq("count_id", data.countId)
		query = data.ingredientId ? query.eq("ingredient_id", data.ingredientId) : query.eq("frozen_preparation_id", data.frozenPreparationId)
		const { error } = await query
		if (error) throw new Error(`Erro ao marcar o item: ${error.message}`)
		return { accepted: data.accepted }
	})

/** Encerra a coleta e leva para revisão. */
export const reviewInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id, status").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		await requireStorageForKitchen(3, Number(count.kitchen_id))
		if (!["counting", "recount"].includes(String(count.status))) throw new Error(`Contagem em "${count.status}" não está em coleta`)

		const { error } = await inv.from("inventory_count").update({ status: "review" }).eq("id", data.countId).eq("status", count.status)
		if (error) throw new Error(`Erro ao encerrar a coleta: ${error.message}`)
		return { status: "review" as const }
	})

/**
 * Abre a rodada seguinte com as linhas que divergiram muito.
 *
 * Rodada nova é contagem NOVA apontando para a anterior, e não uma edição da
 * mesma: a rodada anterior é prova de que a primeira contagem deu outro
 * número, e apagá-la para escrever por cima destruiria a única evidência de
 * que houve recontagem.
 */
export const openRecountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), ingredientIds: z.array(z.uuid()).min(1) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id, status, type, blind, round").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(3, Number(count.kitchen_id))
		if (count.status !== "review") throw new Error("A recontagem sai da revisão da rodada anterior")

		// a rodada anterior sai do ar ANTES: é ela que segura os itens no índice
		// de sobreposição, e a nova precisa dos mesmos itens
		const { error: closeError } = await inv.from("inventory_count").update({ status: "recount" }).eq("id", data.countId)
		if (closeError) throw new Error(`Erro ao encerrar a rodada: ${closeError.message}`)
		const { error: scopeError } = await inv.from("count_scope_item").update({ open: false }).eq("count_id", data.countId)
		if (scopeError) throw new Error(`Erro ao liberar o escopo da rodada: ${scopeError.message}`)

		const { data: created, error } = await inv
			.from("inventory_count")
			.insert({
				kitchen_id: Number(count.kitchen_id),
				status: "counting",
				type: count.type,
				scope: "item_list",
				scope_params: { ingredient_ids: data.ingredientIds },
				// rodada de recontagem é SEMPRE cega, mesmo que a primeira não fosse:
				// quem reconta sabendo o que a rodada anterior deu confirma o número
				// dela em vez de contar de novo
				blind: true,
				round: Number(count.round) + 1,
				parent_count_id: data.countId,
				created_by: userId,
			})
			.select("id")
			.single()
		if (error || !created) throw new Error(`Erro ao abrir a recontagem: ${error?.message}`)

		const { error: itemsError } = await inv.from("count_scope_item").insert(
			data.ingredientIds.map((ingredientId) => ({
				count_id: created.id,
				kitchen_id: Number(count.kitchen_id),
				ingredient_id: ingredientId,
			}))
		)
		if (itemsError) throw new Error(`Erro ao montar a folha da recontagem: ${itemsError.message}`)
		return { countId: created.id as string, round: Number(count.round) + 1 }
	})

export const approveInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), exceptionReason: z.string().max(300).optional() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id").eq("id", data.countId).maybeSingle()
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

/** Rejeita a contagem sem lançar nada. */
export const rejectInventoryCountFn = createServerFn({ method: "POST" })
	.validator(z.object({ countId: z.uuid(), reason: z.string().min(5).max(300) }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: count } = await inv.from("inventory_count").select("id, kitchen_id, status, notes").eq("id", data.countId).maybeSingle()
		if (!count) throw new Error("Contagem não encontrada")
		const { userId } = await requireStorageForKitchen(3, Number(count.kitchen_id))
		if (count.status === "approved") throw new Error("Contagem já aprovada")

		const { error } = await inv
			.from("inventory_count")
			.update({
				status: "rejected",
				// a observação do operador não é sobrescrita pelo motivo da rejeição
				notes: count.notes ? `${count.notes}\n\nRejeitada: ${data.reason.trim()}` : `Rejeitada: ${data.reason.trim()}`,
				confirmed_by: userId,
				confirmed_at: new Date().toISOString(),
			})
			.eq("id", data.countId)
		if (error) throw new Error(`Erro ao rejeitar a contagem: ${error.message}`)
		return { rejected: true }
	})
