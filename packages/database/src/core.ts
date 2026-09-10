import type { Database } from "./generated.ts"

type CoreSchema = Database["core"]

export type Tables<T extends keyof CoreSchema["Tables"]> = CoreSchema["Tables"][T]["Row"]
export type Views<T extends keyof CoreSchema["Views"]> = CoreSchema["Views"][T]["Row"]
export type TablesInsert<T extends keyof CoreSchema["Tables"]> = CoreSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof CoreSchema["Tables"]> = CoreSchema["Tables"][T]["Update"]

// ---- Pessoa ----

/**
 * Pessoa que o ERP precisa nomear — com ou sem conta.
 *
 * Guarda só ponteiros (`nr_ordem` para o efetivo, `user_id` para a conta) e o
 * `display_name` de reserva. Posto, nome de guerra e e-mail NÃO moram aqui: têm
 * dono e mudam lá. Para exibir, use `PersonIdentity`.
 */
export type Person = Tables<"person">
export type PersonInsert = TablesInsert<"person">
export type PersonUpdate = TablesUpdate<"person">

/** Pessoa com o melhor rótulo já resolvido (militar → e-mail → nome de reserva). */
export type PersonIdentity = Views<"person_identity">

// ---- Cadastros compartilhados ----
export type UserData = Tables<"user_data">
export type UserMilitaryData = Tables<"user_military_data">
export type Unit = Tables<"units">
