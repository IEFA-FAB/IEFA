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
import { requireUser } from "#/lib/auth.server"
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
