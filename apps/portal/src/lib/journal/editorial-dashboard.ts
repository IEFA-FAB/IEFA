/**
 * Linhas de `journal.editorial_dashboard`, conferidas no servidor.
 *
 * O client do portal não tem os tipos do `Database` (ver `supabase.server.ts`), e o painel
 * recebia a linha por cast (`as EditorialDashboardArticle[]`): a view não tinha `title_pt` e o
 * cast escondia isso — card e tabela sem título, ordenação por título sem efeito. Aqui a coluna
 * que falta vira erro com nome, em vez de `undefined` na tela.
 *
 * Módulo puro (só zod) para ser testado sem env.
 */

import { z } from "zod"
import { ARTICLE_STATUSES } from "./write-schemas"

const count = z.coerce.number().int().nonnegative()

export const EditorialDashboardRowSchema = z.object({
	id: z.string(),
	submission_number: z.string(),
	title_pt: z.string(),
	title_en: z.string(),
	status: z.enum(ARTICLE_STATUSES),
	article_type: z.enum(["research", "review", "short_communication", "editorial"]),
	subject_area: z.string(),
	submitted_at: z.string().nullable(),
	// `extract(day …)` é numeric (o PostgREST pode mandar como texto); nulo em rascunho.
	days_since_submission: z.coerce.number().nullable(),
	// LEFT JOIN no perfil desde 20260926218000: nulo quando o submissor ainda não tem perfil.
	submitter_name: z.string().nullable(),
	completed_reviews: count,
	pending_reviews: count,
})

export type EditorialDashboardArticle = z.infer<typeof EditorialDashboardRowSchema>

/** Confere as linhas da view; coluna ausente ou de tipo errado lança com o nome da coluna. */
export function parseEditorialDashboardRows(rows: unknown): EditorialDashboardArticle[] {
	const parsed = z.array(EditorialDashboardRowSchema).safeParse(rows ?? [])
	if (!parsed.success) {
		const issue = parsed.error.issues[0]
		throw new Error(`editorial_dashboard fora do contrato: ${issue?.path.join(".")} — ${issue?.message}`)
	}
	return parsed.data
}
