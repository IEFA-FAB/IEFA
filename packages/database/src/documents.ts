import type { Database } from "./generated.ts"

type DocumentsSchema = Database["documents"]

export type Tables<T extends keyof DocumentsSchema["Tables"]> = DocumentsSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DocumentsSchema["Tables"]> = DocumentsSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DocumentsSchema["Tables"]> = DocumentsSchema["Tables"][T]["Update"]

// ---- Tables ----
export type OfficialDocument = Tables<"official_document">
export type OfficialDocumentInsert = TablesInsert<"official_document">
export type OfficialDocumentUpdate = TablesUpdate<"official_document">

export type AiGeneration = Tables<"ai_generation">
export type AiGenerationInsert = TablesInsert<"ai_generation">
