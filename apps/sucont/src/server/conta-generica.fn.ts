import { createPromptNonce } from "@iefa/ai-provider/untrusted"
import { createServerFn } from "@tanstack/react-start"
import { generateText } from "#/lib/ai.server"
import { requireDivisionAccess } from "#/lib/auth.server"
import { buildContaGenericaUserPrompt, CONTA_GENERICA_SYSTEM_PROMPT, contaGenericaOracleInputSchema } from "#/lib/conta-generica-prompt"

export const oracleContaGenericaFn = createServerFn({ method: "POST" })
	.validator(contaGenericaOracleInputSchema)
	.handler(async ({ data }) => {
		// A Conta Genérica é da SUCONT-3 — ver `divisions` da ferramenta em `lib/data.ts`.
		const ctx = await requireDivisionAccess("sucont-3")

		// System fixo do servidor; o contexto da tela é dado e vai delimitado no `user`.
		const user = buildContaGenericaUserPrompt({ context: data.context, query: data.query, nonce: createPromptNonce() })

		const text = await generateText({
			// Dono da chamada vem da sessão, nunca do input — é a chave dos tetos por usuário.
			userId: ctx.userId,
			system: CONTA_GENERICA_SYSTEM_PROMPT,
			user,
		})

		return text || "Não foi possível processar sua pergunta."
	})
