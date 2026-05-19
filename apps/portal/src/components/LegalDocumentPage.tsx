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
}

interface LegalDocumentPageProps {
	title: string
	content_md: string
	effective_date: string
	version: string
}

export function LegalDocumentPage({ title, content_md, effective_date, version }: LegalDocumentPageProps) {
	const formattedDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(effective_date))

	return (
		<article className="max-w-2xl mx-auto py-8">
			<header className="mb-8 pb-6 border-b border-border">
				<h1 className="text-2xl font-bold tracking-tight mb-2">{title}</h1>
				<p className="text-xs text-muted-foreground">
					Versão {version} — Vigente desde {formattedDate}
				</p>
			</header>

			<div>
				<ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
					{content_md}
				</ReactMarkdown>
			</div>
		</article>
	)
}
