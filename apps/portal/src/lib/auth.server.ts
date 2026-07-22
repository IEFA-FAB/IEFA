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
 * Mesmo padrão do sisub (apps/sisub/src/lib/auth.server.ts) e do rumaer.
 */

import type { User } from "@supabase/supabase-js"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { getIefaAuthClient, getJournalServerClient } from "./supabase.server"

/** Sinaliza 401 antes de lançar — senão o framework devolve 500 e o client não distingue. */
export function unauthorized(): never {
	setResponseStatus(401)
	throw new Error("Não autenticado.")
}

/** Sinaliza 403 — autenticado, porém sem acesso ao recurso. */
export function forbidden(message = "Você não tem acesso a este recurso."): never {
	setResponseStatus(403)
	throw new Error(message)
}

/**
 * Cache request-scoped do `auth.getUser()`: ele valida o JWT no servidor Supabase
 * (round-trip de rede) e é chamado várias vezes no mesmo request — a sessão no root
 * mais o guard de cada server fn filha. Chaveado pelo `Request`; o WeakMap libera a
 * entrada quando o request é coletado. Cacheia a Promise, não o valor, para coalescer
 * chamadas concorrentes num único round-trip.
 */
const userByRequest = new WeakMap<Request, Promise<User | null>>()

export function getRequestUser(): Promise<User | null> {
	const resolve = () =>
		getIefaAuthClient()
			.auth.getUser()
			.then(({ data }) => data.user ?? null)

	const request = getRequest()
	if (!request) return resolve()

	let cached = userByRequest.get(request)
	if (!cached) {
		cached = resolve()
		userByRequest.set(request, cached)
	}
	return cached
}

/** Id do usuário autenticado, ou `null` — para endpoints de login opcional. */
export async function getRequestUserId(): Promise<string | null> {
	return (await getRequestUser())?.id ?? null
}

/** Exige sessão válida. @throws 401 */
export async function requireUserId(): Promise<string> {
	const userId = await getRequestUserId()
	if (!userId) unauthorized()
	return userId
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
