import { z } from "zod"

export const FetchUserDataSchema = z.object({ userId: z.string() })
export type FetchUserData = z.infer<typeof FetchUserDataSchema>

export const FetchMilitaryDataSchema = z.object({ saram: z.string() })
export type FetchMilitaryData = z.infer<typeof FetchMilitaryDataSchema>

export const FetchUserSaramSchema = z.object({ userId: z.string() })
export type FetchUserSaram = z.infer<typeof FetchUserSaramSchema>

export const SyncUserSaramSchema = z.object({ userId: z.string(), email: z.string(), saram: z.string() })
export type SyncUserSaram = z.infer<typeof SyncUserSaramSchema>

export const SyncUserEmailSchema = z.object({ userId: z.string(), email: z.string().optional() })
export type SyncUserEmail = z.infer<typeof SyncUserEmailSchema>
