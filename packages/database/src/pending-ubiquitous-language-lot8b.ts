/**
 * TODO(db:types): tipos-ponte do rename 20260927150000 (lote 8b da linguagem ubíqua: o efetivo por
 * refeitório).
 *
 * A migration renomeia `kitchen.rancho` → `kitchen.mess_hall_workforce` (com as FKs) e espelha
 * `kitchen.workforce_submission.rancho_id` em `mess_hall_workforce_id`. O código passa a usar só os
 * nomes novos antes de os tipos serem regerados (a regra é aplicar a migration antes de regerar),
 * então este arquivo descreve o estado FINAL do banco por cima de `generated.ts`: a tabela e a
 * coluna novas existem, os relacionamentos apontam para elas, e os nomes antigos (a view de
 * compatibilidade `kitchen.rancho`, a coluna espelhada `rancho_id` e as views `core.rancho` e
 * `core.workforce_submission`, que o contract derruba) somem dos tipos. Uso do nome antigo não
 * compila.
 *
 * Depois de aplicar 20260927150000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Core = GeneratedDatabase["core"]
type Kitchen = GeneratedDatabase["kitchen"]
type KitchenTables = Kitchen["Tables"]

/** A coluna espelhada: `rancho_id` → `mess_hall_workforce_id` (em `workforce_submission`). */
type RenameColumn<C> = C extends "rancho_id" ? "mess_hall_workforce_id" : C
type RenameColumns<T> = { [K in keyof T]: RenameColumn<T[K]> }

/** Troca o nome das chaves preservando o `?` (mapped type homomórfico com `as`). */
type RenameKeys<T> = { [K in keyof T as RenameColumn<K>]: T[K] }

/** Nome da constraint depois do rename (prefixo da tabela e a coluna espelhada). */
type RenameFk<N> = N extends "workforce_submission_rancho_id_fkey"
	? "workforce_submission_mess_hall_workforce_id_fkey"
	: N extends `rancho_${infer Rest}`
		? `mess_hall_workforce_${Rest}`
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
			referencedRelation: Referenced extends "rancho" ? "mess_hall_workforce" : Referenced
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

/** Todas as tabelas do schema com os relacionamentos para a renomeada já apontando o nome novo. */
type Retargeted = { [K in Exclude<keyof KitchenTables, "rancho">]: RenameTable<KitchenTables[K]> }
type Renamed = { mess_hall_workforce: RenameTable<KitchenTables["rancho"]> }

export type Database = Omit<GeneratedDatabase, "core" | "kitchen"> & {
	core: Omit<Core, "Views"> & { Views: Omit<Core["Views"], "rancho" | "workforce_submission"> }
	kitchen: Omit<Kitchen, "Tables"> & { Tables: Retargeted & Renamed }
}

/**
 * Tripwire: quando `db:types` trouxer `mess_hall_workforce`, este tipo deixa de satisfazer `true` e
 * o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot8bTripwire = AssertTrue<"mess_hall_workforce" extends keyof KitchenTables ? false : true>
