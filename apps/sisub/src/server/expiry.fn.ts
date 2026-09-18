/**
 * @module expiry.fn
 * Vencimentos: o que já venceu, o que vence dentro do limite da cozinha e o
 * perecível que entrou sem validade.
 *
 * O limite não é um número só. Três dias de antecedência é muito para o feijão
 * e tarde demais para o leite pasteurizado — por isso ele é do item quando a
 * cozinha souber dizer, e da classe de conservação quando não souber.
 *
 * CLIENT: getServerClient (service role, schemas inventory/kitchen).
 * AUTH: `storage` nível 1 lê; 2 marca "usar primeiro"; 3 define política.
 * TABLES: inventory.v_lot_expiry, expiry_alert_policy, stock_lot.
 * @domain kitchen
 * @migration 20260919120000_expiry_alert_policy
 */

import { hasAnyPermission } from "@iefa/pbac"
import { brasiliaToday, CONSERVATION_CLASSES, EXPIRY_BANDS, type ExpiryBand } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

// biome-ignore lint/suspicious/noExplicitAny: view e tabela novas, fora dos tipos gerados
type LooseClient = { from: (table: string) => any }

const inventory = () => getServerClient("inventory") as unknown as LooseClient
const kitchen = () => getServerClient("kitchen") as unknown as LooseClient

export interface ExpiryLotRow {
	lotId: string
	shortCode: string | null
	lotCode: string | null
	ingredientId: string | null
	frozenPreparationId: string | null
	description: string
	measureUnit: string | null
	location: string | null
	expiryDate: string | null
	daysLeft: number | null
	alertDays: number
	conservationClass: string | null
	balance: number
	balanceValue: number
	useFirst: boolean
	quarantined: boolean
	/** Já existe baixa deste lote aguardando aprovação — não se lança outra. */
	pendingWriteOff: boolean
	band: ExpiryBand
}

/**
 * Painel por faixa.
 *
 * `limit` e `total` porque a lista é consumida também por ferramenta de IA, e
 * sem o total o modelo lê 30 linhas e conclui que a cozinha tem 30 lotes
 * vencendo. O corte é aplicado DEPOIS da contagem, por faixa.
 */
