/**
 * Regras de e-mail das telas de autenticação.
 *
 * Entrar e recuperar senha aceitam qualquer e-mail válido; o autocadastro segue restrito ao
 * domínio institucional. A fronteira é essa porque conta de parceiro externo (GS1, por
 * exemplo) é criada pela administração, nunca por autocadastro, e recebe só leitura do
 * catálogo pela política "Conjunto Parceiro Externo". Enquanto a validação do domínio valia
 * também no login, essa conta ficava presa no formulário — o servidor sempre a aceitou.
 */

/** Domínio institucional da FAB, sem caracteres especiais na parte local. */
const FAB_EMAIL_RE = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/

/**
 * Forma mínima de e-mail. Deliberadamente frouxa: quem decide se o endereço existe é o
 * GoTrue, e regex apertada aqui só produz falso negativo em endereço legítimo.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Login e recuperação de senha: qualquer e-mail válido (inclui parceiro externo). */
export function validateSignInEmail(v: string): string | null {
	if (!v) return "Email obrigatório."
	if (!EMAIL_RE.test(v)) return "Email inválido."
	return null
}

/** Autocadastro: apenas e-mail institucional da FAB. */
export function validateSignUpEmail(v: string): string | null {
	if (!v) return "Email obrigatório."
	if (!FAB_EMAIL_RE.test(v)) return "Use seu email institucional @fab.mil.br (sem caracteres especiais)."
	return null
}
