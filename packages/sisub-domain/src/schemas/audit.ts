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

/** Teto de linhas por consulta do registro. */
export const SENSITIVE_OPERATION_LIST_MAX = 200

/** Padrão de linhas por consulta, quando o cliente não escolhe. */
export const SENSITIVE_OPERATION_LIST_DEFAULT = 50

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

/**
 * Consulta do registro (tela `/admin/audit-log`).
 *
 * `actorId` opcional é o filtro "o que ESTA pessoa fez" — a pergunta que o log
 * existe para responder quando uma conta cai em suspeita. Sem ele, a consulta é
 * o panorama do período.
 *
 * `targetUserId` é a pergunta inversa: "o que aconteceu com o acesso DESTA pessoa".
 * Casa a pessoa como alvo direto (`target.target_user_id`, ou as chaves das linhas
 * gravadas antes do formato padrão: `userId`, `targetUserId`) e como alcançada por
 * mudança de política (`target.affected_user_ids`).
 *
 * `operation` é igualdade exata com o nome gravado — o filtro da tela oferece a
 * lista de nomes distintos (`listSensitiveOperationNames`), então não há por que
 * aceitar padrão.
 *
 * `limit` tem teto no schema e é reaplicado na operation: o cliente escolhe a
 * página, nunca o tamanho da varredura.
 */
export const ListSensitiveOperationsSchema = z.object({
	actorId: z.uuid().optional(),
	targetUserId: z.uuid().optional(),
	operation: z.string().min(1).max(120).optional(),
	limit: z.number().int().min(1).max(SENSITIVE_OPERATION_LIST_MAX).optional(),
	offset: z.number().int().min(0).optional(),
})
export type ListSensitiveOperations = z.infer<typeof ListSensitiveOperationsSchema>
