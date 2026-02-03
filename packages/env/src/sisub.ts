import { z } from "zod"

export const sisubEnvSchema = z.object({
	VITE_SISUB_SUPABASE_URL: z.string().url("VITE_SISUB_SUPABASE_URL must be a valid URL"),
	VITE_SISUB_SUPABASE_ANON_KEY: z.string().min(20, "VITE_SISUB_SUPABASE_ANON_KEY is too short"),
})

export type SisubEnv = z.infer<typeof sisubEnvSchema>

export function validateSisubEnv(): SisubEnv {
	const result = sisubEnvSchema.safeParse(process.env)

	if (!result.success) {
		console.error("❌ SISUB env validation failed:")
		result.error.issues.forEach((issue) => {
			console.error(`   ${issue.path.join(".")}: ${issue.message}`)
		})
		process.exit(1)
	}

	console.log("✅ SISUB env validated")
	return result.data
}
