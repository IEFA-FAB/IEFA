import { z } from "zod"

export const envSchema = z.object({
	API_PORT: z.coerce.number().default(3000),
	API_SUPABASE_URL: z.url(),
	API_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
	/**
	 * Segredo das rotas `/api/admin/*` e de dado pessoal. Mínimo de 32 caracteres: com 1 ele
	 * subia e era adivinhável mesmo com o freio de tentativas (o valor de produção tem 64;
	 * gere com `openssl rand -hex 32`). O boot falha em vez de só avisar.
	 */
	ADMIN_SECRET: z.string().min(32, "ADMIN_SECRET precisa de pelo menos 32 caracteres (ex.: `openssl rand -hex 32`)"),
	// GS1 — opcionais: sem eles o lookup VbG responde 503 (degradação graciosa)
	GS1_VBG_API_URL: z.url().optional(),
	GS1_VBG_API_KEY: z.string().min(1).optional(),
	GS1_GPC_PUBLICATION_URL: z.url().optional(),
})
