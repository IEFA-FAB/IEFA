/**
 * TODO(db:types): tipos-ponte do rename 20260927080000 (lote 4 da linguagem ubíqua, finanças).
 *
 * A migration acrescenta `finance.budget_credit.received_credit` (crédito recebido; a UG executora
 * não tem dotação) e `available_credit_siafi` (crédito disponível no SIAFI) ao lado de `dotacao` e
 * `saldo_siafi`, e `finance.empenho.issuer_ug` ao lado de `ug_emitente`, espelhadas por trigger. O
 * código usa só os nomes novos antes de os tipos serem regerados (a regra é aplicar a migration
 * antes de regerar), então este arquivo descreve o estado FINAL do banco por cima de
 * `generated.ts`: as colunas novas existem e as antigas, que o expand mantém só para o código em
 * produção, somem dos tipos. Uso do nome antigo não compila.
 *
 * Depois de aplicar 20260927080000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Finance = GeneratedDatabase["finance"]
type FinanceTables = Finance["Tables"]

type TableShape = { Row: object; Insert: object; Update: object; Relationships: readonly unknown[] }

/** Troca o nome das chaves preservando o `?` (mapped type homomórfico com `as`). */
type RenameKeys<T, M extends Record<string, string>> = { [K in keyof T as K extends keyof M ? M[K] : K]: T[K] }

type RenameColumns<T extends TableShape, M extends Record<string, string>> = {
	Row: RenameKeys<T["Row"], M>
	Insert: RenameKeys<T["Insert"], M>
	Update: RenameKeys<T["Update"], M>
	Relationships: T["Relationships"]
}

type Renamed = {
	budget_credit: RenameColumns<FinanceTables["budget_credit"], { dotacao: "received_credit"; saldo_siafi: "available_credit_siafi" }>
	empenho: RenameColumns<FinanceTables["empenho"], { ug_emitente: "issuer_ug" }>
}

export type Database = Omit<GeneratedDatabase, "finance"> & {
	finance: Omit<Finance, "Tables"> & { Tables: Omit<FinanceTables, keyof Renamed> & Renamed }
}

/**
 * Tripwire: quando `db:types` trouxer `received_credit`, este tipo deixa de satisfazer `true` e o
 * typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingFinanceNamingTripwire = AssertTrue<"received_credit" extends keyof FinanceTables["budget_credit"]["Row"] ? false : true>
