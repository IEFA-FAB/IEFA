import type { Database } from "./generated.ts"

type JournalSchema = Database["journal"]

export type Tables<T extends keyof JournalSchema["Tables"]> = JournalSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof JournalSchema["Tables"]> = JournalSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof JournalSchema["Tables"]> = JournalSchema["Tables"][T]["Update"]
export type Views<T extends keyof JournalSchema["Views"]> = JournalSchema["Views"][T]["Row"]
export type Enums<T extends keyof JournalSchema["Enums"]> = JournalSchema["Enums"][T]
