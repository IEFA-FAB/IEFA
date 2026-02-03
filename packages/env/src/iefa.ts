import { z } from "zod"

export const iefaEnvSchema = z.object({
	VITE_IEFA_SUPABASE_URL: z.string().url("VITE_IEFA_SUPABASE_URL must be a valid URL"),
	VITE_IEFA_SUPABASE_ANON_KEY: z.string().min(20, "VITE_IEFA_SUPABASE_ANON_KEY is too short"),
	VITE_RAG_SUPABASE_URL: z.string().url("VITE_RAG_SUPABASE_URL must be a valid URL"),
	VITE_RAG_SUPABASE_SERVICE_ROLE_KEY: z
		.string()
		.min(20, "VITE_RAG_SUPABASE_SERVICE_ROLE_KEY is too short"),
})

export type IefaEnv = z.infer<typeof iefaEnvSchema>

export function validateIefaEnv(): IefaEnv {
	const result = iefaEnvSchema.safeParse(process.env)

	if (!result.success) {
		console.error("❌ IEFA env validation failed:")
		result.error.issues.forEach((issue) => {
			console.error(`   ${issue.path.join(".")}: ${issue.message}`)
		})
		process.exit(1)
	}

	console.log("✅ IEFA env validated")
	return result.data
}
