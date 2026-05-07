import type { Database } from "./generated.ts"

type FormsSchema = Database["forms"]

export type Tables<T extends keyof FormsSchema["Tables"]> = FormsSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof FormsSchema["Tables"]> = FormsSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof FormsSchema["Tables"]> = FormsSchema["Tables"][T]["Update"]
export type Enums<T extends keyof FormsSchema["Enums"]> = FormsSchema["Enums"][T]
