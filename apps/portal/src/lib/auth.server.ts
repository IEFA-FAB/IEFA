/**
 * @module auth.server
 * Guards de autenticação/autorização das server functions do portal.
 *
 * Por que o portal precisa disso mais do que parece: TODA server fn aqui usa o client
 * service-role (`getJournalServerClient` e afins), que bypassa RLS. E `/_serverFn/<id>`
 * é um endpoint HTTP cru — o `beforeLoad` da rota protege a navegação, não o endpoint.
 * Sem guard no handler, não existe barreira nenhuma entre a internet e o banco.
 *
 * Papéis do journal (`journal.user_profiles.role`): `author` (default), `reviewer`,
 * `editor`. A escalada de papel é privilégio de editor — ver `assertRoleChangeAllowed`.
 *
 * A autenticação (cache request-scoped do `getUser()`, 401/403) vem de
 * `@iefa/pbac/start`, compartilhada com os demais apps. A autorização abaixo é
 * própria do journal: papel em tabela, não grant PBAC.
 */

import { createRequestAuth, forbidden as denyWithStatus, unauthorized as unauthenticatedWithStatus } from "@iefa/pbac/start"
import { getIefaAuthClient, getJournalServerClient } from "./supabase.server"

/**
 * As mensagens são as do portal, não os defaults do pacote: elas chegam ao usuário
 * na tela do journal, em português.
 */
export function unauthorized(): never {
	return unauthenticatedWithStatus("Não autenticado.")
}

export function forbidden(message = "Você não tem acesso a este recurso."): never {
	return denyWithStatus(message)
}

const auth = createRequestAuth({
	getAuthClient: getIefaAuthClient,
	// O portal renderiza `err.message` direto na tela do journal — a mensagem tem
	// de sair em português daqui, e não do default em inglês do pacote.
	messages: { unauthorized: "Não autenticado." },
})

export const { getRequestUser, requireUserId } = auth

/** Id do usuário autenticado, ou `null` — para endpoints de login opcional. */
export async function getRequestUserId(): Promise<string | null> {
	return (await getRequestUser())?.id ?? null
}

/**
 * Exige que o alvo da operação seja o próprio usuário da sessão.
 *
 * O padrão `userId` no payload existe em quase toda fn deste app; mantê-lo no schema
 * evita quebrar chamadores, mas o valor NUNCA decide o alvo — só é comparado. Divergiu
 * da sessão, é IDOR: 403.
 */
export async function requireSelf(claimedUserId: string): Promise<string> {
	const userId = await requireUserId()
	if (claimedUserId !== userId) forbidden("Você só pode acessar os próprios dados.")
	return userId
}

export async function isEditor(userId: string): Promise<boolean> {
	const { data } = await getJournalServerClient().from("user_profiles").select("role").eq("id", userId).maybeSingle()
	return data?.role === "editor"
}

/** Exige papel `editor` no journal. @throws 401 sem sessão, 403 sem o papel */
export async function requireEditor(): Promise<string> {
	const userId = await requireUserId()
	if (!(await isEditor(userId))) forbidden("Apenas editores podem executar esta ação.")
	return userId
}

/** `true` se o chamador é o autor submissor do artigo. */
export async function isSubmitter(articleId: string, userId: string): Promise<boolean> {
	const { data } = await getJournalServerClient().from("articles").select("submitter_id").eq("id", articleId).maybeSingle()
	return data?.submitter_id === userId
}

/**
 * Exige que o chamador seja o autor submissor do artigo, ou editor. Para escrita em
 * artigo/autores/versões: o autor mexe no próprio manuscrito, o editor em qualquer um.
 */
export async function requireArticleOwnerOrEditor(articleId: string): Promise<{ userId: string; isEditor: boolean }> {
	const userId = await requireUserId()
	if (await isEditor(userId)) return { userId, isEditor: true }
	if (await isSubmitter(articleId, userId)) return { userId, isEditor: false }
	forbidden("Você não tem acesso a este artigo.")
}

/**
 * Acesso de LEITURA ao artigo: editor, autor submissor, revisor aceito/concluído — ou
 * artigo publicado (aí é público). Retorna se o chamador é editor, para o caller decidir
 * a redação de campos confidenciais (identidade do revisor, comentários ao editor).
 *
 * O userId vem sempre da sessão, nunca do input — é a diferença entre este guard e o
 * `canViewArticleFn`, que só responde uma pergunta.
 */
export async function requireArticleAccess(articleId: string): Promise<{ isEditor: boolean }> {
	const db = getJournalServerClient()
	const { data: article } = await db.from("articles").select("status, submitter_id, deleted_at").eq("id", articleId).maybeSingle()
	if (!article) throw new Error("Artigo não encontrado.")
	const userId = await getRequestUserId()
	if (userId && (await isEditor(userId))) return { isEditor: true }
	if (article.status === "published" && !article.deleted_at) return { isEditor: false }
	if (!userId) unauthorized()
	if (article.submitter_id === userId) return { isEditor: false }
	const { data: assignment } = await db
		.from("review_assignments")
		.select("id")
		.eq("article_id", articleId)
		.eq("reviewer_id", userId)
		.in("status", ["accepted", "completed"])
		.maybeSingle()
	if (assignment) return { isEditor: false }
	forbidden("Você não tem acesso a este artigo.")
}

/**
 * Um payload livre (`looseRecord`) que chega do cliente não pode carregar `role`: era
 * assim que qualquer chamador se promovia a `editor` e assumia o corpo editorial
 * inteiro. Só editor altera papel — e nunca por um upsert de perfil comum.
 */
export async function assertRoleChangeAllowed(payload: Record<string, unknown>): Promise<void> {
	if (!("role" in payload)) return
	const userId = await requireUserId()
	if (!(await isEditor(userId))) forbidden("Apenas editores podem alterar o papel de um usuário.")
}
