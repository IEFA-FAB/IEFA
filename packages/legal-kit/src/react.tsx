import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { LEGAL_CONTACT_EMAIL } from "./contact.ts"
import { formatEffectiveDate } from "./format.ts"
import { DEFAULT_LEGAL_LOCALE, LEGAL_DOC_PATHS, LEGAL_DOC_TITLES, type LegalDocType, type LegalDocument, type LegalLocale } from "./types.ts"

/**
 * Renderização compartilhada dos documentos legais.
 *
 * O `sisub` e o `portal` NÃO usam este módulo: têm design systems próprios e
 * incompatíveis (flat com radius de 0.5rem vs. Pale Brutalism com radius zero) e
 * já mantêm renderizadores afinados a cada contrato. Aqui ficam os apps que não
 * têm contrato visual próprio — rumaer, forms, sucont, assignment-selection —
 * usando apenas tokens neutros do Tailwind, sem radius e sem cor de acento.
 *
 * Navegação por `<a>` e não pelo `Link` do router: o `to` tipado do TanStack
 * Router é resolvido contra a árvore de rotas de CADA app, e um componente
 * compartilhado não tem como satisfazer quatro árvores diferentes. Documento
 * legal é destino terminal — recarregar a página ao abri-lo não custa nada.
 */

const remarkPlugins = [remarkGfm, remarkBreaks]
const rehypePlugins = [rehypeSanitize]

const components: Partial<Components> = {
	h1: ({ children }) => <h1 className="text-2xl font-bold tracking-tight mb-6 mt-0">{children}</h1>,
	h2: ({ children }) => <h2 className="text-lg font-semibold tracking-tight mt-8 mb-3 first:mt-0">{children}</h2>,
	h3: ({ children }) => <h3 className="text-base font-semibold mt-6 mb-2">{children}</h3>,
	p: ({ children }) => <p className="text-sm text-muted-foreground leading-relaxed mb-4 last:mb-0">{children}</p>,
	ul: ({ children }) => <ul className="list-disc pl-5 mb-4 flex flex-col gap-1">{children}</ul>,
	ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 flex flex-col gap-1">{children}</ol>,
	li: ({ children }) => <li className="text-sm text-muted-foreground leading-relaxed">{children}</li>,
	strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
	a: ({ href, children }) => (
		<a href={href} className="underline underline-offset-2 hover:text-foreground transition-colors">
			{children}
		</a>
	),
	hr: () => <hr className="border-border my-8" />,
	table: ({ children }) => (
		<div className="my-6 overflow-x-auto border border-border">
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	),
	thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
	th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-foreground align-top">{children}</th>,
	td: ({ children }) => <td className="border-b border-border px-3 py-2 text-xs text-muted-foreground align-top">{children}</td>,
	blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-4 my-4 text-sm text-muted-foreground italic">{children}</blockquote>,
	code: ({ children }) => <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
}

const STRINGS = {
	"pt-BR": {
		meta: (version: string, date: string) => `Versão ${version} — Vigente desde ${date}`,
		notFound: "Documento não encontrado.",
		legalNav: "Documentos legais",
		documentsInForce: "Documentos legais vigentes:",
		and: " e ",
		requests: "Pedidos de acesso, correção ou exclusão de dados:",
		acknowledge: "Estou ciente",
		acknowledging: "Registrando…",
		noticeLabel: "Aviso sobre documentos legais",
	},
	"en-US": {
		meta: (version: string, date: string) => `Version ${version} — In force since ${date}`,
		notFound: "Document not found.",
		legalNav: "Legal documents",
		documentsInForce: "Legal documents in force:",
		and: " and ",
		requests: "Requests for access, correction or deletion of data:",
		acknowledge: "I acknowledge",
		acknowledging: "Recording…",
		noticeLabel: "Legal documents notice",
	},
} as const satisfies Record<LegalLocale, unknown>

export type LegalDocumentArticleProps = {
	document: LegalDocument | null
	locale?: LegalLocale
	/** Sobrescreve o título derivado do `doc_type` (raro; use para nome de app). */
	title?: string
}

