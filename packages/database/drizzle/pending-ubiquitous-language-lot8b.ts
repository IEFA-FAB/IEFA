/**
 * TODO(db:types): tabelas-ponte do rename 20260927150000 (lote 8b da linguagem ubíqua: o efetivo
 * por refeitório), na forma que `db:drizzle:pull` vai gerar.
 *
 * Mesma ideia de `src/pending-ubiquitous-language-lot8b.ts`: o código usa só os nomes novos antes
 * do pull. O barrel (`sisub.ts`) exporta estes objetos com os mesmos identificadores que o pull
 * produz: `messHallWorkforceInKitchen` (a antiga `kitchen.rancho`) e `workforceSubmissionInKitchen`
 * com `messHallWorkforceId` no lugar de `ranchoId`. A export explícita do barrel vence a do
 * `export *` do schema gerado, que ainda tem a coluna antiga. Só colunas: índices, FKs e CHECKs não
 * entram nas queries.
 *
 * `relations.ts` (o `db.query … with`) continua apontando para os objetos gerados, que ainda usam
 * os nomes antigos; por isso nenhuma relational query atravessa estas tabelas — os joins do efetivo
 * são explícitos (`operations/workforce.ts`).
 *
 * Depois de aplicar 20260927150000 e rodar `db:drizzle:pull`, o tripwire do fim quebra o
 * typecheck: apague este arquivo e o bloco de reexport dele em `sisub.ts`.
 */
import { bigint, bigserial, boolean, integer, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type * as generated from "./schema"
import { kitchen } from "./schema"

export const messHallWorkforceInKitchen = kitchen.table("mess_hall_workforce", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	unitId: bigint("unit_id", { mode: "number" }).notNull(),
	eloCode: text("elo_code").notNull(),
	code: text().notNull(),
	displayName: text("display_name").notNull(),
	messHallId: bigint("mess_hall_id", { mode: "number" }),
	kitchenId: bigint("kitchen_id", { mode: "number" }),
	producesOwnMeals: boolean("produces_own_meals").default(true).notNull(),
	active: boolean().default(true).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
})

/**
 * Sem `rancho_id`: o espelho do expand a preenche a partir de `mess_hall_workforce_id`, e o contract
 * a derruba. O pull depois do expand ainda a trará (anulável); o código não a cita.
 */
export const workforceSubmissionInKitchen = kitchen.table("workforce_submission", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	surveyId: uuid("survey_id").notNull(),
	declaredTotal: integer("declared_total"),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
	submittedBy: uuid("submitted_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
	messHallWorkforceId: bigint("mess_hall_workforce_id", { mode: "number" }).notNull(),
})

/**
 * Tripwire: quando o pull trouxer `messHallWorkforceInKitchen`, este tipo deixa de satisfazer
 * `true` e o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot8bTripwire = AssertTrue<"messHallWorkforceInKitchen" extends keyof typeof generated ? false : true>
