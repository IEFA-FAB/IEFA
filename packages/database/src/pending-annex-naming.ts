/**
 * TODO(db:types): tipos-ponte do rename 20260927010000 (anexo quantitativo e previsão de demanda).
 *
 * A migration renomeia `procurement.kitchen_ata_draft*` → `kitchen_demand_forecast*` (com
 * `draft_id` → `forecast_id`) e troca `ata_id`/`ata_item_id` por `procurement_list_id`/
 * `procurement_list_item_id` em `procurement_arp`, `procurement_arp_item`,
 * `procurement_pesquisa_preco` e `procurement_pesquisa_preco_item`. O código passa a usar só os
 * nomes novos antes de os tipos serem regerados (a regra é aplicar a migration antes de regerar),
 * então este arquivo descreve o estado FINAL do banco por cima de `generated.ts`: as tabelas
 * novas existem, e os nomes antigos — a view de compatibilidade e as colunas espelhadas que o
 * expand mantém para o código em produção — somem dos tipos. Uso do nome antigo não compila.
 *
 * Depois de aplicar 20260927010000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Procurement = GeneratedDatabase["procurement"]
type ProcurementTables = Procurement["Tables"]

type TableShape = { Row: object; Insert: object; Update: object; Relationships: readonly unknown[] }

/** Troca o nome de uma chave preservando o `?` (mapped type homomórfico com `as`). */
type RenameKey<T, From extends PropertyKey, To extends PropertyKey> = { [K in keyof T as K extends From ? To : K]: T[K] }

type RenameColumn<T extends TableShape, From extends PropertyKey, To extends PropertyKey, Relationships extends readonly unknown[]> = {
	Row: RenameKey<T["Row"], From, To>
	Insert: RenameKey<T["Insert"], From, To>
	Update: RenameKey<T["Update"], From, To>
	Relationships: Relationships
}

type Fk<Name extends string, Column extends string, Referenced extends string> = {
	foreignKeyName: Name
	columns: [Column]
	isOneToOne: false
	referencedRelation: Referenced
	referencedColumns: ["id"]
}

/** Troca, na lista de relacionamentos, a FK da coluna antiga pela da coluna nova. */
type ReplaceFk<Relationships extends readonly unknown[], From extends string, To> = {
	[K in keyof Relationships]: Relationships[K] extends { foreignKeyName: From } ? To : Relationships[K]
}

type Renamed = {
	kitchen_demand_forecast: ProcurementTables["kitchen_ata_draft"]
	kitchen_demand_forecast_selection: RenameColumn<
		ProcurementTables["kitchen_ata_draft_selection"],
		"draft_id",
		"forecast_id",
		[Fk<"kitchen_demand_forecast_selection_forecast_id_fkey", "forecast_id", "kitchen_demand_forecast">]
	>
	kitchen_demand_forecast_import: RenameColumn<
		ProcurementTables["kitchen_ata_draft_import"],
		"draft_id",
		"forecast_id",
		[
			Fk<"kitchen_demand_forecast_import_forecast_id_fkey", "forecast_id", "kitchen_demand_forecast">,
			Fk<"kitchen_demand_forecast_import_list_id_fkey", "list_id", "procurement_list">,
		]
	>
	procurement_arp: RenameColumn<
		ProcurementTables["procurement_arp"],
		"ata_id",
		"procurement_list_id",
		ReplaceFk<
			ProcurementTables["procurement_arp"]["Relationships"],
			"procurement_arp_ata_id_fkey",
			Fk<"procurement_arp_procurement_list_id_fkey", "procurement_list_id", "procurement_list">
		>
	>
	procurement_arp_item: RenameColumn<
		ProcurementTables["procurement_arp_item"],
		"ata_item_id",
		"procurement_list_item_id",
		ReplaceFk<
			ProcurementTables["procurement_arp_item"]["Relationships"],
			"procurement_arp_item_ata_item_id_fkey",
			Fk<"procurement_arp_item_procurement_list_item_id_fkey", "procurement_list_item_id", "procurement_list_item">
		>
	>
	procurement_pesquisa_preco: RenameColumn<
		ProcurementTables["procurement_pesquisa_preco"],
		"ata_id",
		"procurement_list_id",
		ReplaceFk<
			ProcurementTables["procurement_pesquisa_preco"]["Relationships"],
			"procurement_pesquisa_preco_ata_id_fkey",
			Fk<"procurement_pesquisa_preco_procurement_list_id_fkey", "procurement_list_id", "procurement_list">
		>
	>
	procurement_pesquisa_preco_item: RenameColumn<
		ProcurementTables["procurement_pesquisa_preco_item"],
		"ata_item_id",
		"procurement_list_item_id",
		ReplaceFk<
			ProcurementTables["procurement_pesquisa_preco_item"]["Relationships"],
			"procurement_pesquisa_preco_item_ata_item_id_fkey",
			Fk<"procurement_pesquisa_preco_item_procurement_list_item_id_fkey", "procurement_list_item_id", "procurement_list_item">
		>
	>
}

type Dropped = "kitchen_ata_draft" | "kitchen_ata_draft_selection" | "kitchen_ata_draft_import" | keyof Renamed

export type Database = Omit<GeneratedDatabase, "procurement"> & {
	procurement: Omit<Procurement, "Tables"> & { Tables: Omit<ProcurementTables, Dropped> & Renamed }
}

/**
 * Tripwire: quando `db:types` trouxer `kitchen_demand_forecast`, este tipo deixa de satisfazer
 * `true` e o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingAnnexNamingTripwire = AssertTrue<"kitchen_demand_forecast" extends keyof ProcurementTables ? false : true>
