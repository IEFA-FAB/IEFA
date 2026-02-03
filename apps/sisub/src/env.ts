import { z } from "zod"

const envSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.string().url(),
	VITE_SISUB_SUPABASE_ANON_KEY: z.string().min(1),
})

export const env = envSchema.parse(import.meta.env)