/** Página completa de um documento legal, incluindo o estado "não encontrado". */
export function LegalDocumentArticle({ document, locale = DEFAULT_LEGAL_LOCALE, title }: LegalDocumentArticleProps) {
	const strings = STRINGS[locale]

	if (!document) {
		return (
			<div className="mx-auto max-w-2xl py-8">
				<p className="text-sm text-muted-foreground">{strings.notFound}</p>
			</div>
		)
	}

	const formattedDate = formatEffectiveDate(document.effective_date, locale)

	return (
		<article className="mx-auto max-w-2xl py-8">
			<header className="mb-8 border-b border-border pb-6">
				<h1 className="mb-2 text-2xl font-bold tracking-tight">{title ?? LEGAL_DOC_TITLES[locale][document.doc_type]}</h1>
				<p className="text-xs text-muted-foreground">{strings.meta(document.version, formattedDate)}</p>
			</header>

			<ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
				{document.content_md}
			</ReactMarkdown>
		</article>
	)
}

export type LegalFooterLinksProps = {
	locale?: LegalLocale
	className?: string
	linkClassName?: string
	docTypes?: readonly LegalDocType[]
}

const DEFAULT_FOOTER_DOCS: readonly LegalDocType[] = ["terms_of_use", "privacy_policy", "cookie_policy"]

/** Fila de links legais para rodapé/barra lateral. */
export function LegalFooterLinks({
	locale = DEFAULT_LEGAL_LOCALE,
	className = "flex flex-wrap items-center gap-x-3 gap-y-1",
	linkClassName = "text-xs text-muted-foreground transition-colors hover:text-foreground",
	docTypes = DEFAULT_FOOTER_DOCS,
}: LegalFooterLinksProps) {
	return (
		<nav aria-label={STRINGS[locale].legalNav} className={className}>
			{docTypes.map((docType) => (
				<a key={docType} href={LEGAL_DOC_PATHS[locale][docType]} className={linkClassName}>
					{LEGAL_DOC_TITLES[locale][docType]}
				</a>
			))}
		</nav>
	)
}

export type LegalNoticeBannerProps = {
	/** Documentos vigentes sem ciência registrada. Vazio/indefinido ⇒ não renderiza. */
	pending: readonly LegalDocument[] | undefined
	onAcknowledge: (documentIds: string[]) => void
	isPending?: boolean
	locale?: LegalLocale
}

/**
 * Aviso de ciência dos documentos vigentes.
 *
 * NÃO é banner de consentimento de cookies e não bloqueia navegação: a base legal
 * do tratamento é o art. 7º, III / art. 23 da LGPD (execução de política pública),
 * não consentimento. Exigir "aceitar" para prosseguir pediria uma escolha que o
 * usuário não tem, e aceite coagido é pior que nenhum registro. O que fica gravado
 * é ciência de uma VERSÃO específica — publicar versão nova faz o aviso voltar.
 *
 * Sem estado próprio: quem busca os pendentes e chama o registro é o app, porque
 * cada um tem seu próprio cliente de dados e sua própria noção de sessão.
 */
export function LegalNoticeBanner({ pending, onAcknowledge, isPending = false, locale = DEFAULT_LEGAL_LOCALE }: LegalNoticeBannerProps) {
	if (!pending || pending.length === 0) return null
	const strings = STRINGS[locale]

	return (
		<section className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-4 py-3" aria-label={strings.noticeLabel}>
			<div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-xs leading-relaxed text-muted-foreground">
					{strings.documentsInForce}{" "}
					{pending.map((doc, index) => (
						<span key={doc.id}>
							{index > 0 && (index === pending.length - 1 ? strings.and : ", ")}
							<a href={LEGAL_DOC_PATHS[locale][doc.doc_type]} className="underline underline-offset-2 hover:text-foreground">
								{LEGAL_DOC_TITLES[locale][doc.doc_type]}
							</a>
						</span>
					))}
					. {strings.requests} <span className="font-medium text-foreground">{LEGAL_CONTACT_EMAIL}</span>.
				</p>

				<button
					type="button"
					className="shrink-0 border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
					disabled={isPending}
					onClick={() => onAcknowledge(pending.map((doc) => doc.id))}
				>
					{isPending ? strings.acknowledging : strings.acknowledge}
				</button>
			</div>
		</section>
	)
}
