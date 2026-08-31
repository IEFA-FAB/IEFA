/**
 * Rótulos das questões do Roteiro de Acompanhamento Contábil (RAC).
 *
 * Sempre com dois dígitos: a mesma questão aparece no filtro do catálogo e no
 * cartão da ferramenta, e "Q5" num lugar com "Q05" no outro faz parecerem
 * questões diferentes.
 */
export function formatRac(question: number): string {
	return `Q${String(question).padStart(2, "0")}`
}

/**
 * Rótulo de um conjunto de questões, condensado.
 *
 * O Analista de Saldo Alongado responde 21 questões (Q05–Q25). Listadas uma a
 * uma — que é o que o cartão fazia — viravam uma tira de 21 rótulos que ocupava
 * mais espaço que o nome da ferramenta e não dizia nada além do que a faixa já
 * diz. Faixa contígua vira intervalo; conjunto esparso mostra as duas primeiras
 * e conta o resto.
 *
 * Devolve `null` para conjunto vazio — quem chama decide o que pôr no lugar.
 */
export function formatRacQuestions(questions: readonly number[] | undefined): string | null {
	if (!questions || questions.length === 0) return null

	const sorted = [...new Set(questions)].sort((a, b) => a - b)
	if (sorted.length === 1) return formatRac(sorted[0] as number)

	const first = sorted[0] as number
	const last = sorted[sorted.length - 1] as number
	const isContiguous = last - first === sorted.length - 1
	if (isContiguous) return `${formatRac(first)}–${formatRac(last)}`

	if (sorted.length <= 3) return sorted.map(formatRac).join(" · ")
	return `${formatRac(first)} · ${formatRac(sorted[1] as number)} +${sorted.length - 2}`
}
