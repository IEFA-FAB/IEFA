/**
 * @module db-diagnostics
 * Diagnóstico do Postgres/PostgREST que não pode chegar ao navegador.
 *
 * ~300 server functions fazem `if (error) throw new Error(\`Erro ao X: ${error.message}\`)`.
 * Quando o `error` é um `RAISE` de função SQL, a mensagem foi escrita para o usuário ("Lote
 * não encontrado") e tem de passar. Quando é do próprio banco (coluna inexistente, constraint,
 * cache de schema do PostgREST), ela traz nome de tabela, coluna, constraint e valor da linha,
 * em inglês — texto que só confunde quem usa e expõe dado da linha. O middleware global de
 * `start.ts` corta só esse trecho, mantém o contexto que a server fn escreveu ("Erro ao X") e
 * leva o diagnóstico inteiro para o log.
 */

import { GENERIC_DB_ERROR_MESSAGE } from "@iefa/sisub-domain/types"

/** Sufixo do lugar do diagnóstico cortado. */
export const DB_DIAGNOSTIC_REPLACEMENT = "falha no banco de dados. Tente novamente; se persistir, avise o suporte."

/**
 * Trechos que só o Postgres, o PostgREST ou o driver escrevem. As mensagens de `RAISE` das
 * funções do sisub são em português, então nenhum destes casa com elas.
 */
const DB_DIAGNOSTIC_FRAGMENTS = [
	"does not exist",
	"violates check constraint",
	"violates foreign key constraint",
	"violates unique constraint",
	"violates not-null constraint",
	"violates exclusion constraint",
	"violates row-level security policy",
	"duplicate key value",
	"null value in column",
	"syntax error at or near",
	"invalid input syntax for",
	"invalid input value for",
	"permission denied for",
	"Could not find the",
	"schema cache",
	"JSON object requested",
	"multiple (or no) rows returned",
	"Failed query:",
	"value too long for type",
	"out of range for type",
	"canceling statement due to",
	"more than one row returned",
	"there is no unique or exclusion constraint",
	"is ambiguous",
	"could not serialize access",
	"deadlock detected",
	"fetch failed",
]

const escapeRegExp = (fragment: string) => fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// `[^:(]*` estende o casamento para trás até o início da oração: o primeiro `:` ou `(` antes
// do trecho é onde termina o contexto que a server fn escreveu.
const DB_DIAGNOSTIC_RE = new RegExp(`[^:(]*(?:${[...DB_DIAGNOSTIC_FRAGMENTS.map(escapeRegExp), "PGRST\\d{3}"].join("|")})`)

/**
 * A mensagem sem o diagnóstico do banco, ou `null` quando ela não tem diagnóstico (é texto de
 * regra de negócio e passa como veio).
 *
 * "Erro ao listar empenhos: column empenho.x does not exist" → "Erro ao listar empenhos:
 * falha no banco de dados. …". Sem contexto antes do diagnóstico, a mensagem genérica.
 */
export function redactDbDiagnostics(message: string): string | null {
	const match = DB_DIAGNOSTIC_RE.exec(message)
	if (!match) return null
	const context = message
		.slice(0, match.index)
		.replace(/[\s:(—-]+$/, "")
		.trim()
	return context ? `${context}: ${DB_DIAGNOSTIC_REPLACEMENT}` : GENERIC_DB_ERROR_MESSAGE
}
