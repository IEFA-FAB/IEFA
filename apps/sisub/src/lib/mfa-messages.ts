/**
 * @module mfa-messages
 * Texto das telas de verificação em duas etapas que depende de ESTADO, não de tradução.
 *
 * A tradução do erro do GoTrue mora em `@iefa/auth-kit` (`getAuthErrorMessage`) e vale para
 * os seis apps. O que mora aqui é o que só o sisub sabe: quantas vezes o código já foi
 * recusado nesta tela.
 *
 * @domain app
 */

/**
 * Depois do segundo código recusado, a causa mais provável deixa de ser "digitei errado".
 *
 * Um aparelho com a hora ajustada à mão erra por minutos, e o TOTP é um relógio: todo código
 * que ele gera é recusado, para sempre, sem que nada na tela explique por quê. O usuário
 * conclui que o sistema está quebrado e desiste do segundo fator. Duas tentativas é o ponto
 * em que a dica vale mais do que o ruído — na primeira, dedo errado é explicação suficiente.
 */
export const CLOCK_DRIFT_HINT =
	"Se o código continuar sendo recusado, confira se a data e a hora do aparelho estão em ajuste automático — um relógio adiantado ou atrasado invalida todos os códigos."

/** A partir de quantas recusas seguidas a orientação de relógio aparece. */
export const CLOCK_DRIFT_HINT_AFTER_FAILURES = 2

/**
 * Mensagem do campo de código: o erro do provider e, a partir da segunda recusa seguida, a
 * orientação sobre o relógio do aparelho.
 *
 * @param failedAttempts - Recusas SEGUIDAS nesta tela, incluindo a que acabou de acontecer
 * @param providerMessage - Erro já traduzido (`getAuthErrorMessage`)
 */
export function verificationCodeErrorMessage(failedAttempts: number, providerMessage: string): string {
	const message = providerMessage.trim()
	if (failedAttempts < CLOCK_DRIFT_HINT_AFTER_FAILURES) return message
	return `${message} ${CLOCK_DRIFT_HINT}`
}

/**
 * Aviso exibido ANTES do botão que conclui a verificação.
 *
 * Vale para qualquer verificação de fator, e não só para a do primeiro: o GoTrue encerra as
 * demais sessões a cada fator verificado. Descobrir isso DEPOIS, ao voltar para o computador
 * do trabalho já deslogado, é o tipo de surpresa que faz a pessoa culpar o segundo fator.
 */
export const OTHER_SESSIONS_SIGNED_OUT_WARNING =
	"Ao concluir, você será desconectado dos demais dispositivos onde estiver com a conta aberta. Esta sessão continua ativa."
