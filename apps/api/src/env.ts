import { z } from "zod"

const schema = z.object({
	API_PORT: z.coerce.number().default(3000),
	API_SUPABASE_URL: z.url(),
	API_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
	ADMIN_SECRET: z.string().min(1),
	// GS1 — opcionais: sem eles o lookup VbG responde 503 (degradação graciosa)
	GS1_VBG_API_URL: z.url().optional(),
	GS1_VBG_API_KEY: z.string().min(1).optional(),
	GS1_GPC_PUBLICATION_URL: z.url().optional(),
})

export const env = schema.parse(process.env)
