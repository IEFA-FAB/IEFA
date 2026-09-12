/**
 * Normaliza o e-mail antes de qualquer chamada ao GoTrue: o Supabase trata
 * `A@fab.mil.br` e `a@fab.mil.br` como contas distintas no signup, mas o login
 * casa case-insensitive — sem isso o usuário cria a conta e não consegue entrar.
 */
export function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}

/**
 * Erros do GoTrue que chegam com `code` estável, traduzidos pelo código.
 *
 * ## Por que o código vem ANTES da tabela de regex
 *
 * A tradução histórica deste arquivo casa a mensagem em inglês por expressão regular, porque
 * o supabase-js não expunha código para a maioria dos casos de senha/cadastro. Os erros de
 * MFA e de reautenticação são diferentes: eles TÊM `code` (`mfa_verification_failed`,
 * `reauthentication_needed`, …), e o código é o que não muda quando o provider reescreve a
 * frase em inglês. Casar "Invalid TOTP code entered" por regex funcionaria hoje e quebraria
 * em silêncio no próximo release do GoTrue — voltando a mostrar inglês a um usuário que está
 * no meio de um fluxo de segurança, que é justamente onde texto incompreensível faz a pessoa
 * desistir do segundo fator.
 *
 * As mensagens dizem o que FAZER. "Código inválido" sozinho não distingue "digitei errado" de
 * "meu relógio está fora de hora" — e o relógio dessincronizado é a causa mais comum de código
 * recusado num aparelho que nunca sincroniza a hora pela rede.
 */
const MESSAGE_BY_CODE: Record<string, string> = {
	// ── Verificação de fator (desafio de login, cadastro e elevação)
	mfa_verification_failed: "Código incorreto. Gere um novo código no aplicativo autenticador e tente de novo.",
	mfa_verification_rejected: "Código recusado. Gere um novo código no aplicativo autenticador e tente de novo.",
	mfa_challenge_expired: "O código expirou antes da confirmação. Gere um novo código no aplicativo e tente de novo.",
	mfa_factor_not_found: "Dispositivo de verificação não encontrado. Atualize a página e comece o cadastro de novo.",
	mfa_factor_name_conflict: "Já existe um dispositivo com esse nome. Escolha outro nome para este.",
	mfa_verified_factor_exists: "Este dispositivo já está verificado nesta conta.",
	over_enrolled_mfa_factors: "Limite de dispositivos de verificação atingido. Remova um antes de cadastrar outro.",
	insufficient_aal: "Confirme o código do seu dispositivo antes de alterar a verificação em duas etapas.",
	// ── Reautenticação (confirmar a senha antes de cadastrar o primeiro fator)
	reauthentication_needed: "Confirme a senha da sua conta para continuar.",
	reauthentication_not_valid: "Não foi possível confirmar sua identidade. Tente novamente.",
	// ── Limite de tentativas: o GoTrue devolve isto antes de avaliar o código
	over_request_rate_limit: "Muitas tentativas seguidas. Aguarde um instante antes de tentar de novo.",
	session_not_found: "Sua sessão expirou. Entre novamente para continuar.",
}

/**
 * Traduções por mensagem, para o GoTrue que não manda `code` (versões antigas e
 * erros repassados por um proxy que perdeu o corpo estruturado).
 *
 * Ordem importa: a primeira que casar vence. As entradas de MFA vêm antes das de senha
 * porque "Invalid TOTP code entered" e "Invalid login credentials" são frases diferentes,
 * mas uma regex frouxa de "invalid" cobriria as duas.
 */
const MESSAGE_BY_PATTERN: [RegExp, string][] = [
	[/invalid (totp|mfa) code/i, MESSAGE_BY_CODE.mfa_verification_failed],
	[/challenge .*(expired|has expired)/i, MESSAGE_BY_CODE.mfa_challenge_expired],
	[/factor .*(not found|does not exist)/i, MESSAGE_BY_CODE.mfa_factor_not_found],
	[/friendly name .*(already exists|conflict)/i, MESSAGE_BY_CODE.mfa_factor_name_conflict],
	[/(aal2 required|insufficient aal|assurance level)/i, MESSAGE_BY_CODE.insufficient_aal],
	[/reauthentication (is )?needed/i, MESSAGE_BY_CODE.reauthentication_needed],
	[/nonce/i, MESSAGE_BY_CODE.reauthentication_not_valid],
	[/invalid login credentials/i, "E-mail ou senha incorretos"],
	[/email not confirmed/i, "Confirme seu e-mail antes de entrar"],
	[/user already registered/i, "Este e-mail já está cadastrado"],
	[/password should be at least/i, "A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula e número"],
	[/invalid format/i, "Formato de e-mail inválido"],
	[/signup is disabled/i, "Cadastro temporariamente desabilitado"],
	[/(too many requests|rate limit)/i, MESSAGE_BY_CODE.over_request_rate_limit],
]

/** `code` do erro do GoTrue, quando ele existe e é string. */
function readErrorCode(error: unknown): string | null {
	if (!error || typeof error !== "object" || !("code" in error)) return null
	const code = (error as { code: unknown }).code
	return typeof code === "string" ? code : null
}

/**
 * Traduz o erro do GoTrue para uma mensagem em PT-BR exibível ao usuário.
 *
 * Resolve na ordem: `code` estável → mensagem em inglês por regex → a própria mensagem do
 * provider. Mensagem desconhecida passa direto — é melhor mostrar o texto do provider do que
 * um "erro genérico" que esconde a causa do suporte.
 */
export function getAuthErrorMessage(error: unknown): string {
	const code = readErrorCode(error)
	if (code && MESSAGE_BY_CODE[code]) return MESSAGE_BY_CODE[code]

	const msg = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "Erro desconhecido"

	for (const [pattern, translated] of MESSAGE_BY_PATTERN) {
		if (pattern.test(msg)) return translated
	}
	return msg
}
