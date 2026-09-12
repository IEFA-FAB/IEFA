/**
 * @module mfa-admin-reset
 * Entrada do reset administrativo de segundo fator — schema e textos, sem I/O.
 *
 * Mora em `lib/` e não dentro da server function porque os dois lados precisam do MESMO
 * objeto: o `.validator()` de `resetUserMfaFn` e o diálogo que coleta os campos. Duplicar a
 * regra faria a tela liberar o botão para uma justificativa que o servidor recusa — ou, pior,
 * o contrário. Também é o que torna "justificativa vazia é rejeitada" um teste de execução
 * real, e não uma leitura do código-fonte: nada aqui importa `@/server/*` nem `env.server`.
 *
 * ## As duas travas que este schema carrega (design.md D10)
 *
 * - **Justificativa obrigatória.** Ela é gravada em `access_control.mfa_reset_log.reason` e é
 *   a única coisa que responde *por que* o segundo fator de alguém foi removido. Um mínimo de
 *   caracteres existe porque `"."` é uma justificativa vazia com outro nome.
 * - **Identidade verificada FORA do e-mail.** Se o adversário já tem a caixa de e-mail do
 *   titular — o cenário exato em que o segundo fator é a última defesa —, confirmar por
 *   e-mail é confirmar com o adversário. A confirmação é validada no SERVIDOR, e não apenas
 *   marcada na tela: `/_serverFn/<id>` é chamável direto por HTTP, e uma trava que só existe
 *   no componente não é trava.
 *
 * @domain app
 */

import { z } from "zod"

/**
 * Mínimo de caracteres da justificativa.
 *
 * Dez é curto o bastante para não atrapalhar ("perdeu o celular") e longo o bastante para
 * recusar o ponto final solitário que transforma um campo obrigatório em formalidade.
 */
export const ADMIN_RESET_REASON_MIN_LENGTH = 10

/** Teto da justificativa: o campo é uma frase de contexto, não um relatório. */
export const ADMIN_RESET_REASON_MAX_LENGTH = 500

/** Texto da confirmação de canal alternativo, exibido na tela e citado no schema. */
export const IDENTITY_CHANNEL_CONFIRMATION =
	"Confirmo que verifiquei a identidade do titular por canal que NÃO é o e-mail — pessoalmente, por telefone conhecido ou pela chefia imediata."

export const ADMIN_RESET_REASON_HINT = "Descreva o motivo da remoção (mínimo de 10 caracteres). Ele fica registrado e é lido em auditoria."

/**
 * Entrada do reset administrativo.
 *
 * Note o que NÃO está aqui: `performedBy`. O ator sai sempre da sessão (`ctx.userId`) na hora
 * de gravar o log — aceitá-lo do payload deixaria o administrador escolher em nome de quem a
 * remoção fica registrada, o que esvazia a única prova que o log existe para produzir.
 */
export const ResetUserMfaSchema = z.object({
	/** Titular que ficará sem segundo fator. */
	targetUserId: z.uuid("Selecione um usuário válido."),
	reason: z
		.string()
		.trim()
		.min(ADMIN_RESET_REASON_MIN_LENGTH, "Informe a justificativa da remoção (mínimo de 10 caracteres).")
		.max(ADMIN_RESET_REASON_MAX_LENGTH, "A justificativa deve ter no máximo 500 caracteres."),
	/** Confirmação explícita de que a identidade foi verificada fora do e-mail. */
	identityVerifiedOutsideEmail: z.boolean().refine((value) => value === true, {
		message: "Confirme que a identidade do titular foi verificada por canal que não é o e-mail.",
	}),
})

export type ResetUserMfa = z.infer<typeof ResetUserMfaSchema>
