import type { Database } from "./generated.ts"

type SucontSchema = Database["sucont"]

export type Tables<T extends keyof SucontSchema["Tables"]> = SucontSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof SucontSchema["Tables"]> = SucontSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof SucontSchema["Tables"]> = SucontSchema["Tables"][T]["Update"]

// ---- Tables ----
export type UnidadeGestora = Tables<"unidade_gestora">
export type UnidadeGestoraInsert = TablesInsert<"unidade_gestora">
export type UnidadeGestoraUpdate = TablesUpdate<"unidade_gestora">

export type ChecklistItem = Tables<"checklist_item">
export type ChecklistItemInsert = TablesInsert<"checklist_item">
export type ChecklistItemUpdate = TablesUpdate<"checklist_item">

export type Notice = Tables<"notice">
export type NoticeInsert = TablesInsert<"notice">
export type NoticeUpdate = TablesUpdate<"notice">

export type WorkspaceNote = Tables<"workspace_note">
export type WorkspaceNoteUpdate = TablesUpdate<"workspace_note">

export type Report = Tables<"report">
export type ReportInsert = TablesInsert<"report">
export type ReportUpdate = TablesUpdate<"report">

export type Document = Tables<"document">
export type DocumentInsert = TablesInsert<"document">

export type AnalysisRun = Tables<"analysis_run">
export type AnalysisRunInsert = TablesInsert<"analysis_run">

export type GeneratedMessage = Tables<"generated_message">
export type GeneratedMessageInsert = TablesInsert<"generated_message">
