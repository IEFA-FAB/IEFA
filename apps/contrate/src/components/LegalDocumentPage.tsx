import { formatEffectiveDate } from "@iefa/legal-kit"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

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
	// O inventário da Política de Cookies é uma tabela; sem estes mapeamentos o
	// react-markdown emite <table> cru, sem grade nem espaçamento. Sem radius —
	// Pale Brutalism (`--radius: 0rem`).
	table: ({ children }) => (
		<div className="my-6 overflow-x-auto border border-border">
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	),
	thead: ({ children }) => <thead className="border-b border-border bg-muted/40">{children}</thead>,
	th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-foreground align-top">{children}</th>,
	td: ({ children }) => <td className="border-b border-border px-3 py-2 text-xs text-muted-foreground align-top">{children}</td>,
	blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-4 my-4 text-sm text-muted-foreground italic">{children}</blockquote>,
	code: ({ children }) => <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
}

const STRINGS = {
	"pt-BR": { meta: (version: string, date: string) => `Versão ${version} — Vigente desde ${date}` },
	"en-US": { meta: (version: string, date: string) => `Version ${version} — In force since ${date}` },
} as const

interface LegalDocumentPageProps {
	title: string
	content_md: string
	effective_date: string
	version: string
	locale?: keyof typeof STRINGS
}

export function LegalDocumentPage({ title, content_md, effective_date, version, locale = "pt-BR" }: LegalDocumentPageProps) {
	const formattedDate = formatEffectiveDate(effective_date, locale)

	return (
		<article className="max-w-2xl mx-auto py-8">
			<header className="mb-8 pb-6 border-b border-border">
				<h1 className="text-2xl font-bold tracking-tight mb-2">{title}</h1>
				<p className="text-xs text-muted-foreground">{STRINGS[locale].meta(version, formattedDate)}</p>
			</header>

			<div>
				<ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
					{content_md}
				</ReactMarkdown>
			</div>
		</article>
	)
}