export const fetchExpiringLotsFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			bands: z.array(z.enum(EXPIRY_BANDS)).optional(),
			limit: z.number().int().min(1).max(500).default(200),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const bands = data.bands?.length ? data.bands : [...EXPIRY_BANDS]

		const { data: rows, error } = await inventory()
			.from("v_lot_expiry")
			.select(
				"lot_id, short_code, lot_code, ingredient_id, frozen_preparation_id, location, expiry_date, days_left, alert_days, conservation_class, balance, balance_value, use_first, quarantined_at, band"
			)
			.eq("kitchen_id", data.kitchenId)
			.in("band", bands)
		if (error) throw new Error(`Erro ao carregar os vencimentos: ${error.message}`)

		type Row = {
			lot_id: string
			short_code: string | null
			lot_code: string | null
			ingredient_id: string | null
			frozen_preparation_id: string | null
			location: string | null
			expiry_date: string | null
			days_left: number | null
			alert_days: number
			conservation_class: string | null
			balance: number
			balance_value: number
			use_first: boolean
			quarantined_at: string | null
			band: ExpiryBand
		}
		const all = (rows ?? []) as Row[]

		// descrição e unidade vêm dos dois catálogos que alimentam o lote
		const ingredientIds = [...new Set(all.map((row) => row.ingredient_id).filter(Boolean))] as string[]
		const frozenIds = [...new Set(all.map((row) => row.frozen_preparation_id).filter(Boolean))] as string[]
		const kit = kitchen()
		const describe = new Map<string, { description: string; measureUnit: string | null }>()
		if (ingredientIds.length > 0) {
			const { data: ingredients, error: ingredientError } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
			// sem o nome, todo lote vira "(item sem cadastro)" — parece defeito de
			// catálogo, e é falha de leitura
			if (ingredientError) throw new Error(`Erro ao carregar os insumos: ${ingredientError.message}`)
			for (const row of ingredients ?? []) describe.set(row.id, { description: row.description, measureUnit: row.measure_unit })
		}
		if (frozenIds.length > 0) {
			const { data: frozen, error: frozenError } = await kit.from("frozen_preparation").select("id, description").in("id", frozenIds)
			if (frozenError) throw new Error(`Erro ao carregar as preparações: ${frozenError.message}`)
			for (const row of frozen ?? []) describe.set(row.id, { description: row.description, measureUnit: null })
		}

		// Baixa pendente de aprovação: sem esta marca, o lote vencido continuava na
		// faixa com o botão habilitado, e o segundo clique criava uma SEGUNDA baixa
		// do saldo inteiro — aprovar as duas tentaria baixar o lote duas vezes.
		const pendingLots = new Set<string>()
		//
		// Só os lotes VENCIDOS entram na consulta — são os únicos com "Baixar" —,
		// o que mantém a lista de ids na URL do tamanho da faixa urgente, e não do
		// estoque inteiro. E só `pending_approval` conta: rascunho é transitório, e
		// um rascunho que sobrou de lançamento que falhou marcava o lote como
		// pendente para sempre, sem que ninguém pudesse aprová-lo.
		const lotIds = all.filter((row) => row.band === "expired").map((row) => row.lot_id)
		if (lotIds.length > 0) {
			const { data: pending, error: pendingError } = await inventory()
				.from("stock_adjustment_item")
				.select("lot_id, stock_adjustment!inner(status)")
				.in("lot_id", lotIds)
				.eq("direction", "out")
				.eq("stock_adjustment.status", "pending_approval")
			if (pendingError) throw new Error(`Erro ao conferir baixas pendentes: ${pendingError.message}`)
			for (const row of (pending ?? []) as Array<{ lot_id: string | null }>) if (row.lot_id) pendingLots.add(row.lot_id)
		}

		const BAND_ORDER: Record<ExpiryBand, number> = { expired: 0, critical: 1, warning: 2, no_expiry: 3 }
		const mapped: ExpiryLotRow[] = all
			.map((row) => {
				const key = row.ingredient_id ?? row.frozen_preparation_id ?? ""
				const meta = describe.get(key)
				return {
					lotId: row.lot_id,
					shortCode: row.short_code,
					lotCode: row.lot_code,
					ingredientId: row.ingredient_id,
					frozenPreparationId: row.frozen_preparation_id,
					description: meta?.description ?? "(item sem cadastro)",
					measureUnit: meta?.measureUnit ?? null,
					location: row.location,
					expiryDate: row.expiry_date,
					daysLeft: row.days_left == null ? null : Number(row.days_left),
					alertDays: Number(row.alert_days),
					conservationClass: row.conservation_class,
					balance: Number(row.balance),
					balanceValue: Number(row.balance_value),
					useFirst: Boolean(row.use_first),
					quarantined: row.quarantined_at != null,
					pendingWriteOff: pendingLots.has(row.lot_id),
					band: row.band,
				}
			})
			.sort((a, b) => {
				const byBand = BAND_ORDER[a.band] - BAND_ORDER[b.band]
				if (byBand !== 0) return byBand
				// dentro da faixa, o que vence antes primeiro; sem validade, pelo nome
				if (a.daysLeft == null && b.daysLeft == null) return a.description.localeCompare(b.description, "pt-BR")
				if (a.daysLeft == null) return 1
				if (b.daysLeft == null) return -1
				return a.daysLeft - b.daysLeft
			})

		const totals = {
			expired: { lots: 0, value: 0 },
			critical: { lots: 0, value: 0 },
			warning: { lots: 0, value: 0 },
			no_expiry: { lots: 0, value: 0 },
		} satisfies Record<ExpiryBand, { lots: number; value: number }>
		for (const row of mapped) {
			totals[row.band].lots += 1
			totals[row.band].value += row.balanceValue
		}

		return { lots: mapped.slice(0, data.limit), total: mapped.length, totals }
	})

/**
 * Contagem para o badge do menu e o bloco do painel.
 *
 * Consulta própria, e não o painel inteiro cortado: o badge aparece em toda
 * navegação e carregar 200 lotes com descrição para mostrar um número é o tipo
 * de coisa que faz o menu ficar lento sem ninguém entender por quê.
 */
