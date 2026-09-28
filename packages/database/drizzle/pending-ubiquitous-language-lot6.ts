/**
 * TODO(db:types): tabela-ponte do rename 20260927180000 (lote 6 da linguagem ubíqua: SARAM), na
 * forma que `db:drizzle:pull` vai gerar depois do contract 20260927190000.
 *
 * Mesma ideia de `src/pending-ubiquitous-language-lot6.ts`: o código usa só `saram` antes do pull.
 * O barrel (`sisub.ts`) exporta este objeto com o identificador que o pull produz
 * (`userDataInCore`, com `saram` no lugar de `nrOrdem`); a export explícita vence a do
 * `export *` do schema gerado. Só colunas: índices e FKs não entram nas queries. Nenhuma
 * relational query atravessa `user_data` (`relations.ts` segue apontando para o objeto gerado).
 * `core.person` e `core.person_identity` não são lidas pelo Drizzle.
 *
 * Depois de aplicar 20260927180000 e rodar `db:drizzle:pull`, o tripwire do fim quebra o
 * typecheck: apague este arquivo e o reexport dele em `sisub.ts`.
 */
import { bigint, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type * as generated from "./schema"
import { core } from "./schema"

export const userDataInCore = core.table("user_data", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	email: text().notNull(),
	defaultMessHallId: bigint("default_mess_hall_id", { mode: "number" }),
	saram: text(),
})

/**
 * Tripwire: quando o pull trouxer `saram` em `userDataInCore`, este tipo deixa de satisfazer `true`
 * e o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot6Tripwire = AssertTrue<"saram" extends keyof (typeof generated)["userDataInCore"] ? false : true>
