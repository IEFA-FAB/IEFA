import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { generateText } from "#/lib/ai.server"
import { requireSucontAccess } from "#/lib/auth.server"

export const oracleContaGenericaFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			query: z.string().min(1),
			systemContext: z.string(),
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireSucontAccess()

		const text = await generateText({
			// Dono da chamada vem da sessão, nunca do input — é a chave dos tetos por usuário.
			userId: ctx.userId,
			system: `${data.systemContext}\nResponda de forma técnica, militar e objetiva. Use negrito para destacar pontos críticos.`,
			user: data.query,
		})

		return text || "Não foi possível processar sua pergunta."
	})
