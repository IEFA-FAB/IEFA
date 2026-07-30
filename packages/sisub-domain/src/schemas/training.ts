import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Reset do ambiente de treino.
 *
 * `actorId` é parâmetro EXPLÍCITO, não lido de sessão: a operação precisa ser chamável por
 * um agendador fora de um request. O server function preenche com o usuário autenticado.
 */
export const ResetTrainingScopeSchema = z.object({
	actorId: UuidSchema,
})
export type ResetTrainingScope = z.infer<typeof ResetTrainingScopeSchema>

export const ListTrainingResetsSchema = z.object({
	limit: z.number().int().positive().max(100).optional(),
})
export type ListTrainingResets = z.infer<typeof ListTrainingResetsSchema>
