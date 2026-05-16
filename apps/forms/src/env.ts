import { z } from "zod"

const envSchema = z.object({
	VITE_IEFA_SUPABASE_URL: z.url(),
	VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	VITE_APP_TENANT: z.enum(["forms", "cinco-s"]).catch("forms"),
})

const parsed = envSchema.safeParse({
	VITE_IEFA_SUPABASE_URL: import.meta.env.VITE_IEFA_SUPABASE_URL,
	VITE_IEFA_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_IEFA_SUPABASE_PUBLISHABLE_KEY,
	VITE_APP_TENANT: import.meta.env.VITE_APP_TENANT,
})

if (!parsed.success) {
	const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ")
	throw new Error(`Missing or invalid environment variables: ${missing}`)
}

export const env = parsed.data