export const fetchExpirySummaryFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		// Só as faixas que o resumo soma. Ler todo lote com saldo — inclusive a
		// faixa `ok`, que é a maioria — levava cozinha grande ao teto de 1000 linhas
		// do PostgREST, e o cartão mostrava menos vencido e menos risco do que há.
		const { data: rows, error } = await inventory()
			.from("v_lot_expiry")
			.select("band, balance_value")
			.eq("kitchen_id", data.kitchenId)
			.in("band", ["expired", "critical", "no_expiry"])
		if (error) throw new Error(`Erro ao resumir os vencimentos: ${error.message}`)

		let urgentLots = 0
		let valueAtRisk = 0
		let noExpiryLots = 0
		for (const row of (rows ?? []) as Array<{ band: ExpiryBand; balance_value: number }>) {
			if (row.band === "expired" || row.band === "critical") {
				urgentLots += 1
				valueAtRisk += Number(row.balance_value)
			}
			if (row.band === "no_expiry") noExpiryLots += 1
		}
		return { urgentLots, valueAtRisk, noExpiryLots }
	})

/**
 * "Usar primeiro": o lote fura a fila da alocação de saída.
 *
 * É a única alavanca do almoxarife sobre a ordem FEFO, e existe para o caso em
 * que a prateleira sabe algo que a validade não diz — a embalagem já aberta, o
 * lote que ficou fora da câmara na descarga.
 */
export const setLotUseFirstFn = createServerFn({ method: "POST" })
	.validator(z.object({ lotId: z.uuid(), useFirst: z.boolean() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: lot } = await inv.from("stock_lot").select("id, kitchen_id, quarantined_at").eq("id", data.lotId).maybeSingle()
		if (!lot) throw new Error("Lote não encontrado")
		await requireStorageForKitchen(2, Number(lot.kitchen_id))
		// marcar "usar primeiro" um lote em quarentena é uma ordem que a alocação
		// vai ignorar: a quarentena exclui o lote antes de qualquer ordenação
		if (data.useFirst && lot.quarantined_at != null) throw new Error("Lote está em quarentena — libere antes de marcar para usar primeiro")

		const { error } = await inv.from("stock_lot").update({ use_first: data.useFirst }).eq("id", data.lotId)
		if (error) throw new Error(`Erro ao marcar o lote: ${error.message}`)
		return { useFirst: data.useFirst }
	})

/** Políticas da cozinha, com a global que vale quando ela não tem a sua. */
export const fetchExpiryPoliciesFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const { data: rows, error } = await inventory()
			.from("expiry_alert_policy")
			.select("id, kitchen_id, ingredient_id, conservation_class, alert_days, notes")
			.or(`kitchen_id.eq.${data.kitchenId},kitchen_id.is.null`)
		if (error) throw new Error(`Erro ao carregar as políticas de vencimento: ${error.message}`)

		type PolicyRow = {
			id: string
			kitchen_id: number | null
			ingredient_id: string | null
			conservation_class: string | null
			alert_days: number
			notes: string | null
		}
		const all = (rows ?? []) as PolicyRow[]
		const ingredientIds = [...new Set(all.map((row) => row.ingredient_id).filter(Boolean))] as string[]
		const names = new Map<string, string>()
		if (ingredientIds.length > 0) {
			const { data: ingredients, error: ingredientError } = await kitchen().from("ingredient").select("id, description").in("id", ingredientIds)
			if (ingredientError) throw new Error(`Erro ao carregar os insumos: ${ingredientError.message}`)
			for (const row of ingredients ?? []) names.set(row.id, row.description)
		}

		return all.map((row) => ({
			id: row.id,
			scope: row.kitchen_id == null ? ("global" as const) : ("kitchen" as const),
			ingredientId: row.ingredient_id,
			ingredientName: row.ingredient_id ? (names.get(row.ingredient_id) ?? null) : null,
			conservationClass: row.conservation_class,
			alertDays: Number(row.alert_days),
			notes: row.notes,
		}))
	})

/**
 * Grava a política da COZINHA. A global é da administração e não sai daqui:
 * deixar cada cozinha reescrever o default de toda a Força por uma tela de
 * estoque é como um parâmetro vira folclore.
 */
