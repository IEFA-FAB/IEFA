import { z } from "zod"

/**
 * Registro de operações sensíveis (`access_control.sensitive_operation_log`).
 *
 * Nenhum schema aqui carrega o ator: quem executou é SEMPRE a sessão
 * (`ctx.userId`). Aceitar o ator no input seria deixar o chamador assinar o log
 * com o nome de outra pessoa — o pior defeito possível numa trilha de auditoria.
 */

/**
 * Grau de garantia de identidade exigido na execução.
 *
 * `"none"` não aparece aqui de propósito: operação de rotina não é registrada, e
 * o `check` da coluna só aceita `session`/`fresh`. O registro de classificação
 * (que tem os três graus) é do app; o que chega ao log é só o que foi exigido.
 */
export const AssuranceLevelSchema = z.enum(["session", "fresh"])
export type AssuranceLevel = z.infer<typeof AssuranceLevelSchema>

export const RecordSensitiveOperationSchema = z.object({
	/** Nome da server function classificada (ex.: `"createUserPermissionFn"`). */
	operation: z.string().min(1).max(200),
	assurance: AssuranceLevelSchema,
	/**
	 * Identificação do alvo: ids e escopo, no formato de cada operação. Ausente
	 * quando o alvo é o próprio ator (gerar códigos de recuperação, p. ex.).
	 * NUNCA o payload inteiro da operação — o log não é lugar de guardar dado
	 * pessoal que a operação já grava na tabela dela.
	 */
	target: z.record(z.string(), z.unknown()).optional(),
})
export type RecordSensitiveOperation = z.infer<typeof RecordSensitiveOperationSchema>
