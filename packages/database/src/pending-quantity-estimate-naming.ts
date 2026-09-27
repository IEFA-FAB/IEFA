/**
 * TODO(db:types): tipos-ponte do rename 20260927040000 (anexo quantitativo → `quantity_estimate`).
 *
 * A migration renomeia `procurement.procurement_list*` → `procurement.quantity_estimate*` (com
 * `list_id` → `quantity_estimate_id`, `list_kitchen_id` → `quantity_estimate_kitchen_id`,
 * `max_margin_percent` → `max_increase_percent`, `margin_justification` →
 * `max_quantity_justification` e `total_quantity` → `estimated_quantity`) e troca
 * `procurement_list_id`/`procurement_list_item_id`/`list_id` por `quantity_estimate_id`/
 * `quantity_estimate_item_id` em `procurement_arp`, `procurement_arp_item`,
 * `procurement_pesquisa_preco`, `procurement_pesquisa_preco_item`, `price_research_emission` e
 * `kitchen_demand_forecast_import`. O código passa a usar só os nomes novos antes de os tipos
 * serem regerados (a regra é aplicar a migration antes de regerar), então este arquivo descreve o
 * estado FINAL do banco por cima de `generated.ts`: as tabelas novas existem, e os nomes antigos
 * (as views de compatibilidade e as colunas espelhadas que o expand mantém para o código em
 * produção) somem dos tipos. Uso do nome antigo não compila.
 *
 * Depois de aplicar 20260927040000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Procurement = GeneratedDatabase["procurement"]
type ProcurementTables = Procurement["Tables"]

type TableShape = { Row: object; Insert: object; Update: object; Relationships: readonly unknown[] }

/** Troca o nome das chaves preservando o `?` (mapped type homomórfico com `as`). */
type RenameKeys<T, M extends Record<string, string>> = { [K in keyof T as K extends keyof M ? M[K] : K]: T[K] }

type RenameColumns<T extends TableShape, M extends Record<string, string>, Relationships extends readonly unknown[]> = {
	Row: RenameKeys<T["Row"], M>
	Insert: RenameKeys<T["Insert"], M>
	Update: RenameKeys<T["Update"], M>
	Relationships: Relationships
}

type Fk<Name extends string, Column extends string, Referenced extends string, ReferencedColumn extends string = "id"> = {
	foreignKeyName: Name
	columns: [Column]
	isOneToOne: false
	referencedRelation: Referenced
	referencedColumns: [ReferencedColumn]
}

/** Troca, na lista de relacionamentos, a FK da coluna antiga pela da coluna nova. */
type ReplaceFk<Relationships extends readonly unknown[], From extends string, To> = {
	[K in keyof Relationships]: Relationships[K] extends { foreignKeyName: From } ? To : Relationships[K]
}