export const saveExpiryPolicyFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				kitchenId: z.number().int().positive(),
				ingredientId: z.uuid().optional(),
				conservationClass: z.enum(CONSERVATION_CLASSES).optional(),
				alertDays: z.number().int().min(0).max(365),
				notes: z.string().max(300).optional(),
			})
			.refine((value) => (value.ingredientId == null) !== (value.conservationClass == null), {
				message: "A política é de um ingrediente OU de uma classe de conservação",
			})
	)
	.handler(async ({ data }) => {
		const { userId } = await requireStorageForKitchen(3, data.kitchenId)
		const inv = inventory()
		// NÃO é `upsert(onConflict)`: os índices únicos desta tabela são de
		// EXPRESSÃO (`coalesce(kitchen_id, 0)`), e o Postgres não casa nome de
		// coluna com índice de expressão — todo save devolvia 42P10 e nenhuma
		// cozinha conseguia gravar política. Atualiza; se não havia linha, insere;
		// se outra pessoa inseriu no meio (23505), atualiza de novo.
		const values = { alert_days: data.alertDays, notes: data.notes?.trim() || null, updated_at: new Date().toISOString() }
		const matching = () => {
			const query = inv.from("expiry_alert_policy").update(values).eq("kitchen_id", data.kitchenId)
			return data.ingredientId ? query.eq("ingredient_id", data.ingredientId) : query.eq("conservation_class", data.conservationClass)
		}

		const { data: updated, error: updateError } = await matching().select("id")
		if (updateError) throw new Error(`Erro ao salvar a política de vencimento: ${updateError.message}`)
		if ((updated ?? []).length === 0) {
			const { error: insertError } = await inv.from("expiry_alert_policy").insert({
				kitchen_id: data.kitchenId,
				...(data.ingredientId ? { ingredient_id: data.ingredientId } : { conservation_class: data.conservationClass }),
				...values,
				created_by: userId,
			})
			if (insertError?.code === "23505") {
				const { error: retryError } = await matching()
				if (retryError) throw new Error(`Erro ao salvar a política de vencimento: ${retryError.message}`)
			} else if (insertError) {
				throw new Error(`Erro ao salvar a política de vencimento: ${insertError.message}`)
			}
		}
		return { saved: true }
	})

/** Remove a política da cozinha; volta a valer a global, e depois o default. */
export const deleteExpiryPolicyFn = createServerFn({ method: "POST" })
	.validator(z.object({ policyId: z.uuid() }))
	.handler(async ({ data }) => {
		const inv = inventory()
		const { data: policy } = await inv.from("expiry_alert_policy").select("id, kitchen_id").eq("id", data.policyId).maybeSingle()
		if (!policy) throw new Error("Política não encontrada")
		// política global não se apaga por aqui — o dono dela é a administração
		if (policy.kitchen_id == null) throw new Error("Política global não é editável pela cozinha")
		await requireStorageForKitchen(3, Number(policy.kitchen_id))

		const { error } = await inv.from("expiry_alert_policy").delete().eq("id", data.policyId)
		if (error) throw new Error(`Erro ao remover a política: ${error.message}`)
		return { deleted: true }
	})

/**
 * Lotes que vencem dentro do período planejado, agregados por item.
 *
 * A pergunta da nutricionista não é "quais lotes vencem" — é "o que eu preciso
 * gastar nesta semana". Por isso a resposta é por INSUMO, com a quantidade
 * somada e a primeira validade, e não uma lista de lotes: cardápio se planeja
 * por ingrediente.
 *
 * Lote em quarentena fica de fora: ele não vai ser alocado, e sugerir que a
 * cozinha o consuma é sugerir que sirva o que está retido.
 */
export const fetchExpiringInPeriodFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			/** Início do período na tela (ISO date). O corte efetivo é o mais tarde entre ele e hoje. */
			from: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional(),
			/** Fim do período planejado (ISO date), inclusive. */
			until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			limit: z.number().int().min(1).max(100).default(30),
		})
	)
	.handler(async ({ data }) => {
		// O bloco mora no PLANEJAMENTO, que é do módulo `kitchen`: a nutricionista
		// que planeja o cardápio nem sempre tem acesso ao estoque. Exigir `storage`
		// dava erro para ela — e o bloco some em erro, exatamente como se nada
		// estivesse vencendo. Lê quem tem `kitchen` ou `storage` nesta cozinha.
		const ctx = await requireAuth()
		if (!hasAnyPermission(ctx.permissions, ["kitchen", "storage"], 1, { type: "kitchen", id: data.kitchenId })) {
			throw new Error("Requer acesso à cozinha ou ao estoque desta cozinha")
		}
		// Olhando um mês FUTURO, o corte começa no início dele: lote que estraga
		// semanas antes do mês nem chega a ele, e sugeri-lo para aquele cardápio
		// é sugerir comida que não vai existir. No passado, o corte é hoje.
		const today = brasiliaToday()
		const from = data.from && data.from > today ? data.from : today
		const { data: rows, error } = await inventory()
			.from("v_lot_expiry")
			.select("ingredient_id, frozen_preparation_id, expiry_date, balance, balance_value, quarantined_at")
			.eq("kitchen_id", data.kitchenId)
			.not("expiry_date", "is", null)
			// Limite de BAIXO também: lote já vencido e ainda não baixado aparecia em
			// "aproveite no cardápio", e olhando um mês passado o bloco listava só
			// estoque vencido — sugerindo servir comida vencida. Vencido é assunto
			// da tela de vencimentos (baixar), nunca do planejamento.
			.gte("expiry_date", from)
			.lte("expiry_date", data.until)
		if (error) throw new Error(`Erro ao carregar os vencimentos do período: ${error.message}`)

		type Row = {
			ingredient_id: string | null
			frozen_preparation_id: string | null
			expiry_date: string
			balance: number
			balance_value: number
			quarantined_at: string | null
		}
		const byItem = new Map<string, { ingredientId: string | null; frozenPreparationId: string | null; quantity: number; value: number; firstExpiry: string }>()
		for (const row of ((rows ?? []) as Row[]).filter((row) => row.quarantined_at == null)) {
			const key = row.ingredient_id ?? row.frozen_preparation_id ?? ""
			if (!key) continue
			const current = byItem.get(key)
			if (!current) {
				byItem.set(key, {
					ingredientId: row.ingredient_id,
					frozenPreparationId: row.frozen_preparation_id,
					quantity: Number(row.balance),
					value: Number(row.balance_value),
					firstExpiry: row.expiry_date,
				})
				continue
			}
			current.quantity += Number(row.balance)
			current.value += Number(row.balance_value)
			if (row.expiry_date < current.firstExpiry) current.firstExpiry = row.expiry_date
		}

		const keys = [...byItem.keys()]
		const describe = new Map<string, { description: string; measureUnit: string | null }>()
		if (keys.length > 0) {
			const kit = kitchen()
			const ingredientIds = [...byItem.values()].map((item) => item.ingredientId).filter(Boolean) as string[]
			const frozenIds = [...byItem.values()].map((item) => item.frozenPreparationId).filter(Boolean) as string[]
			if (ingredientIds.length > 0) {
				const { data: ingredients, error: ingredientError } = await kit.from("ingredient").select("id, description, measure_unit").in("id", ingredientIds)
				if (ingredientError) throw new Error(`Erro ao carregar os insumos: ${ingredientError.message}`)
				for (const row of ingredients ?? []) describe.set(row.id, { description: row.description, measureUnit: row.measure_unit })
			}
			if (frozenIds.length > 0) {
				const { data: frozen, error: frozenError } = await kit.from("frozen_preparation").select("id, description").in("id", frozenIds)
				if (frozenError) throw new Error(`Erro ao carregar as preparações: ${frozenError.message}`)
				for (const row of frozen ?? []) describe.set(row.id, { description: row.description, measureUnit: null })
			}
		}

		const items = [...byItem.entries()]
			.map(([key, item]) => ({
				ingredientId: item.ingredientId,
				frozenPreparationId: item.frozenPreparationId,
				description: describe.get(key)?.description ?? "(item sem cadastro)",
				measureUnit: describe.get(key)?.measureUnit ?? null,
				quantity: item.quantity,
				value: item.value,
				firstExpiry: item.firstExpiry,
			}))
			// o que vence antes primeiro: é o que cabe no cardápio de segunda
			.sort((a, b) => (a.firstExpiry < b.firstExpiry ? -1 : a.firstExpiry > b.firstExpiry ? 1 : b.value - a.value))

		return { items: items.slice(0, data.limit), total: items.length }
	})
