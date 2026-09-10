import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { generateText } from "#/lib/ai.server"
import { requireDivisionAccess } from "#/lib/auth.server"

export const oracleContaGenericaFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			query: z.string().min(1),
			systemContext: z.string(),
		})
	)
	.handler(async ({ data }) => {
		// A Conta Genérica é da SUCONT-3 — ver `divisions` da ferramenta em `lib/data.ts`.
		const ctx = await requireDivisionAccess("sucont-3")

		const text = await generateText({
			// Dono da chamada vem da sessão, nunca do input — é a chave dos tetos por usuário.
			userId: ctx.userId,
			system: `${data.systemContext}\nResponda de forma técnica, militar e objetiva. Use negrito para destacar pontos críticos.`,
			user: data.query,
		})

		return text || "Não foi possível processar sua pergunta."
	})
