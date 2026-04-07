import type { Database } from "./generated.ts"

type PortalSchema = Database["iefa"]

export type Tables<T extends keyof PortalSchema["Tables"]> = PortalSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PortalSchema["Tables"]> = PortalSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PortalSchema["Tables"]> = PortalSchema["Tables"][T]["Update"]
export type Views<T extends keyof PortalSchema["Views"]> = PortalSchema["Views"][T]["Row"]
export type Enums<T extends keyof PortalSchema["Enums"]> = PortalSchema["Enums"][T]
