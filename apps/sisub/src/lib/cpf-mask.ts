/**
 * CPF mascarado no padrão gov.br (`***.456.789-**`): os seis dígitos do meio bastam para a
 * pessoa reconhecer o próprio documento, e não bastam para identificar ninguém.
 *
 * O CPF inteiro NÃO sai do servidor. `fetchMilitaryDataFn` devolvia o documento completo, e
 * combinado com um nrOrdem que o próprio usuário escolhia era uma consulta de CPF por
 * número de ordem (LGPD). Máscara no cliente não resolve: o dado já teria chegado.
 */
export function maskCpf(value: string | null | undefined): string | null {
	const digits = String(value ?? "").replace(/\D/g, "")
	if (digits.length !== 11) return null
	return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
}
