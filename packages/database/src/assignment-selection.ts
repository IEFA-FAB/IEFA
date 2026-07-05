import type { Database } from "./generated.ts"

type AssignmentSelectionSchema = Database["assignment_selection"]

export type Tables<T extends keyof AssignmentSelectionSchema["Tables"]> = AssignmentSelectionSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof AssignmentSelectionSchema["Tables"]> = AssignmentSelectionSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof AssignmentSelectionSchema["Tables"]> = AssignmentSelectionSchema["Tables"][T]["Update"]
export type Views<T extends keyof AssignmentSelectionSchema["Views"]> = AssignmentSelectionSchema["Views"][T]["Row"]

// ---- Tables ----
export type Edition = Tables<"edition">
export type EditionInsert = TablesInsert<"edition">
export type EditionUpdate = TablesUpdate<"edition">

export type Person = Tables<"person">
export type PersonInsert = TablesInsert<"person">
export type PersonUpdate = TablesUpdate<"person">

export type Vacancy = Tables<"vacancy">
export type VacancyInsert = TablesInsert<"vacancy">
export type VacancyUpdate = TablesUpdate<"vacancy">

// ---- Views ----
export type VacancyStatus = Views<"vacancy_status">