type Renamed = {
	quantity_estimate: RenameColumns<
		ProcurementTables["procurement_list"],
		{ max_margin_percent: "max_increase_percent"; margin_justification: "max_quantity_justification" },
		[Fk<"quantity_estimate_segment_id_fkey", "segment_id", "procurement_segment">]
	>
	quantity_estimate_item: RenameColumns<
		ProcurementTables["procurement_list_item"],
		{ list_id: "quantity_estimate_id"; total_quantity: "estimated_quantity"; max_margin_percent: "max_increase_percent" },
		[
			Fk<"quantity_estimate_item_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">,
			Fk<"quantity_estimate_item_purchase_item_id_fkey", "purchase_item_id", "purchase_item">,
			Fk<"quantity_estimate_item_purchase_item_id_fkey", "purchase_item_id", "v_purchase_item_conditioning_review", "purchase_item_id">,
		]
	>
	quantity_estimate_kitchen: RenameColumns<
		ProcurementTables["procurement_list_kitchen"],
		{ list_id: "quantity_estimate_id" },
		[Fk<"quantity_estimate_kitchen_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">]
	>
	quantity_estimate_selection: RenameColumns<
		ProcurementTables["procurement_list_selection"],
		{ list_kitchen_id: "quantity_estimate_kitchen_id" },
		[Fk<"quantity_estimate_selection_quantity_estimate_kitchen_id_fkey", "quantity_estimate_kitchen_id", "quantity_estimate_kitchen">]
	>
	quantity_estimate_snapshot_component: RenameColumns<
		ProcurementTables["procurement_list_snapshot_component"],
		{ list_id: "quantity_estimate_id"; total_quantity: "estimated_quantity"; max_margin_percent: "max_increase_percent" },
		[Fk<"quantity_estimate_snapshot_component_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">]
	>
	quantity_estimate_snapshot_selection: RenameColumns<
		ProcurementTables["procurement_list_snapshot_selection"],
		{ list_id: "quantity_estimate_id" },
		[Fk<"quantity_estimate_snapshot_selection_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">]
	>
	procurement_arp: RenameColumns<
		ProcurementTables["procurement_arp"],
		{ procurement_list_id: "quantity_estimate_id" },
		ReplaceFk<
			ProcurementTables["procurement_arp"]["Relationships"],
			"procurement_arp_procurement_list_id_fkey",
			Fk<"procurement_arp_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">
		>
	>
	procurement_arp_item: RenameColumns<
		ProcurementTables["procurement_arp_item"],
		{ procurement_list_item_id: "quantity_estimate_item_id" },
		ReplaceFk<
			ProcurementTables["procurement_arp_item"]["Relationships"],
			"procurement_arp_item_procurement_list_item_id_fkey",
			Fk<"procurement_arp_item_quantity_estimate_item_id_fkey", "quantity_estimate_item_id", "quantity_estimate_item">
		>
	>
	procurement_pesquisa_preco: RenameColumns<
		ProcurementTables["procurement_pesquisa_preco"],
		{ procurement_list_id: "quantity_estimate_id" },
		ReplaceFk<
			ProcurementTables["procurement_pesquisa_preco"]["Relationships"],
			"procurement_pesquisa_preco_procurement_list_id_fkey",
			Fk<"procurement_pesquisa_preco_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">
		>
	>
	procurement_pesquisa_preco_item: RenameColumns<
		ProcurementTables["procurement_pesquisa_preco_item"],
		{ procurement_list_item_id: "quantity_estimate_item_id" },
		ReplaceFk<
			ProcurementTables["procurement_pesquisa_preco_item"]["Relationships"],
			"procurement_pesquisa_preco_item_procurement_list_item_id_fkey",
			Fk<"procurement_pesquisa_preco_item_quantity_estimate_item_id_fkey", "quantity_estimate_item_id", "quantity_estimate_item">
		>
	>
	price_research_emission: RenameColumns<
		ProcurementTables["price_research_emission"],
		{ list_id: "quantity_estimate_id" },
		ReplaceFk<
			ProcurementTables["price_research_emission"]["Relationships"],
			"price_research_emission_list_id_fkey",
			Fk<"price_research_emission_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">
		>
	>
	kitchen_demand_forecast_import: RenameColumns<
		ProcurementTables["kitchen_demand_forecast_import"],
		{ list_id: "quantity_estimate_id" },
		ReplaceFk<
			ProcurementTables["kitchen_demand_forecast_import"]["Relationships"],
			"kitchen_demand_forecast_import_list_id_fkey",
			Fk<"kitchen_demand_forecast_import_quantity_estimate_id_fkey", "quantity_estimate_id", "quantity_estimate">
		>
	>
}

type Dropped =
	| "procurement_list"
	| "procurement_list_item"
	| "procurement_list_kitchen"
	| "procurement_list_selection"
	| "procurement_list_snapshot_component"
	| "procurement_list_snapshot_selection"
	| keyof Renamed

export type Database = Omit<GeneratedDatabase, "procurement"> & {
	procurement: Omit<Procurement, "Tables"> & { Tables: Omit<ProcurementTables, Dropped> & Renamed }
}

/**
 * Tripwire: quando `db:types` trouxer `quantity_estimate`, este tipo deixa de satisfazer `true` e o
 * typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingQuantityEstimateNamingTripwire = AssertTrue<"quantity_estimate" extends keyof ProcurementTables ? false : true>
