/**
 * @module opening-balance.server
 * Leituras de apoio da carga de abertura do estoque: catálogo, insumos já movimentados
 * na cozinha e sugestão de custo.
 *
 * Mora num `*.server.ts`, e não no `opening-balance.fn.ts`, porque fala com o banco por
 * `getServerClient` e é usada por mais de um handler: exportada de um arquivo de server fn,
 * ela ficaria viva no bundle do cliente e o build morreria em `[import-protection]`.
 */

import type { ConservationClass } from "@iefa/sisub-domain"
import { type OpeningCatalogIngredient, type OpeningCostCandidate, pickOpeningCost, pricePerBaseUnit } from "@iefa/sisub-domain/opening-balance"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { getServerClient } from "@/lib/supabase.server"
import { publicDbMessage } from "./db-error-message"

const inventory = () => getServerClient("inventory")
const kitchen = () => getServerClient("kitchen")
const core = () => getServerClient("core")
const procurement = () => getServerClient("procurement")

/**
 * Insumos do catálogo que podem entrar numa carga: vivos e que são INSUMO — preparação herdada
 * do SISUBWEB (`preparation_group_id` preenchido) não fica em prateleira como item de estoque.
 * São ~1.800 linhas: passa do teto de 1000 do PostgREST, por isso a leitura paginada.
 */
export async function loadOpeningCatalog(): Promise<OpeningCatalogIngredient[]> {
	const rows = await readAllPages("o catálogo de insumos", (from, to) =>
		kitchen()
			.from("ingredient")
			.select("id, legacy_id, description, measure_unit")
			.is("deleted_at", null)
			.is("preparation_group_id", null)
			.order("id")
			.range(from, to)
	)
	return rows
		.filter((row) => (row.description ?? "").trim() !== "")
		.map((row) => ({
			id: row.id,
			code: row.legacy_id != null ? String(row.legacy_id) : null,
			description: (row.description ?? "").trim(),
			measureUnit: row.measure_unit,
		}))
}

/** Códigos de `core.measure_unit`. */
export async function loadCanonicalUnits(): Promise<Set<string>> {
	const { data, error } = await core().from("measure_unit").select("code")
	if (error) throw new Error(`Erro ao carregar as unidades de medida: ${publicDbMessage(error)}`)
	return new Set((data ?? []).map((row) => row.code.toUpperCase()))
}

/**
 * Insumos que já têm movimento nesta cozinha.
 *
 * Lido de `stock_cost`, e não do ledger: o gatilho de custeio cria a linha de custo no
 * PRIMEIRO movimento de cada item e nada mais escreve nela, então ela é o índice de "já
 * movimentou" com uma linha por item — ler `stock_movement` inteiro da cozinha para isso
 * cresceria com cada saída do dia. É só a PRÉ-validação da tela: quem decide é
 * `post_opening_balance`, que olha o ledger sob trava.
 */
export async function loadMovedIngredientIds(kitchenId: number): Promise<Set<string>> {
	const rows = await readAllPages("os itens já movimentados", (from, to) =>
		// Paginado por `ingredient_id`: filtrada por cozinha, a chave de negócio de `stock_cost` é
		// o insumo — (kitchen_id, ingredient_id), única por índice parcial —, e ela já dá a ordem
		// estável que a paginação exige. O `id` (PK física desde 20260926219000) não acrescenta nada.
		inventory().from("stock_cost").select("ingredient_id").eq("kitchen_id", kitchenId).not("ingredient_id", "is", null).order("ingredient_id").range(from, to)
	)
	return new Set(rows.map((row) => row.ingredient_id).filter((id): id is string => Boolean(id)))
}

/**
 * Classe de conservação de cada insumo, pelo item de compra PADRÃO dele — é lá que o
 * acondicionamento exigido mora (`purchase_item.conservation_class`). Insumo sem item de compra
 * padrão fica sem classe, e a folha filtrada por classe não o traz.
 */
export async function loadConservationClasses(): Promise<Map<string, ConservationClass>> {
	const links = await readAllPages("a classe de conservação dos insumos", (from, to) =>
		procurement()
			.from("purchase_item_ingredient")
			.select("id, ingredient_id, purchase_item:purchase_item_id (conservation_class)")
			.eq("is_default", true)
			.order("id")
			.range(from, to)
	)
	const byIngredient = new Map<string, ConservationClass>()
	for (const link of links) {
		const value = link.purchase_item?.conservation_class
		if (value) byIngredient.set(link.ingredient_id, value as ConservationClass)
	}
	return byIngredient
}

/** Unidade (OM) dona da cozinha — decide qual ARP é "da casa" na sugestão de custo. */
export async function loadKitchenUnitId(kitchenId: number): Promise<number | null> {
	const { data, error } = await kitchen().from("kitchen").select("unit_id").eq("id", kitchenId).maybeSingle()
	if (error) throw new Error(`Erro ao carregar a cozinha: ${publicDbMessage(error)}`)
	return data?.unit_id != null ? Number(data.unit_id) : null
}

const toNumber = (value: number | string | null | undefined) => (value == null ? null : Number(value))

