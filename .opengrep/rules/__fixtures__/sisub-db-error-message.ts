// Casos de teste de `.opengrep/rules/sisub-db-error-message.yaml`. Não é código do app.
//
// Rodar: opengrep test --config .opengrep/rules/sisub-db-error-message.yaml .opengrep/rules/__fixtures__/sisub-db-error-message.ts

type PgError = { message: string; code: string }
declare const error: PgError | null
declare const itemsError: PgError
declare const result: { error: PgError }
declare const issue: { message: string }
declare function publicDbMessage(error: PgError | null): string

export function raw() {
	// ruleid: sisub-raw-db-error-message
	if (error) throw new Error(`Erro ao listar empenhos: ${error.message}`)
	// ruleid: sisub-raw-db-error-message
	throw new Error(`Erro nos itens (${itemsError.message}); avise o nível 3`)
}

export function plain() {
	// ruleid: sisub-raw-db-error-message
	if (error) throw new Error(error.message)
}

export function viaResult() {
	// ruleid: sisub-raw-db-error-message
	throw new Error(`Erro ao carregar os lotes: ${result.error.message}`)
}

export function redacted() {
	// ok: sisub-raw-db-error-message
	if (error) throw new Error(`Erro ao listar empenhos: ${publicDbMessage(error)}`)
	// ok: sisub-raw-db-error-message
	throw new Error(`Campo inválido: ${issue.message}`)
}
