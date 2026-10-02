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
 * `RAISE`: uma violação de constraint de verdade vem com o mesmo 23505 de um `RAISE`, e o
 * próprio Postgres também usa 22023, 55000 e P0002.
 */
export const SYSTEM_FRAGMENTS: readonly string[] = [
	"violates ",
	"duplicate key value",
	"null value in column",
	"permission denied for",
	"does not exist",
	"cannot ",
	"is not yet defined",
	"query returned no rows",
	"query returned more than one row",
	"invalid input",
	"out of range",
	"must appear in the GROUP BY",
	"fetch failed",
	"TypeError",
	"AbortError",
	"ECONNRESET",
	"ETIMEDOUT",
	"Failed query:",
]

/** O que a tela lê no lugar de um diagnóstico sem tradução própria. */
export const DB_FAILURE_TEXT = "falha interna (detalhe no log do servidor)"

/**
 * Falha nativa que o usuário consegue entender (e muitas vezes resolver): o texto dela, em
 * português, no lugar do diagnóstico. A constraint e o valor da linha seguem só no log.
 */
const NATIVE_FAILURE_TEXT: Record<string, string> = {
	"23505": "já existe um registro com esses dados",
	"23503": "o registro relacionado não existe ou ainda está em uso",
	"23514": "um dos valores está fora do permitido",
	"23502": "falta um campo obrigatório",
	"40001": "conflito com outra operação feita ao mesmo tempo; tente de novo",
	"40P01": "conflito com outra operação feita ao mesmo tempo; tente de novo",
	"57014": "o banco demorou demais para responder; tente de novo",
}

/** `code: ""` é falha de transporte do supabase-js (timeout do kit, abort, 502 do gateway). */
const TRANSPORT_FAILURE_TEXT = "o banco não respondeu; tente de novo"

/** Query sem erro e sem a linha esperada (`error || !data`). */
export const NO_ROW_TEXT = "o banco não devolveu o registro"

export type DbErrorLike = { message?: string | null; code?: string | null; details?: string | null; hint?: string | null }

function isSystemText(message: string): boolean {
	return SYSTEM_FRAGMENTS.some((fragment) => message.includes(fragment))
}

/** A mensagem é texto de regra de negócio, escrito para o usuário? */
export function isUserFacingDbMessage(error: DbErrorLike): boolean {
	const message = error.message ?? ""
	if (!message || isSystemText(message)) return false
	// Sem `code` (nem vazio): erro lançado pelo próprio código do app, mensagem nossa.
	if (error.code == null) return true
	return RAISE_CODES.has(error.code)
}

/**
 * `error.message` quando é texto para o usuário; senão loga o diagnóstico inteiro e devolve um
 * texto em português (o da falha nativa, ou {@link DB_FAILURE_TEXT}). Use no lugar de
 * `${error.message}` ao relançar erro de query; o texto em volta continua seu.
 */
export function publicDbMessage(error: DbErrorLike | null | undefined): string {
	if (!error) return NO_ROW_TEXT
	if (isUserFacingDbMessage(error)) return error.message ?? ""
	// biome-ignore lint/suspicious/noConsole: server-side — é o único lugar onde o diagnóstico fica
	console.error("[db-error]", error.code ?? "", error.message ?? "", error.details ?? "", error.hint ?? "")
	if (error.code === "") return TRANSPORT_FAILURE_TEXT
	return (error.code && NATIVE_FAILURE_TEXT[error.code]) || DB_FAILURE_TEXT
}
