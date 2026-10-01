/**
 * @module user.fn
 * Registro de identidade do usuário do sucont em `core.user_data`.
 *
 * `core.user_data` é o cadastro de pessoas do ERP — é ali que a busca por e-mail
 * da gestão de acessos (`searchUsersByEmail`, @iefa/pbac) procura alguém para
 * conceder acesso, em TODOS os apps. Só que a linha nasce no login: o sisub a
 * grava desde sempre, e o sucont nunca gravou. O resultado é que quem só usa o
 * sucont não existe para a busca — dos quatro usuários com grant `sucont`, três
 * não tinham linha, e eram exatamente os que precisariam ser encontrados.
 *
 * Portanto: ao entrar no sucont, o usuário passa a se registrar, como já fazia ao
 * entrar no sisub.
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontApp, requireUser, requireUserId } from "#/lib/auth.server"
import { fetchMilitaryIdentity } from "#/lib/military.server"
import { saramLinkErrorMessage } from "#/lib/saram-link"
import { getCoreClient } from "#/lib/supabase.server"

/**
 * Registra (ou atualiza) o `id` + `email` do PRÓPRIO usuário. Best-effort: roda uma
 * vez por sessão de browser e nunca bloqueia a navegação.
 *
 * Identidade vem do JWT, nunca do payload — a fn não recebe argumento nenhum.
 * `core.user_data.email` é UNIQUE e é a chave de busca do console de permissões:
 * aceitar um e-mail do cliente permitiria reivindicar a identidade de outra conta.
 *
 * Conflito de `id` atualiza o e-mail. Conflito de EMAIL (23505 — outra linha, de
 * outro `id`, já detém este endereço) é desistência silenciosa: o sisub resolve o
 * caso apagando a linha rival (`upsertUserDataReclaimingEmail`), e isso é uma
 * operação destrutiva sobre o cadastro de outra pessoa, deliberada e coberta por
 * teste lá. Duplicá-la aqui criaria um segundo caminho de sequestro de identidade
 * para ganhar nada: o registro rival já responde pela busca.
 */
export const syncSucontIdentityFn = createServerFn({ method: "POST" }).handler(async (): Promise<{ ok: boolean }> => {
	const user = await requireUser()
	const email = user.email?.trim()
	// Conta sem e-mail não tem o que registrar: `""` não é buscável e colidiria com
	// toda outra conta sem e-mail no índice único.
	if (!email) return { ok: false }

	const { error } = await getCoreClient().from("user_data").upsert({ id: user.id, email }, { onConflict: "id" })
	if (!error) return { ok: true }
	if (error.code === "23505") return { ok: false }
	throw new Error(error.message)
})

/**
 * SARAM vinculado à conta e a identificação militar que ele resolve.
 *
 * `saram` é o que a conta declarou; `posto`/`nomeGuerra` são o que o cadastro de
 * pessoal responde sobre ele. Os dois viajam separados porque a segunda pode faltar
 * (SARAM digitado errado, ou pessoa ausente do espelho) sem que a primeira falte.
 */
export type SucontIdentity = {
	saram: string | null
	posto: string | null
	nomeGuerra: string | null
}

const EMPTY_IDENTITY: SucontIdentity = { saram: null, posto: null, nomeGuerra: null }

/**
 * Identidade do PRÓPRIO usuário. Sem argumento: o `id` vem do JWT — receber um
 * `userId` do cliente aqui devolveria o SARAM de qualquer conta (IDOR), e SARAM é
 * dado pessoal.
 *
 * É o que decide se o diálogo de primeiro acesso aparece: `saram: null` significa
 * "ainda não informou".
 */
export const fetchMyIdentityFn = createServerFn({ method: "GET" }).handler(async (): Promise<SucontIdentity> => {
	const userId = await requireUserId()

	const { data, error } = await getCoreClient().from("user_data").select("saram").eq("id", userId).maybeSingle()
	if (error) throw new Error(error.message)

	const saram = data?.saram?.trim() || null
	if (!saram) return EMPTY_IDENTITY

	const military = await fetchMilitaryIdentity(saram)
	return { saram, posto: military?.posto ?? null, nomeGuerra: military?.nomeGuerra ?? null }
})

/**
 * `core.link_own_saram` nasce em 20261001100200; o client tipado só a conhece depois do
 * `db:types` que segue o apply. Assinatura declarada aqui, e só ela — a chamada continua sendo
 * método do client (o `rpc` solto perderia o `this`).
 */
type LinkOwnSaramClient = {
	rpc(fn: "link_own_saram", args: { p_user: string; p_email: string | null; p_saram: string }): PromiseLike<{ error: { message: string } | null }>
}

/**
 * Vincula um SARAM à PRÓPRIA conta. O número vem do formulário (é input legítimo do
 * usuário); `id` e `email`, da sessão.
 *
 * Exige acesso ao app (`requireSucontApp`, qualquer módulo do sucont): só sessão bastava, e
 * qualquer conta do ERP gravava SARAM por este endpoint sem nunca ter acesso ao hub.
 *
 * As travas são as de `syncUserSaram` (sisub-domain), aplicadas no banco por
 * `core.link_own_saram` (migration 20261001100200) — o sucont não tem conexão Postgres
 * direta, e checar-e-gravar pelo PostgREST seriam duas requisições sem transação:
 *   - write-once: SARAM que já localiza um cadastro militar não muda pela própria conta (sem
 *     isso, gravar e regravar o SARAM de outras pessoas lia posto e nome de guerra delas, um
 *     por um — LGPD). O que não localiza ninguém (dígito trocado) segue corrigível;
 *   - exclusivo: SARAM vinculado a outra conta é recusado;
 *   - lock: o mesmo advisory lock do sisub, então os dois apps se serializam no mesmo número.
 *
 * O SARAM NÃO é validado contra o cadastro de pessoal antes de gravar, de propósito:
 * o espelho de `core.user_military_data` é uma cópia com data, e recusar quem não
 * está nela trancaria fora do hub exatamente quem chegou depois da última carga. O
 * que a gravação devolve é a identificação resolvida — `null` ali é o sinal de que o
 * número não bate com ninguém, e a tela diz isso em vez de fingir sucesso completo.
 */
export const saveMySaramFn = createServerFn({ method: "POST" })
	.validator(z.object({ saram: z.string().regex(/^\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos.") }))
	.handler(async ({ data }): Promise<SucontIdentity> => {
		await requireSucontApp()
		const user = await requireUser()
		const { saram } = data

		// `id` e `email` da sessão, nunca do payload. Conta sem e-mail só ATUALIZA a linha que
		// existir (`core.user_data.email` é NOT NULL); sem linha, a função recusa em vez de
		// devolver sucesso sobre uma gravação que não houve.
		const core = getCoreClient() as unknown as LinkOwnSaramClient
		const { error } = await core.rpc("link_own_saram", { p_user: user.id, p_email: user.email?.trim() || null, p_saram: saram })
		if (error) throw new Error(saramLinkErrorMessage(error.message))

		const military = await fetchMilitaryIdentity(saram)
		return { saram, posto: military?.posto ?? null, nomeGuerra: military?.nomeGuerra ?? null }
	})
