/**
 * Prazo de uma concessão de acesso, do lado do console.
 *
 * O banco guarda `timestamptz`; a tela edita uma DATA (`<input type="date">`), porque quem
 * concede acesso raciocina em "até o dia 31", não em instante. A conversão entre os dois
 * mora aqui, e só aqui, para as três telas (grant inline, anexo de política e turma de
 * treino) não divergirem no que "até o dia 31" significa.
 *
 * IMPORTANTE: nada disto decide autorização. Quem decide é o `now()` do Postgres — ver
 * `notExpired` em `@iefa/sisub-domain`. As funções abaixo só formatam e interpretam
 * entrada; `expired` sempre vem calculado do servidor, nunca do relógio do browser.
 */

/**
 * Data do `<input type="date">` → instante ISO.
 *
 * "até 31/12" vira o FIM do dia 31 no fuso local, não a meia-noite que o abre: escolher
 * uma data e perder o acesso no começo dela seria a leitura errada da palavra "até".
 * String vazia = sem prazo (`null`).
 */
export function expiryFromDateInput(value: string): string | null {
	if (!value) return null
	const [year, month, day] = value.split("-").map(Number)
	if (!year || !month || !day) return null
	return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
}

/**
 * Instante ISO → data do `<input type="date">` (`yyyy-mm-dd`), no fuso local.
 *
 * Local, e não UTC, para ser o inverso exato de `expiryFromDateInput`: um prazo gravado às
 * 23:59 de 31/12 em Brasília é 02:59 de 01/01 em UTC, e `toISOString().slice(0, 10)`
 * devolveria o dia seguinte ao editar.
 */
export function expiryToDateInput(iso: string | null | undefined): string {
	if (!iso) return ""
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return ""
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${date.getFullYear()}-${month}-${day}`
}

/** Prazo legível na listagem. Sem prazo é um estado válido, não um vazio. */
export function formatExpiry(iso: string | null | undefined): string {
	if (!iso) return "Sem prazo"
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return "Sem prazo"
	return date.toLocaleDateString("pt-BR")
}
