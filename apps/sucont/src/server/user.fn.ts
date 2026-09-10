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
import { requireUser, requireUserId } from "#/lib/auth.server"
import { fetchMilitaryIdentity } from "#/lib/military.server"
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
 * `nrOrdem` é o que a conta declarou; `posto`/`nomeGuerra` são o que o cadastro de
 * pessoal responde sobre ele. Os dois viajam separados porque a segunda pode faltar
 * (SARAM digitado errado, ou pessoa ausente do espelho) sem que a primeira falte.
 */
export type SucontIdentity = {
	nrOrdem: string | null
	posto: string | null
	nomeGuerra: string | null
}

const EMPTY_IDENTITY: SucontIdentity = { nrOrdem: null, posto: null, nomeGuerra: null }

/**
 * Identidade do PRÓPRIO usuário. Sem argumento: o `id` vem do JWT — receber um
 * `userId` do cliente aqui devolveria o SARAM de qualquer conta (IDOR), e SARAM é
 * dado pessoal.
 *
 * É o que decide se o diálogo de primeiro acesso aparece: `nrOrdem: null` significa
 * "ainda não informou".
 */
export const fetchMyIdentityFn = createServerFn({ method: "GET" }).handler(async (): Promise<SucontIdentity> => {
	const userId = await requireUserId()

	const { data, error } = await getCoreClient().from("user_data").select("nrOrdem").eq("id", userId).maybeSingle()
	if (error) throw new Error(error.message)

	const nrOrdem = data?.nrOrdem?.trim() || null
	if (!nrOrdem) return EMPTY_IDENTITY

	const military = await fetchMilitaryIdentity(nrOrdem)
	return { nrOrdem, posto: military?.posto ?? null, nomeGuerra: military?.nomeGuerra ?? null }
})

/**
 * Vincula um SARAM à PRÓPRIA conta. O número vem do formulário (é input legítimo do
 * usuário); `id` e `email`, da sessão.
 *
 * O SARAM NÃO é validado contra o cadastro de pessoal antes de gravar, de propósito:
 * o espelho de `core.user_military_data` é uma cópia com data, e recusar quem não
 * está nela trancaria fora do hub exatamente quem chegou depois da última carga. O
 * que a gravação devolve é a identificação resolvida — `null` ali é o sinal de que o
 * número não bate com ninguém, e a tela diz isso em vez de fingir sucesso completo.
 */
export const saveMyNrOrdemFn = createServerFn({ method: "POST" })
	.validator(z.object({ nrOrdem: z.string().regex(/^\d{6,7}$/, "O SARAM tem 6 ou 7 dígitos.") }))
	.handler(async ({ data }): Promise<SucontIdentity> => {
		const user = await requireUser()
		const { nrOrdem } = data
		const email = user.email?.trim()
		const core = getCoreClient()

		// A linha já existe em quase todo caso — `syncSucontIdentityFn` a grava no
		// login. Sem e-mail na conta não há como INSERIR (`core.user_data.email` é
		// NOT NULL), então resta atualizar a linha que porventura exista — e é
		// justamente a conta sem e-mail que `syncSucontIdentityFn` desiste de gravar,
		// então "porventura" ali costuma ser "nenhuma".
		//
		// Daí o `.select("id")`: sem ele o update de zero linhas volta SEM erro, o
		// handler devolveria a identificação resolvida e a tela cantaria sucesso sobre
		// uma gravação que não houve.
		const { data: written, error } = email
			? await core.from("user_data").upsert({ id: user.id, email, nrOrdem }, { onConflict: "id" }).select("id")
			: await core.from("user_data").update({ nrOrdem }).eq("id", user.id).select("id")

		if (error) {
			// 23505 aqui é colisão do índice único de EMAIL: outra linha, de outro `id`,
			// já detém este endereço. Reivindicá-lo apagaria o cadastro de outra pessoa
			// (o sisub faz isso deliberadamente; aqui não). O usuário não resolve isso
			// sozinho, então a mensagem manda para quem resolve.
			if (error.code === "23505") throw new Error("Seu e-mail já está registrado em outra conta do ERP. Procure o administrador do SUCONT.")
			throw new Error(error.message)
		}

		// Conta sem e-mail e sem linha no cadastro: não há o que atualizar, e o ERP
		// não tem como inseri-la. O caminho de saída passa por quem administra.
		if (!written || written.length === 0) {
			throw new Error("Sua conta ainda não está no cadastro de pessoas do ERP. Procure o administrador do SUCONT.")
		}

		const military = await fetchMilitaryIdentity(nrOrdem)
		return { nrOrdem, posto: military?.posto ?? null, nomeGuerra: military?.nomeGuerra ?? null }
	})