/**
 * Sugestão de custo por insumo, em R$ por unidade BASE.
 *
 * Duas fontes, na ordem do spec ("último preço de ARP ou pesquisa de preços"):
 *
 *  • **ARP** — `arp_item.valor_unitario`, o preço registrado na ata de registro
 *    de preços, ligado ao insumo pelo item do anexo quantitativo (`quantity_estimate_item_id`). Está na unidade de
 *    fornecimento; divide-se pelo `conversion_factor` do item do anexo.
 *  • **Pesquisa de preços** — `quantity_estimate_item.unit_price`, o preço que a unidade
 *    pesquisou para o anexo quantitativo em planejamento. Com item de compra vinculado (`purchase_quantity`
 *    preenchido) o preço é da unidade de compra e divide-se pelo fator; sem vínculo, o anexo
 *    trabalha na unidade do insumo (é assim que `AtaItemsTable` soma o total).
 *
 * Sem fator conhecido não há sugestão para aquela fonte: dividir por 1 por omissão é o que
 * transformaria o preço da caixa no preço do quilo — e "aceitar todas" gravaria isso em lote.
 */
export async function suggestOpeningCosts(ingredientIds: readonly string[], unitId: number | null): Promise<Map<string, OpeningCostCandidate>> {
	const proc = procurement()
	const listItems = await readAllPagesIn("os preços dos anexos quantitativos", ingredientIds, (chunk, from, to) =>
		proc
			.from("quantity_estimate_item")
			.select("id, quantity_estimate_id, ingredient_id, unit_price, conversion_factor, purchase_quantity, computed_at")
			.in("ingredient_id", chunk)
			.order("id")
			.range(from, to)
	)
	if (listItems.length === 0) return new Map()

	const lists = await readAllPagesIn(
		"os anexos quantitativos",
		listItems.map((item) => item.quantity_estimate_id),
		// Anexo descartado não sugere preço: o custo de abertura vira custo médio e depois
		// valor de balancete, e "aceitar todas" gravaria a fonte como se fosse pesquisa viva.
		(chunk, from, to) => proc.from("quantity_estimate").select("id, unit_id, title").in("id", chunk).is("deleted_at", null).order("id").range(from, to)
	)
	const listById = new Map(lists.map((list) => [list.id, list]))

	const arpItems = await readAllPagesIn(
		"os itens das atas de registro de preços",
		listItems.map((item) => item.id),
		(chunk, from, to) =>
			proc
				.from("arp_item")
				.select("id, arp_id, quantity_estimate_item_id, numero_item, valor_unitario")
				.in("quantity_estimate_item_id", chunk)
				.not("valor_unitario", "is", null)
				.order("id")
				.range(from, to)
	)
	const arps = await readAllPagesIn(
		"as atas de registro de preços",
		arpItems.map((item) => item.arp_id),
		(chunk, from, to) => proc.from("arp").select("id, unit_id, numero_ata, ano_ata, data_vigencia_inicio").in("id", chunk).order("id").range(from, to)
	)
	const arpById = new Map(arps.map((arp) => [arp.id, arp]))
	const listItemById = new Map(listItems.map((item) => [item.id, item]))

	const candidates = new Map<string, OpeningCostCandidate[]>()
	const push = (ingredientId: string, candidate: OpeningCostCandidate) => {
		const list = candidates.get(ingredientId) ?? []
		list.push(candidate)
		candidates.set(ingredientId, list)
	}

	for (const arpItem of arpItems) {
		const listItem = arpItem.quantity_estimate_item_id ? listItemById.get(arpItem.quantity_estimate_item_id) : undefined
		const arp = arpById.get(arpItem.arp_id)
		// `ingredient_id` nulo não chega: a consulta filtra por ele.
		if (!listItem?.ingredient_id || !arp) continue
		const unitCost = pricePerBaseUnit(toNumber(arpItem.valor_unitario), toNumber(listItem.conversion_factor))
		if (unitCost == null) continue
		push(listItem.ingredient_id, {
			source: "ata",
			unitCost,
			reference: `ARP ${arp.numero_ata}${arp.ano_ata ? `/${arp.ano_ata}` : ""}${arpItem.numero_item != null ? `, item ${arpItem.numero_item}` : ""}`,
			sameUnit: unitId != null && arp.unit_id === unitId,
			date: arp.data_vigencia_inicio,
		})
	}

	for (const item of listItems) {
		if (!item.ingredient_id) continue
		const factor = item.purchase_quantity != null ? toNumber(item.conversion_factor) : 1
		const unitCost = pricePerBaseUnit(toNumber(item.unit_price), factor)
		if (unitCost == null) continue
		// Sem a linha em `listById` o anexo foi descartado. A ARP acima continua valendo: a ata é
		// preço registrado por si, e o anexo ali só dá o fator.
		const list = listById.get(item.quantity_estimate_id)
		if (!list) continue
		push(item.ingredient_id, {
			source: "price_research",
			unitCost,
			reference: `Pesquisa de preços — ${list.title}`,
			sameUnit: unitId != null && list.unit_id === unitId,
			date: item.computed_at ? item.computed_at.slice(0, 10) : null,
		})
	}

	const picked = new Map<string, OpeningCostCandidate>()
	for (const [ingredientId, list] of candidates) {
		const best = pickOpeningCost(list)
		if (best) picked.set(ingredientId, best)
	}
	return picked
}
