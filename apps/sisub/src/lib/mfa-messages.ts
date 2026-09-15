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

import { getAuthErrorMessage } from "@iefa/auth-kit"

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
 * As mensagens de CÓDIGO RECUSADO — as únicas em que o relógio do aparelho é suspeito.
 *
 * Lidas da tradução do `@iefa/auth-kit`, e não redigitadas: se a frase mudar lá, a comparação
 * acompanha.
 */
const CODE_REJECTION_MESSAGES = new Set([getAuthErrorMessage({ code: "mfa_verification_failed" }), getAuthErrorMessage({ code: "mfa_verification_rejected" })])

/**
 * Mensagem do campo de código: o erro do provider e, a partir da segunda recusa seguida, a
 * orientação sobre o relógio do aparelho.
 *
 * A orientação só acompanha código RECUSADO. Sessão expirada, falha de rede ou limite de
 * tentativas também chegam ao campo de código, e mandar a pessoa conferir o relógio nesses
 * casos é pista falsa.
 *
 * @param failedAttempts - Tentativas SEGUIDAS nesta tela, incluindo a que acabou de acontecer
 * @param providerMessage - Erro já traduzido (`readableMfaError`)
 */
export function verificationCodeErrorMessage(failedAttempts: number, providerMessage: string): string {
	const message = providerMessage.trim()
	if (failedAttempts < CLOCK_DRIFT_HINT_AFTER_FAILURES || !CODE_REJECTION_MESSAGES.has(message)) return message
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

/**
 * Mensagens que o servidor lança como IDENTIFICADOR, e não como frase para gente.
 *
 * `UNAUTHORIZED`/`FORBIDDEN` são os defaults de `@iefa/pbac/start`; `Erro desconhecido` é o que
 * `getAuthErrorMessage` devolve quando o GoTrue falha sem corpo (o `challenge` que volta sem
 * `error` e sem `data`). Nenhum dos três diz ao usuário o que fazer.
 */
const MESSAGE_BY_SERVER_TOKEN: Record<string, string | null> = {
	UNAUTHORIZED: "Sua sessão expirou. Entre novamente para continuar.",
	FORBIDDEN: "Sua conta não tem permissão para esta operação.",
	// `null` = cai no fallback da tela, que descreve a ação que falhou.
	"Erro desconhecido": null,
}

/** O `fetch` do navegador falhou antes de haver resposta — cada engine escreve de um jeito. */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed/i

const NETWORK_FAILURE_MESSAGE = "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo."

/**
 * Erro de banco repassado por `handleDomainError`.
 *
 * `runQuery` embrulha a falha do driver em `DomainError` com a mensagem do Postgres e o SQL
 * (`[08006] … Failed query: update … params: …`), e `handleDomainError` a relança como está.
 * Além de ilegível, isso mostra ao usuário a consulta e os parâmetros dela.
 */
const DATABASE_FAILURE = /failed query|econnrefused|etimedout|connect_timeout|connection terminated|too many clients/i

/** SQLSTATE no início (`[08006] …`). Sem flag `i`: o código é sempre maiúsculo, e `[sisub]` não é SQLSTATE. */
const SQLSTATE_PREFIX = /^\[[0-9A-Z]{5}\]/

const DATABASE_FAILURE_MESSAGE = "O sistema não conseguiu acessar os dados agora. Tente de novo em instantes."

/** `PermissionDeniedError` do domínio, que nasce em inglês (`Requires admin level 3`). */
const PERMISSION_DENIED = /^requires \w+ level \d/i

/** Página HTML do balanceador (502/504) no lugar do corpo serializado da server function. */
const HTML_BODY = /^<(!doctype|html)/i

const SERVER_UNAVAILABLE_MESSAGE = "O servidor está indisponível no momento. Tente de novo em instantes."

/**
 * Prefixo de `withAudit` quando a gravação do log falha depois da mutação.
 *
 * A frase em português é o que importa ("a operação FOI APLICADA, não repita"); o `Detalhe:`
 * que vem depois é o erro de banco cru, útil no log do servidor e ruído na tela.
 */
const AUDIT_DETAIL_SEPARATOR = " Detalhe: "

/**
 * Mensagem padrão do Zod, em inglês ("Invalid input: expected string, received undefined").
 * Aparece quando o campo não tem mensagem própria no schema — e nenhum campo de MFA digitado
 * pelo usuário deixa de ter, então o que sobra é payload montado pela tela, não erro de digitação.
 */
const ZOD_DEFAULT_MESSAGE = /^(invalid|too (small|big)|expected|unrecognized)/i

/**
 * Mensagens de validação do `.validator()` de uma server function.
 *
 * O TanStack Start lança `new Error(JSON.stringify(result.issues, undefined, 2))` quando o
 * schema recusa o payload, e o client recebe esse JSON como `message`. Sem este passo, "O código
 * tem 6 dígitos." chegava à tela embrulhado num array de issues com `origin`, `code` e `path`.
 *
 * @returns As mensagens das issues, sem repetição; `null` se `raw` não é um array de issues.
 */
function parseValidationIssues(raw: string, fallback: string): string | null {
	if (!raw.startsWith("[")) return null
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return null
	}
	if (!Array.isArray(parsed)) return null

	const messages = new Set<string>()
	for (const issue of parsed) {
		const message = issue && typeof issue === "object" && "message" in issue ? (issue as { message: unknown }).message : null
		if (typeof message !== "string" || !message.trim()) continue
		messages.add(ZOD_DEFAULT_MESSAGE.test(message.trim()) ? fallback : message.trim())
	}
	return messages.size > 0 ? [...messages].join(" ") : fallback
}

/**
 * Converte o erro de uma server function de verificação em duas etapas numa mensagem exibível.
 *
 * O servidor já traduz o que vem do GoTrue (`failAuth` → `getAuthErrorMessage`), mas três
 * coisas atravessavam o RPC cruas e caíam direto no `error.message` das telas: o JSON de issues
 * do validador, os identificadores de `@iefa/pbac/start` e a falha de rede do navegador. A
 * tradução do GoTrue roda de novo aqui, sobre a mensagem, porque é idempotente e pega a frase
 * em inglês de um erro que não passou por `failAuth`.
 *
 * @param fallback - Descreve a AÇÃO que falhou ("Não foi possível verificar o código.") — é o
 * que aparece quando o erro não traz nada que valha mostrar
 */
export function readableMfaError(error: unknown, fallback: string): string {
	const raw = error instanceof Error ? error.message.trim() : ""
	if (!raw) return fallback

	const validation = parseValidationIssues(raw, fallback)
	if (validation !== null) return validation

	if (raw.startsWith("A operação FOI APLICADA") && raw.includes(AUDIT_DETAIL_SEPARATOR)) return raw.slice(0, raw.indexOf(AUDIT_DETAIL_SEPARATOR))
	if (raw in MESSAGE_BY_SERVER_TOKEN) return MESSAGE_BY_SERVER_TOKEN[raw] ?? fallback
	if (NETWORK_FAILURE.test(raw)) return NETWORK_FAILURE_MESSAGE
	if (HTML_BODY.test(raw)) return SERVER_UNAVAILABLE_MESSAGE
	if (DATABASE_FAILURE.test(raw) || SQLSTATE_PREFIX.test(raw)) return DATABASE_FAILURE_MESSAGE
	if (PERMISSION_DENIED.test(raw)) return MESSAGE_BY_SERVER_TOKEN.FORBIDDEN ?? fallback

	return getAuthErrorMessage({ message: raw })
}
