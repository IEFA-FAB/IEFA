/**
 * Domínio institucional do cadastro: só `@fab.mil.br` cria conta sozinho.
 *
 * A MESMA regra roda em três lugares, e os três têm de concordar:
 *
 *   - aqui, para a tela (formulário de cadastro e console de autorização do sisub);
 *   - no hook "Before User Created" do Supabase Auth
 *     (`access_control.before_user_created`, migration 20261001100100), que é quem de fato
 *     barra — a tela é conveniência, o `POST /auth/v1/signup` com a publishable key passa por
 *     cima dela;
 *   - em `access_control.authorize_external_signup` (20261001100000), que recusa autorizar um
 *     e-mail que já é institucional.
 *
 * `email-domain.test.ts` lê o padrão do hook na migration e roda a mesma tabela de casos nos dois.
 *
 * Domínio EXATO: um único `@`, parte local sem espaço, e nada antes nem depois de `fab.mil.br`.
 * `x@fab.mil.br.evil.com` (sufixo) e `x@evil.fab.mil.br` (subdomínio) não passam.
 */

import { normalizeEmail } from "./errors.ts"

export const FAB_EMAIL_DOMAIN = "fab.mil.br"

/** Espelho de `'^[^@[:space:]]+@fab\.mil\.br$'` do hook, aplicado ao e-mail normalizado. */
const FAB_EMAIL_PATTERN = /^[^@\s]+@fab\.mil\.br$/

/** `true` quando o e-mail é institucional (`@fab.mil.br`), sem caixa e sem espaço nas pontas. */
export function isFabEmail(email: string | null | undefined): boolean {
	if (!email) return false
	return FAB_EMAIL_PATTERN.test(normalizeEmail(email))
}
