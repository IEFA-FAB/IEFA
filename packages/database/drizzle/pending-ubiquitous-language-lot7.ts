/**
 * TODO(db:types): tabela-ponte do rename 20260927130000 (lote 7 da linguagem ubíqua:
 * arranchamento), na forma que `db:drizzle:pull` vai gerar.
 *
 * Mesma ideia de `src/pending-ubiquitous-language-lot7.ts`: o código usa só o nome novo antes do
 * pull. O barrel (`sisub.ts`) exporta este objeto com o identificador que o pull produz
 * (`arranchamentoInKitchen`). Só colunas: índices, FKs e CHECKs não entram nas queries.
 *
 * `relations.ts` (o `db.query … with`) continua apontando para o objeto gerado, que ainda usa o
 * nome antigo; por isso nenhuma relational query atravessa esta tabela — os joins são
 * explícitos.
 *
 * Depois de aplicar 20260927130000 e rodar `db:drizzle:pull`, o tripwire do fim quebra o
 * typecheck: apague este arquivo e o bloco de reexport dele em `sisub.ts`.
 */
import { bigint, boolean, date, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type * as generated from "./schema"
import { kitchen } from "./schema"

export const arranchamentoInKitchen = kitchen.table("arranchamento", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	date: date().notNull(),
	userId: uuid("user_id").notNull(),
	meal: text().notNull(),
	willEat: boolean("will_eat").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	messHallId: bigint("mess_hall_id", { mode: "number" }).notNull(),
})

/**
 * Tripwire: quando o pull trouxer `arranchamentoInKitchen`, este tipo deixa de satisfazer `true`
 * e o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot7Tripwire = AssertTrue<"arranchamentoInKitchen" extends keyof typeof generated ? false : true>
