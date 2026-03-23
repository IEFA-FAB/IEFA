import { z } from "zod"

const schema = z.object({
	API_PORT: z.coerce.number().default(3000),
	API_SUPABASE_URL: z.url(),
	API_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export const env = schema.parse(process.env)
