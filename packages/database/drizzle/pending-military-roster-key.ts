/**
 * TODO(db:types): view-ponte de 20260927170000 (change `lgpd-military-roster-key`), na forma que
 * `db:drizzle:pull` vai gerar.
 *
 * Mesma ideia de `src/pending-military-roster-key.ts`: o código lê `core.military_identity` antes
 * do pull. O barrel (`sisub.ts`) exporta este objeto com o identificador que o pull produz
 * (`militaryIdentityInCore`). `.existing()`: a view já existe no banco; o Drizzle não a cria.
 *
 * Depois de aplicar 20260927170000 e rodar `db:drizzle:pull`, o tripwire do fim quebra o
 * typecheck: apague este arquivo e o reexport dele em `sisub.ts`.
 */
import { text, timestamp } from "drizzle-orm/pg-core"
import type * as generated from "./schema"
import { core } from "./schema"

export const militaryIdentityInCore = core
	.view("military_identity", {
		saram: text(),
		posto: text(),
		nomeGuerra: text("nome_guerra"),
		sgOrg: text("sg_org"),
		dataAtualizacao: timestamp("data_atualizacao", { withTimezone: true, mode: "string" }),
	})
	.existing()

/**
 * Tripwire: quando o pull trouxer `militaryIdentityInCore`, este tipo deixa de satisfazer `true` e
 * o typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingMilitaryRosterKeyTripwire = AssertTrue<"militaryIdentityInCore" extends keyof typeof generated ? false : true>
