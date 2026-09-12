/**
 * @module session-elevation
 * Faz o client do navegador adotar o par de tokens que a verificação acabou de emitir —
 * SEM recarregar a página.
 *
 * ## O problema, e por que a solução das telas de segurança não serve aqui
 *
 * `verifyMfaChallengeFn` e `verifyMfaEnrollmentFn` rodam no servidor com o client SSR: o
 * GoTrue emite um par de tokens novo e o servidor o grava nos cookies da resposta. As telas
 * de `/diner/security`, `/auth/challenge` e `/auth/mfa-enrollment` concluem com
 * `window.location` justamente por causa disso — recarregar recria o client do navegador, que
 * então lê os cookies novos.
 *
 * Aqui uma recarga MATARIA o formulário preenchido que o usuário estava enviando, que é
 * exatamente o que este fluxo inteiro existe para preservar. Então a sessão é reconciliada em
 * memória:
 *
 * 1. `getSession()` lê o armazenamento do client — que, no navegador, é o próprio cookie
 *    (`@supabase/ssr` → `createBrowserClient`). É por onde o par NOVO aparece.
 * 2. Se esse token já está em `aal2`, `setSession()` o adota explicitamente: o client passa a
 *    ter em memória o mesmo par que está no cookie, e os assinantes de `onAuthStateChange`
 *    são avisados. Sem esse passo, o temporizador de renovação poderia tentar usar um refresh
 *    token já rodado pelo servidor — a sessão cairia sozinha minutos depois, longe da causa.
 * 3. Se o token lido ainda for `aal1`, sobra renovar (`refreshSession()`) e reavaliar.
 *
 * O reenvio da mutação, em si, não depende de nada disso: ele é uma requisição HTTP e leva o
 * cookie do navegador, que já é o novo. O que este módulo protege é a SESSÃO — o passo 2 é o
 * que impede a recarga de voltar pela porta dos fundos, meia hora depois, como logout.
 *
 * @domain app
 */

import { decodeJwtPayload } from "@iefa/pbac"

/** Par de tokens, na única projeção que interessa aqui. */
interface SessionTokens {
	access_token: string
	refresh_token: string
}

/**
 * Subconjunto de `supabase.auth` usado aqui.
 *
 * Interface própria, e não o tipo do supabase-js, para que o teste possa entregar um dublê —
 * a alternativa seria não testar a ordem das chamadas, que é a única coisa não óbvia deste
 * módulo.
 */
export interface ElevationAuthClient {
	getSession(): Promise<{ data: { session: SessionTokens | null } }>
	setSession(tokens: SessionTokens): Promise<unknown>
	refreshSession(): Promise<{ data: { session: SessionTokens | null } }>
}

export type ElevationSyncResult =
	/** A sessão desta aba está em AAL2: pode reenviar a mutação. */
	| "elevated"
	/** Há sessão, mas ela continua em AAL1 — reenviar seria barrado de novo. */
	| "not-elevated"
	/** Não há sessão nenhuma no client (raro: logout em outra aba no meio do modal). */
	| "no-session"

/**
 * `true` quando o access token declara `aal2`.
 *
 * Leitura LOCAL e sem verificar assinatura, igual à do servidor (`@iefa/pbac/jwt-claims`), e
 * pelo mesmo motivo: o projeto assina com segredo simétrico, então `getClaims()` custaria uma
 * requisição. A diferença é que aqui isto NÃO é controle de acesso — quem decide se a
 * operação executa é o servidor, que revalida tudo. Aqui só se decide se vale a pena reenviar.
 */
function isElevated(accessToken: string | null | undefined): boolean {
	return decodeJwtPayload(accessToken)?.aal === "aal2"
}

export async function syncElevatedSession(auth: ElevationAuthClient): Promise<ElevationSyncResult> {
	const current = await auth.getSession().catch(() => null)
	const session = current?.data.session ?? null
	if (!session) return "no-session"

	if (isElevated(session.access_token)) {
		// Falha aqui não muda o veredito: o cookie — que é o que o servidor lê no reenvio — já
		// está elevado. O que se perde é a consistência do client em memória, e isso aparece
		// depois como sessão caindo sozinha, não como mutação recusada.
		await auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }).catch(() => undefined)
		return "elevated"
	}

	const refreshed = await auth.refreshSession().catch(() => null)
	const next = refreshed?.data.session ?? null
	if (!next) return "not-elevated"

	return isElevated(next.access_token) ? "elevated" : "not-elevated"
}
