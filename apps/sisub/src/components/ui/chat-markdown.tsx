import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/cn"

// Stable references outside — React Compiler won't hoist these automatically
// since they're object/array literals; keeping them module-level prevents
// ReactMarkdown from re-parsing on every render.
const remarkPlugins = [remarkGfm, remarkBreaks]

const components: Partial<Components> = {
	p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,

	// pre wraps block code — style the container here
	pre: ({ children }) => <pre className="mt-2 overflow-auto rounded-md bg-black/10 p-3 font-mono text-xs">{children}</pre>,

	// code: block code has className="language-xxx" (set by remark);
	// inline code has no className. react-markdown v10 no longer passes `inline` prop.
	code: ({ className, children }) => {
		if (className) {
			// Block code inside <pre> — pre handles the background, code just carries the language class
			return <code className={cn("font-mono text-xs", className)}>{children}</code>
		}
		// Inline code
		return <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">{children}</code>
	},

	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline opacity-80 hover:opacity-100">
			{children}
		</a>
	),

	ul: ({ children }) => <ul className="mb-1 list-disc pl-5 last:mb-0">{children}</ul>,
	ol: ({ children }) => <ol className="mb-1 list-decimal pl-5 last:mb-0">{children}</ol>,
	li: ({ children }) => <li className="mb-0.5 last:mb-0">{children}</li>,

	blockquote: ({ children }) => <blockquote className="my-1 border-l-2 border-current/40 pl-3 opacity-70">{children}</blockquote>,

	// GFM tables
	table: ({ children }) => (
		<div className="my-2 overflow-auto">
			<table className="w-full border-collapse text-xs">{children}</table>
		</div>
	),
	th: ({ children }) => <th className="border border-black/20 bg-black/10 px-2 py-1 text-left font-medium">{children}</th>,
	td: ({ children }) => <td className="border border-black/20 px-2 py-1">{children}</td>,
}

interface ChatMarkdownProps {
	children: string
}

export function ChatMarkdown({ children }: ChatMarkdownProps) {
	return (
		<ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
			{children}
		</ReactMarkdown>
	)
}
