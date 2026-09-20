/**
 * Prazo de uma concessão de acesso — conversões e rótulos da CAMADA DE APRESENTAÇÃO.
 *
 * A decisão de autorização NÃO passa por aqui: quem compara prazo é o banco, com `now()`,
 * nas queries de resolução (`@iefa/sisub-domain/operations/access-expiry`). Cada linha das
 * listagens administrativas já chega com um `expired` calculado lá. O que este módulo faz é
 * traduzir entre o ISO 8601 do domínio e o valor de um `<input type="datetime-local">`, que
 * é local, sem fuso e sem segundos.
 */

/** Vazio = sem prazo. Um `<input type="datetime-local">` vazio devolve string vazia. */
export const NO_EXPIRY = ""

/**
 * ISO 8601 (UTC) → valor de `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`, HORA LOCAL).
 *
 * O input não aceita fuso: entregar o ISO cru faria o navegador rejeitar o valor e o campo
 * abrir vazio, o que leria como "sem prazo" numa concessão que TEM prazo. A conversão para
 * hora local é o que faz a tela mostrar a mesma hora que o administrador digitou.
 */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
	if (!iso) return NO_EXPIRY
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return NO_EXPIRY
	const pad = (n: number) => String(n).padStart(2, "0")
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Valor de `<input type="datetime-local">` → ISO 8601 (UTC), ou `null` para "sem prazo".
 *
 * `null` é significativo no domínio — limpa o prazo gravado — e é exatamente o que o campo
 * esvaziado deve produzir. Valor inválido também vira `null`: o input já impede a digitação
 * livre, e um `Invalid Date` propagado viraria erro de schema sem mensagem útil.
 */
export function fromDatetimeLocalValue(value: string): string | null {
	if (!value) return null
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return null
	return date.toISOString()
}

/** Rótulo curto do prazo, em pt-BR. Sem prazo vira travessão — nunca string vazia. */
export function formatExpiry(iso: string | null | undefined): string {
	if (!iso) return "—"
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return "—"
	return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}
