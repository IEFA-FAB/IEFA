/**
 * Busca parcial com `ILIKE` tratando o termo como LITERAL.
 *
 * `%` e `_` são curingas do LIKE e `\` é o caractere de escape padrão do Postgres. Sem
 * escapá-los, "arroz_integral" casava "arroz integral" e "arrozXintegral", e um termo `%`
 * (ou `_`, vindo de um modelo ou de um usuário) virava "tudo" — a busca deixava de filtrar.
 */
export function escapeLikePattern(term: string): string {
	return term.replace(/[\\%_]/g, "\\$&")
}

/** Padrão `%termo%` com o termo escapado — o "contém" das buscas por nome. */
export function containsPattern(term: string): string {
	return `%${escapeLikePattern(term)}%`
}
