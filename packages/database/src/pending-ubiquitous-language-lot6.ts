/**
 * TODO(db:types): tipos-ponte do rename 20260927180000 (lote 6 da linguagem ubíqua: SARAM).
 *
 * A migration espelha `core.user_data."nrOrdem"` e `core.person.nr_ordem` em `saram` e acrescenta
 * `saram` a `core.person_identity`. O código passa a usar só os nomes novos antes de os tipos serem
 * regerados (a regra é aplicar a migration antes de regerar), então este arquivo descreve o estado
 * FINAL do banco (depois do contract 20260927190000) por cima de `pending-military-roster-key.ts`,
 * que por sua vez fica por cima de `generated.ts`: as colunas antigas somem dos tipos, e uso do nome
 * antigo não compila. O espelho do cadastro de pessoal (`core.user_military_data."nrOrdem"`) não
 * muda: é o nome do sistema de origem.
 *
 * Depois de aplicar 20260927180000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts`, `core.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts` (ou da ponte de 20260927170000, se ela ainda existir).
 */
import type { Database as GeneratedDatabase } from "./generated.ts"
import type { Database as BaseDatabase } from "./pending-military-roster-key.ts"

type Core = BaseDatabase["core"]

/** Troca o nome das chaves preservando o `?` (mapped type homomórfico com `as`). */
type RenameKeys<T, Old extends string> = { [K in keyof T as K extends Old ? "saram" : K]: T[K] }

type RenameTable<T, Old extends string> = T extends { Row: infer Row; Insert: infer Insert; Update: infer Update; Relationships: infer Relationships }
	? { Row: RenameKeys<Row, Old>; Insert: RenameKeys<Insert, Old>; Update: RenameKeys<Update, Old>; Relationships: Relationships }
	: T

type RenameView<T, Old extends string> = T extends { Row: infer Row; Relationships: infer Relationships }
	? { Row: RenameKeys<Row, Old>; Relationships: Relationships }
	: T

export type Database = Omit<BaseDatabase, "core"> & {
	core: Omit<Core, "Tables" | "Views"> & {
		Tables: Omit<Core["Tables"], "user_data" | "person"> & {
			user_data: RenameTable<Core["Tables"]["user_data"], "nrOrdem">
			person: RenameTable<Core["Tables"]["person"], "nr_ordem">
		}
		Views: Omit<Core["Views"], "person_identity"> & { person_identity: RenameView<Core["Views"]["person_identity"], "nr_ordem"> }
	}
}

/**
 * Tripwire: quando `db:types` trouxer `core.user_data.saram`, este tipo deixa de satisfazer `true` e
 * o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot6Tripwire = AssertTrue<"saram" extends keyof GeneratedDatabase["core"]["Tables"]["user_data"]["Row"] ? false : true>
