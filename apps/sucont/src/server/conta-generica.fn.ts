import { GoogleGenAI } from "@google/genai"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export const oracleContaGenericaFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			query: z.string().min(1),
			systemContext: z.string(),
		})
	)
	.handler(async ({ data }) => {
		const apiKey = process.env.GEMINI_API_KEY
		if (!apiKey) {
			throw new Error("GEMINI_API_KEY não configurada no servidor. Adicione ao .env.local.")
		}

		const ai = new GoogleGenAI({ apiKey })

		const response = await ai.models.generateContent({
			model: "gemini-2.0-flash",
			contents: data.query,
			config: {
				systemInstruction: `${data.systemContext}\nResponda de forma técnica, militar e objetiva. Use negrito para destacar pontos críticos.`,
			},
		})

		return response.text ?? "Não foi possível processar sua pergunta."
	})
