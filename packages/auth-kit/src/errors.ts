/**
 * Normaliza o e-mail antes de qualquer chamada ao GoTrue: o Supabase trata
 * `A@fab.mil.br` e `a@fab.mil.br` como contas distintas no signup, mas o login
 * casa case-insensitive — sem isso o usuário cria a conta e não consegue entrar.
 */
export function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}

/**
 * Traduz o erro do GoTrue para uma mensagem em PT-BR exibível ao usuário.
 *
 * A tabela é casada por regex sobre a mensagem em inglês porque o supabase-js não
 * expõe código estável para a maioria destes casos. Mensagem desconhecida passa
 * direto — é melhor mostrar o texto do provider do que um "erro genérico" que
 * esconde a causa do suporte.
 */
export function getAuthErrorMessage(error: unknown): string {
	const msg = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "Erro desconhecido"

	if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos"
	if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar"
	if (/user already registered/i.test(msg)) return "Este e-mail já está cadastrado"
	if (/password should be at least/i.test(msg)) return "A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula e número"
	if (/invalid format/i.test(msg)) return "Formato de e-mail inválido"
	if (/signup is disabled/i.test(msg)) return "Cadastro temporariamente desabilitado"
	return msg
}
