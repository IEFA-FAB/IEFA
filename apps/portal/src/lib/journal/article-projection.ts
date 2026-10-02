/**
 * @module article-projection
 * O que cada tipo de acesso recebe de um artigo do journal: linha do artigo, coautores e
 * versões. As server fns leem com o client service-role (linha inteira); a projeção é a
 * única barreira entre a linha e o chamador.
 *
 * Regra: allowlist por tipo de acesso, nunca "tira o campo X". Coluna nova na tabela não
 * sai para revisor nem para leitor público sem alguém decidir isso aqui.
 *
 * - **Editor:** tudo.
 * - **Autor submissor:** o próprio artigo e os próprios coautores inteiros; das versões, sem
 *   `notes` (anotação do editor) e sem `uploaded_by`.
 * - **Revisor designado:** o necessário para avaliar o manuscrito e nada que identifique quem
 *   o escreveu (revisão duplo-cega): sem `submitter_id`, sem coautores, sem declarações que
 *   costumam nomear pessoas e instituições (financiamento, conflito de interesse, ética,
 *   disponibilidade de dados), e das versões só o manuscrito (PDF). A fonte (`.typ`/`.zip`)
 *   carrega o bloco de autoria, e o suplementar pode ser um `.zip` com ela dentro; a tela
 *   do revisor só oferece o PDF. Vale mesmo com `enable_double_blind`
 *   desligado: o revisor não precisa da autoria para dar parecer, e a configuração muda
 *   depois de o parecer começar.
 * - **Leitor público** (artigo publicado, sem vínculo): o que a página pública mostra —
 *   coautores sem e-mail, e só a versão corrente, sem fonte nem suplementares (os mesmos
 *   arquivos que `getSignedDownloadUrlFn` assina para ele).
 *
 * Módulo puro: o teste confere o contrato sem carregar o client do Supabase.
 */

/**
 * Com que direito o chamador lê o artigo. As fns de leitura decidem a PROJEÇÃO por aqui
 * (ver `requireArticleAccess` em `auth.server.ts`).
 */
export type ArticleAccess = {
	isEditor: boolean
	isSubmitter: boolean
	isAssignedReviewer: boolean
	/** Acesso só porque o artigo está publicado — anônimo ou autenticado sem vínculo. */
	isPublicReader: boolean
}

type Row = Record<string, unknown>

/** Conteúdo do manuscrito — o que o revisor avalia. */
const REVIEWER_ARTICLE_FIELDS = [
	"id",
	"submission_number",
	"title_pt",
	"title_en",
	"abstract_pt",
	"abstract_en",
	"keywords_pt",
	"keywords_en",
	"article_type",
	"subject_area",
	"status",
	"submitted_at",
	"created_at",
	"updated_at",
] as const

/** Artigo publicado: o conteúdo e as declarações que acompanham a publicação. */
const PUBLIC_ARTICLE_FIELDS = [
	...REVIEWER_ARTICLE_FIELDS,
	"conflict_of_interest",
	"funding_info",
	"data_availability",
	"ethics_approval",
	"doi",
	"volume",
	"issue",
	"page_start",
	"page_end",
	"published_at",
] as const

/** Coautor como a página pública mostra: sem e-mail (dado pessoal, ver LGPD.md). */
const PUBLIC_AUTHOR_FIELDS = ["id", "article_id", "full_name", "affiliation", "orcid", "is_corresponding", "author_order", "created_at"] as const

/** Versão vista pelo autor: os próprios arquivos, sem anotação do editor nem quem subiu. */
const SUBMITTER_VERSION_FIELDS = [
	"id",
	"article_id",
	"version_number",
	"version_label",
	"pdf_path",
	"source_path",
	"supplementary_paths",
	"created_at",
] as const

/** Versão vista pelo revisor: só o manuscrito. */
const REVIEWER_VERSION_FIELDS = ["id", "article_id", "version_number", "version_label", "pdf_path", "created_at"] as const

/** Versão vista pelo leitor público: só o PDF publicado. */
const PUBLIC_VERSION_FIELDS = ["id", "article_id", "version_number", "version_label", "pdf_path", "created_at"] as const

function isRow(value: unknown): value is Row {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

function pick(row: Row, fields: readonly string[]): Row {
	const out: Row = {}
	for (const field of fields) if (field in row) out[field] = row[field]
	return out
}

function rowsOf(value: unknown): Row[] {
	return Array.isArray(value) ? value.filter(isRow) : []
}

/** Linha de `journal.articles` para o tipo de acesso. */
export function projectArticle(article: unknown, access: ArticleAccess): Row | null {
	if (!isRow(article)) return null
	if (access.isEditor || access.isSubmitter) return article
	if (access.isAssignedReviewer) return pick(article, REVIEWER_ARTICLE_FIELDS)
	return pick(article, PUBLIC_ARTICLE_FIELDS)
}

/** Linhas de `journal.article_authors` para o tipo de acesso. Revisor não recebe nenhuma. */
export function projectAuthors(authors: unknown, access: ArticleAccess): Row[] {
	const rows = rowsOf(authors)
	if (access.isEditor || access.isSubmitter) return rows
	if (access.isAssignedReviewer) return []
	return rows.map((row) => pick(row, PUBLIC_AUTHOR_FIELDS))
}

/**
 * Linhas de `journal.article_versions` para o tipo de acesso, na ordem recebida. Leitor
 * público recebe só a versão de maior `version_number` (a publicada).
 */
export function projectVersions(versions: unknown, access: ArticleAccess): Row[] {
	const rows = rowsOf(versions)
	if (access.isEditor) return rows
	if (access.isSubmitter) return rows.map((row) => pick(row, SUBMITTER_VERSION_FIELDS))
	if (access.isAssignedReviewer) return rows.map((row) => pick(row, REVIEWER_VERSION_FIELDS))
	const latest = rows.reduce<Row | null>((best, row) => (best === null || Number(row.version_number) > Number(best.version_number) ? row : best), null)
	return latest ? [pick(latest, PUBLIC_VERSION_FIELDS)] : []
}

/** Uma versão (a corrente, por exemplo) para o tipo de acesso. */
export function projectVersion(version: unknown, access: ArticleAccess): Row | null {
	return projectVersions(isRow(version) ? [version] : [], access)[0] ?? null
}

/**
 * Payload de `journal.get_article_details` (`{ article, authors, versions, reviews }`).
 * `reviews` embute `comments_for_editors` e a identidade do revisor: só editor recebe. Chave
 * que a RPC passe a devolver não sai para não-editor sem entrar aqui.
 */
export function projectArticleDetails(details: unknown, access: ArticleAccess): Row | null {
	if (!isRow(details)) return null
	if (access.isEditor) return details
	return {
		article: projectArticle(details.article, access),
		authors: projectAuthors(details.authors, access),
		versions: projectVersions(details.versions, access),
	}
}
