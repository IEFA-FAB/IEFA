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
import { requireSucontApp, requireUser } from "#/lib/auth.server"
import { identityFromSaramStatus, type SaramClaimOutcome, type SaramLinkIdentity, saramLinkErrorMessage } from "#/lib/saram-link"
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
 * `saram` é o vínculo da conta (verificado ou legacy); `posto`/`nomeGuerra` são o que o cadastro
 * de pessoal responde sobre ele, e só saem quando a conta pode vê-los (`core.saram_link_status`,
 * a mesma função que o sisub lê — change `saram-verified-link`). `status` é o estado do vínculo:
 * o diálogo só insiste quando há ação possível.
 */
export type SucontIdentity = SaramLinkIdentity & {
	/** Desfecho da última gravação (`saveMySaramFn`); `null` na leitura. */
	outcome: SaramClaimOutcome | null
}

/**
 * `core.saram_link_status` / `core.claim_saram` nascem em 20261003100000; o client tipado só as
 * conhece depois do `db:types` que segue o apply. Assinaturas declaradas aqui, e só elas — a
 * chamada continua sendo método do client (o `rpc` solto perderia o `this`).
 */
type SaramLinkArgs = { p_user: string; p_email: string | null; p_email_confirmed: boolean }
type SaramLinkClient = {
	rpc(fn: "saram_link_status", args: SaramLinkArgs): PromiseLike<{ data: unknown; error: { message: string } | null }>
	rpc(fn: "claim_saram", args: SaramLinkArgs & { p_saram: string }): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/** Conta, e-mail e e-mail confirmado: tudo da sessão, nunca do payload. */
function sessionArgs(user: { id: string; email?: string | null; email_confirmed_at?: string | null }): SaramLinkArgs {
	return { p_user: user.id, p_email: user.email?.trim() || null, p_email_confirmed: Boolean(user.email_confirmed_at) }
}

/**
 * Identidade do PRÓPRIO usuário. Sem argumento: o `id` e o e-mail vêm do JWT — receber um
 * `userId` do cliente aqui devolveria o SARAM de qualquer conta (IDOR), e SARAM é dado pessoal.
 *
 * É o que decide se o diálogo de primeiro acesso aparece: `saram: null` com ação possível
 * (`saramStatusNeedsAction`).
 */
export const fetchMyIdentityFn = createServerFn({ method: "GET" }).handler(async (): Promise<SucontIdentity> => {
	const user = await requireUser()

	const core = getCoreClient() as unknown as SaramLinkClient
	const { data, error } = await core.rpc("saram_link_status", sessionArgs(user))
	if (error) throw new Error(saramLinkErrorMessage(error.message))
	return { ...identityFromSaramStatus(data), outcome: null }
})

/**
 * O SARAM digitado no diálogo de primeiro acesso. O número vem do formulário (é input legítimo
 * do usuário); `id`, e-mail e e-mail confirmado, da sessão.
 *
 * Exige acesso ao app (`requireSucontApp`, qualquer módulo do sucont): só sessão bastava, e
 * qualquer conta do ERP gravava SARAM por este endpoint sem nunca ter acesso ao hub.
 *
 * Desde 20261003100000 o número não é gravado como veio: `core.claim_saram` (a MESMA regra do
 * `syncUserSaram` do sisub, no banco) só vincula se ele for o candidato único da chave do e-mail
 * institucional da sessão (nome de guerra + iniciais, o padrão do Zimbra). Qualquer outro vira
 * pedido para a administração do sistema, e a conta não vê o cadastro de ninguém até a decisão.
 * Antes, quem pedia primeiro levava: o número de outra pessoa abria o posto e o nome de guerra
 * dela.
 */
export const saveMySaramFn = createServerFn({ method: "POST" })
	.validator(z.object({ saram: z.string().regex(/^\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos.") }))
	.handler(async ({ data }): Promise<SucontIdentity> => {
		await requireSucontApp()
		const user = await requireUser()

		const core = getCoreClient() as unknown as SaramLinkClient
		const { data: claimed, error } = await core.rpc("claim_saram", { ...sessionArgs(user), p_saram: data.saram })
		if (error) throw new Error(saramLinkErrorMessage(error.message))

		const result = (claimed ?? {}) as { outcome?: SaramClaimOutcome; status?: unknown }
		return { ...identityFromSaramStatus(result.status), outcome: result.outcome ?? null }
	})
