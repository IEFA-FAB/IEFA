/**
 * TODO(db:types): tipos-ponte do rename 20260927130000 (lote 7 da linguagem ubíqua: arranchamento).
 *
 * A migration renomeia `kitchen.meal_forecasts` → `kitchen.arranchamento` (colunas iguais; só a
 * FK `meal_forecasts_mess_hall_id_fkey` → `arranchamento_mess_hall_id_fkey` muda nos tipos). O
 * código passa a usar só o nome novo antes de os tipos serem regerados (a regra é aplicar a
 * migration antes de regerar), então este arquivo descreve o estado FINAL do banco por cima de
 * `generated.ts`: a tabela nova existe e o nome antigo (a view de compatibilidade que o expand
 * mantém para o código em produção) some dos tipos. Uso do nome antigo não compila.
 *
 * Depois de aplicar 20260927130000 e rodar `db:types`, o tripwire do fim deste arquivo quebra o
 * typecheck: apague o arquivo e volte `index.ts` e `sisub.ts` a importar `Database` de
 * `./generated.ts`.
 */
import type { Database as GeneratedDatabase } from "./generated.ts"

type Kitchen = GeneratedDatabase["kitchen"]
type KitchenTables = Kitchen["Tables"]
type MealForecasts = KitchenTables["meal_forecasts"]

type RenameFk<N> = N extends `meal_forecasts_${infer Rest}` ? `arranchamento_${Rest}` : N

type RenameRelationship<R> = R extends { foreignKeyName: infer Name } ? Omit<R, "foreignKeyName"> & { foreignKeyName: RenameFk<Name> } : R

/** Mapped type homomórfico sobre parâmetro: a tupla de `Relationships` continua tupla. */
type RenameRelationships<T> = { [K in keyof T]: RenameRelationship<T[K]> }

type Arranchamento = {
	Row: MealForecasts["Row"]
	Insert: MealForecasts["Insert"]
	Update: MealForecasts["Update"]
	Relationships: RenameRelationships<MealForecasts["Relationships"]>
}

export type Database = Omit<GeneratedDatabase, "kitchen"> & {
	kitchen: Omit<Kitchen, "Tables"> & { Tables: Omit<KitchenTables, "meal_forecasts"> & { arranchamento: Arranchamento } }
}

/**
 * Tripwire: quando `db:types` trouxer `arranchamento`, este tipo deixa de satisfazer `true` e o
 * typecheck para aqui. É o aviso de apagar este arquivo (ver o cabeçalho).
 */
type AssertTrue<T extends true> = T
export type PendingUbiquitousLanguageLot7Tripwire = AssertTrue<"arranchamento" extends keyof KitchenTables ? false : true>
