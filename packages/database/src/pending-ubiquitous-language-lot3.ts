/**
 * TODO(db:types): tipos-ponte do rename 20260927060000 (lote 3 da linguagem ubíqua: pesquisa de
 * preços e prefixos redundantes).
 *
 * A migration renomeia, no schema `procurement`, `procurement_pesquisa_preco*` →
 * `price_research*` (com `amostra_id` → `price_sample_id` em `price_research_sample`),
 * `compras_amostra` → `price_sample`, `procurement_arp*` → `arp*` e `procurement_segment*` →
 * `segment*`, e as funções `procurement.upsert_compras_amostras` → `upsert_price_samples` e
 * `sisub.compras_amostra_fingerprint` → `price_sample_fingerprint`. O código passa a usar só os
 * nomes novos antes de os tipos serem regerados (a regra é aplicar a migration antes de regerar),
 * então este arquivo descreve o estado FINAL do banco por cima de `generated.ts`: as tabelas e
 * funções novas existem, os relacionamentos apontam para elas, e os nomes antigos (as views de
 * compatibilidade e os wrappers que o expand mantém para o código em produção) somem dos tipos.
 * Uso do nome antigo não compila.
 *
 * Depois de aplicar 20260927060000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Procurement = GeneratedDatabase["procurement"]
type ProcurementTables = Procurement["Tables"]
type Sisub = GeneratedDatabase["sisub"]

/** Nome antigo → nome novo das tabelas renomeadas. */
type TableRenames = {
	procurement_pesquisa_preco: "price_research"
	procurement_pesquisa_preco_item: "price_research_item"
	procurement_pesquisa_preco_amostra: "price_research_sample"
	compras_amostra: "price_sample"
	procurement_arp: "arp"
	procurement_arp_item: "arp_item"
	procurement_segment: "segment"
	procurement_segment_rule: "segment_rule"
}
type OldTable = keyof TableRenames

/** A única coluna renomeada: `amostra_id` → `price_sample_id` (em `price_research_sample`). */
type RenameColumn<C> = C extends "amostra_id" ? "price_sample_id" : C
type RenameColumns<T> = { [K in keyof T]: RenameColumn<T[K]> }

/** Troca o nome das chaves preservando o `?` (mapped type homomórfico com `as`). */
type RenameKeys<T> = { [K in keyof T as RenameColumn<K>]: T[K] }

/** Nome da constraint depois do rename (prefixo da tabela e a coluna `amostra_id`). */
type RenameFk<N> = N extends `procurement_pesquisa_preco_amostra_amostra_id_${infer Rest}`
	? `price_research_sample_price_sample_id_${Rest}`
	: N extends `procurement_pesquisa_preco_amostra_${infer Rest}`
		? `price_research_sample_${Rest}`
		: N extends `procurement_pesquisa_preco_${infer Rest}`
			? `price_research_${Rest}`
			: N extends `procurement_arp_${infer Rest}`
				? `arp_${Rest}`
				: N extends `procurement_segment_${infer Rest}`
					? `segment_${Rest}`
					: N

type RenameRelationship<R> = R extends {
	foreignKeyName: infer Name
	columns: infer Columns
	isOneToOne: infer OneToOne
	referencedRelation: infer Referenced
	referencedColumns: infer ReferencedColumns
}
	? {
			foreignKeyName: RenameFk<Name>
			columns: RenameColumns<Columns>
			isOneToOne: OneToOne
			referencedRelation: Referenced extends OldTable ? TableRenames[Referenced] : Referenced
			referencedColumns: ReferencedColumns
		}
	: R

type RenameTable<T> = T extends { Row: infer Row; Insert: infer Insert; Update: infer Update; Relationships: infer Relationships }
	? {
			Row: RenameKeys<Row>
			Insert: RenameKeys<Insert>
			Update: RenameKeys<Update>
			Relationships: { [K in keyof Relationships]: RenameRelationship<Relationships[K]> }
		}
	: T

/** Todas as tabelas do schema com os relacionamentos para as renomeadas já apontando o nome novo. */
type Retargeted = { [K in Exclude<keyof ProcurementTables, OldTable>]: RenameTable<ProcurementTables[K]> }
type Renamed = { [K in OldTable as TableRenames[K]]: RenameTable<ProcurementTables[K]> }

type ProcurementFunctions = Omit<Procurement["Functions"], "upsert_compras_amostras"> & {
	upsert_price_samples: Procurement["Functions"]["upsert_compras_amostras"]
}
type SisubFunctions = Omit<Sisub["Functions"], "compras_amostra_fingerprint"> & {
	price_sample_fingerprint: Sisub["Functions"]["compras_amostra_fingerprint"]
}

export type Database = Omit<GeneratedDatabase, "procurement" | "sisub"> & {
	procurement: Omit<Procurement, "Tables" | "Functions"> & { Tables: Retargeted & Renamed; Functions: ProcurementFunctions }
	sisub: Omit<Sisub, "Functions"> & { Functions: SisubFunctions }
}

/**
 * Tripwire: quando `db:types` trouxer `price_research`, este tipo deixa de satisfazer `true` e o
 * typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot3Tripwire = AssertTrue<"price_research" extends keyof ProcurementTables ? false : true>
