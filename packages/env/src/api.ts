import { z } from "zod"

export const apiEnvSchema = z.object({
	API_PORT: z.string().default("3000"),
	API_SUPABASE_URL: z.string().url("API_SUPABASE_URL must be a valid URL"),
	API_SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "API_SUPABASE_SERVICE_ROLE_KEY is too short"),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export function validateApiEnv(): ApiEnv {
	const result = apiEnvSchema.safeParse(process.env)

	if (!result.success) {
		console.error("❌ API env validation failed:")
		result.error.issues.forEach((issue) => {
			console.error(`   ${issue.path.join(".")}: ${issue.message}`)
		})
		process.exit(1)
	}

	console.log("✅ API env validated")
	return result.data
}
