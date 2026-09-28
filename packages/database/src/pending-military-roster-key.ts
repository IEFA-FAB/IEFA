/**
 * TODO(db:types): tipos-ponte de 20260927170000 (change `lgpd-military-roster-key`).
 *
 * A migration dá ao espelho `core.user_military_data` a PK física `id` (o CPF vira `UNIQUE`), cria
 * a view `core.military_identity` (SARAM, posto, nome de guerra, OM e data da carga, sem CPF e sem
 * nome completo) e a função `core.military_masked_cpf`. O código passa a ler a view antes de os
 * tipos serem regerados (a regra é aplicar a migration antes de regerar), então este arquivo
 * descreve o estado FINAL do banco por cima de `generated.ts`.
 *
 * Depois de aplicar 20260927170000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts`, `core.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Core = GeneratedDatabase["core"]
type MirrorTable = Core["Tables"]["user_military_data"]

type MilitaryIdentityRow = {
	data_atualizacao: string | null
	nome_guerra: string | null
	posto: string | null
	saram: string | null
	sg_org: string | null
}

/** Só leitura para os apps: o grant do `service_role` na view é SELECT. */
type MilitaryIdentityView = {
	Row: MilitaryIdentityRow
	Relationships: []
}

/** A coluna nova do espelho: identity, gerada no INSERT (o patch não a informa). */
type Mirror = {
	Row: MirrorTable["Row"] & { id: number }
	Insert: MirrorTable["Insert"] & { id?: number }
	Update: MirrorTable["Update"] & { id?: number }
	Relationships: MirrorTable["Relationships"]
}

export type Database = Omit<GeneratedDatabase, "core"> & {
	core: Omit<Core, "Tables" | "Views" | "Functions"> & {
		Tables: Omit<Core["Tables"], "user_military_data"> & { user_military_data: Mirror }
		Views: Core["Views"] & { military_identity: MilitaryIdentityView }
		Functions: Core["Functions"] & { military_masked_cpf: { Args: { p_saram: string }; Returns: string } }
	}
}

/**
 * Tripwire: quando `db:types` trouxer `military_identity`, este tipo deixa de satisfazer `true` e o
 * typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingMilitaryRosterKeyTripwire = AssertTrue<"military_identity" extends keyof Core["Views"] ? false : true>
