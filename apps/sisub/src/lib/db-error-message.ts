/**
 * @module db-error-message
 * O texto de um erro do PostgREST que pode ir para a tela.
 *
 * As server fns relançam o erro da query como `throw new Error(\`Erro ao X: ${error.message}\`)`.
 * Dois tipos de mensagem chegavam ali:
 *
 * - `RAISE` das funções SQL do sisub: texto escrito para o usuário, em português ("Quantidade
 *   deve ser positiva"). Passa como veio.
 * - Diagnóstico do próprio Postgres/PostgREST: `column x does not exist`, `duplicate key value
 *   violates unique constraint "…" Key (id)=(42)`, cache de schema. Nome de tabela, coluna,
 *   constraint e valor da linha, em inglês. Vai para o log; a tela lê {@link DB_FAILURE_TEXT}.
 *
 * A decisão é pelo `code` (SQLSTATE ou `PGRST…`), que só existe no objeto de erro — por isso o
 * helper fica em cada `throw`, no lugar do `${error.message}`, e o texto em volta (contexto e
 * instrução de recuperação) continua inteiro.
 */

/**
 * Códigos que as funções SQL do sisub usam no `RAISE … USING ERRCODE` (P0001 é o default do
 * `RAISE` sem código; P0W01 é o da contagem com produção pendente). Guarda: o teste deste
 * módulo varre as migrations e falha com código novo fora daqui.
 */
export const RAISE_CODES: ReadonlySet<string> = new Set(["P0001", "P0002", "P0W01", "22023", "23502", "23503", "23505", "23514", "42501", "55000"])

/**
 * Texto que só o Postgres, o PostgREST ou o fetch escrevem. Confere também sob um código de
 * `RAISE`: uma violação de constraint de verdade vem com o mesmo 23505 de um `RAISE`.
 */
const SYSTEM_FRAGMENTS = [
	"violates ",
	"duplicate key value",
	"null value in column",
	"permission denied for",
	"does not exist",
	"fetch failed",
	"TypeError",
	"ECONNRESET",
	"ETIMEDOUT",
	"Failed query:",
]

/** O que a tela lê no lugar do diagnóstico. */
export const DB_FAILURE_TEXT = "falha interna (detalhe no log do servidor)"

export type DbErrorLike = { message?: string | null; code?: string | null; details?: string | null; hint?: string | null }

function isSystemText(message: string): boolean {
	return SYSTEM_FRAGMENTS.some((fragment) => message.includes(fragment))
}

/** A mensagem é texto de regra de negócio, escrito para o usuário? */
export function isUserFacingDbMessage(error: DbErrorLike): boolean {
	const message = error.message ?? ""
	if (!message || isSystemText(message)) return false
	// Sem código: erro lançado pelo próprio código do app (mensagem nossa) — passa.
	if (!error.code) return true
	return RAISE_CODES.has(error.code)
}

/**
 * `error.message` quando é texto para o usuário; senão loga o diagnóstico inteiro e devolve
 * {@link DB_FAILURE_TEXT}. Use no lugar de `${error.message}` ao relançar erro de query.
 */
export function publicDbMessage(error: DbErrorLike | null | undefined): string {
	if (error && isUserFacingDbMessage(error)) return error.message ?? ""
	// biome-ignore lint/suspicious/noConsole: server-side — é o único lugar onde o diagnóstico fica
	console.error("[db-error]", error?.code ?? "", error?.message ?? "", error?.details ?? "", error?.hint ?? "")
	return DB_FAILURE_TEXT
}
