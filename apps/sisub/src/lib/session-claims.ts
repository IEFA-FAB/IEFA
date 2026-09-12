/**
 * @module session-claims
 * Leitura PURA das claims da sessão que o `UserContext` não carrega: o id da sessão e a
 * lista de métodos de autenticação (`amr`).
 *
 * ## Por que o `amr` importa aqui
 *
 * Uma sessão aberta por link de recuperação de senha autentica tanto quanto uma sessão de
 * login — e é exatamente por isso que ela não pode cadastrar nem remover segundo fator. Quem
 * chega por um link de e-mail provou acesso à CAIXA DE ENTRADA, não conhecimento da senha; se
 * essa sessão pudesse cadastrar um TOTP, quem controlasse o e-mail da vítima trocaria a senha,
 * cadastraria o próprio fator e fecharia a porta atrás de si. O `amr` é o único lugar onde a
 * origem da sessão continua escrita depois que o login terminou.
 *
 * Puro de propósito (sem `@/lib/*.server`): é o que deixa a regra ser provada por teste sem
 * GoTrue nenhum. A leitura do token vive em `session-claims.server.ts`.
 *
 * @domain app
 */

/**
 * Método do `amr` que marca a sessão criada por link de recuperação de senha.
 *
 * O GoTrue registra o método usado para AUTENTICAR a sessão; trocar a senha depois não
 * apaga a entrada, e é assim que tem que ser — a sessão continua sendo a que nasceu de um
 * link de e-mail até o usuário entrar de novo com a senha.
 */
export const RECOVERY_AMR_METHOD = "recovery"

/** Uma entrada de `amr` já normalizada. Entrada malformada não vira item. */
export type AuthenticationMethod = { method: string; timestamp: number | null }

/**
 * Métodos de autenticação declarados no `amr`, na ordem em que o token os traz.
 *
 * Entrada sem `method` string é descartada em vez de virar `"undefined"`: um método
 * inventado a partir de lixo participaria de comparações e decidiria acesso.
 */
export function readAuthenticationMethods(amr: unknown): AuthenticationMethod[] {
	if (!Array.isArray(amr)) return []

	const methods: AuthenticationMethod[] = []
	for (const entry of amr) {
		if (typeof entry !== "object" || entry === null) continue
		const record = entry as Record<string, unknown>
		if (typeof record.method !== "string") continue
		const timestamp = typeof record.timestamp === "number" && Number.isFinite(record.timestamp) ? record.timestamp : null
		methods.push({ method: record.method, timestamp })
	}
	return methods
}

/**
 * `true` quando a sessão nasceu de um link de recuperação de senha.
 *
 * Falha ABERTO de propósito — `amr` ausente, token malformado ou payload nulo devolvem
 * `false`. Este predicado BLOQUEIA a gestão de fatores; falhar fechado trancaria todo mundo
 * fora do cadastro de MFA no dia em que o formato do token mudasse, e "ninguém consegue
 * cadastrar segundo fator" é um estrago maior e mais silencioso do que a janela que ele fecha.
 * A origem de recuperação, quando existe, está escrita; ausência de informação não é recuperação.
 */
export function isRecoveryOriginatedSession(payload: Record<string, unknown> | null): boolean {
	return readAuthenticationMethods(payload?.amr).some((entry) => entry.method === RECOVERY_AMR_METHOD)
}

/**
 * `session_id` do token — a chave que identifica ESTA sessão entre as do usuário.
 *
 * Serve para marcar "este dispositivo" na lista de sessões ativas. Sem ele a lista existe,
 * só não sabe dizer qual linha é a de quem está lendo.
 */
export function readSessionId(payload: Record<string, unknown> | null): string | null {
	const sessionId = payload?.session_id
	return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null
}
