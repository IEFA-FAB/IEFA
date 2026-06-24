import type { Database } from "./generated.ts"

/**
 * Type helpers escopados no schema `compras_gov_integration` (staging/sync do
 * Compras.gov — CATMAT/CATSER), separado de `sisub` no split de schemas por
 * domínio. Espelha o padrão de `./sisub.ts`.
 */
type ComprasGovSchema = Database["compras_gov_integration"]

export type Tables<T extends keyof ComprasGovSchema["Tables"]> = ComprasGovSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof ComprasGovSchema["Tables"]> = ComprasGovSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof ComprasGovSchema["Tables"]> = ComprasGovSchema["Tables"][T]["Update"]

export type ComprasMaterialItem = Tables<"compras_material_item">
export type ComprasServicoItem = Tables<"compras_servico_item">
export type ComprasSyncLog = Tables<"compras_sync_log">
export type ComprasSyncStep = Tables<"compras_sync_step">
