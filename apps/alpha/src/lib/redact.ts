/**
 * Tira do texto de erro o que identifica a infraestrutura.
 *
 * `normative_source.last_error` é lido de volta por `GET /api/v1/sources`, aberto a
 * qualquer autenticado — e um `AccessDeniedException` do Bedrock traz no texto o ARN da
 * role da task (conta, nome da role, sessão). O resto da mensagem continua útil para
 * diagnosticar; só o identificador sai.
 */
const AWS_ARN = /arn:aws[a-z-]*:[^\s"'`,;)]+/g

export function redactCloudIdentifiers(message: string): string {
	return message.replace(AWS_ARN, "arn:[omitido]")
}
