import { z } from "zod"

const envSchema = z.object({
	VITE_IEFA_SUPABASE_URL: z.url(),
	VITE_IEFA_SUPABASE_ANON_KEY: z.string().min(1),
})

export const env = envSchema.parse(import.meta.env)
