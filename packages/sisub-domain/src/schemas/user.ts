import { z } from "zod"

export const FetchUserDataSchema = z.object({ userId: z.string() })
export type FetchUserData = z.infer<typeof FetchUserDataSchema>

export const FetchMilitaryDataSchema = z.object({ nrOrdem: z.string() })
export type FetchMilitaryData = z.infer<typeof FetchMilitaryDataSchema>

export const FetchUserNrOrdemSchema = z.object({ userId: z.string() })
export type FetchUserNrOrdem = z.infer<typeof FetchUserNrOrdemSchema>

export const SyncUserNrOrdemSchema = z.object({ userId: z.string(), email: z.string(), nrOrdem: z.string() })
export type SyncUserNrOrdem = z.infer<typeof SyncUserNrOrdemSchema>

export const SyncUserEmailSchema = z.object({ userId: z.string(), email: z.string().optional() })
export type SyncUserEmail = z.infer<typeof SyncUserEmailSchema>
