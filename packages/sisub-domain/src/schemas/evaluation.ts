import { z } from "zod"

/**
 * Avaliação interna: a pergunta global (chave `evaluation` em `super_admin_controller`)
 * e a resposta que cada usuário registra em `opinions`.
 *
 * O autor da resposta NÃO entra no schema de propósito: ele vem do `UserContext`, nunca
 * do payload. Aceitar `userId` aqui deixaria qualquer sessão responder no lugar de outra.
 */
export const UpsertEvalConfigSchema = z.object({
	active: z.boolean(),
	value: z.string(),
})
export type UpsertEvalConfig = z.infer<typeof UpsertEvalConfigSchema>

export const SubmitEvaluationSchema = z.object({
	value: z.number(),
	question: z.string(),
})
export type SubmitEvaluation = z.infer<typeof SubmitEvaluationSchema>
