import { Check, Copy } from "iconoir-react"
import { useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { CITATION_LABEL, type Citation, splitRedaction } from "@/lib/alpha/chat-model"

const remarkPlugins = [remarkGfm, remarkBreaks]
const rehypePlugins = [rehypeSanitize]

/** Prefixo do link interno que vira marcador de citação. */
const CITE = "cite-"

/**
 * Corpo de uma resposta do assistente: markdown, com os rótulos `[N1]`/`[A2]`/`[D1:3]`
 * virando marcadores clicáveis e os blocos ` ```redacao ` virando cartões copiáveis.
 *
 * Rótulo que não está em `citations` (durante o streaming, antes do `complete`) fica como
 * texto — nunca um marcador que abriria fonte nenhuma.
 */
export function MessageBody({ content, citations, onCite }: { content: string; citations: readonly Citation[]; onCite?: (label: string) => void }) {
	const known = new Set(citations.map((citation) => citation.label))

	const components: Partial<Components> = {
		a: ({ href, children }) => {
			const at = href?.indexOf(CITE) ?? -1
			if (href && at >= 0) {
				const label = decodeURIComponent(href.slice(at + CITE.length))
				return (
					<button
						type="button"
						onClick={() => onCite?.(label)}
						className="mx-0.5 inline-flex h-5 items-center border border-border bg-background px-1 align-baseline font-mono text-[10px] text-foreground hover:bg-muted"
						aria-label={`Abrir a fonte ${label}`}
					>
						{label}
					</button>
				)
			}
			return (
				<a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
					{children}
				</a>
			)
		},
		p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
		ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
		ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
		h1: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
		h2: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
		h3: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
		code: ({ children }) => <code className="bg-muted px-1 font-mono text-[0.85em]">{children}</code>,
		blockquote: ({ children }) => <blockquote className="mb-3 border-border border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
	}

	const withChips = (text: string) =>
		text.replace(CITATION_LABEL, (match, label: string) => (known.has(label) ? `[${label}](#${CITE}${encodeURIComponent(label)})` : match))

	return (
		<div className="text-sm leading-relaxed">
			{splitRedaction(content).map((part, index) =>
				part.kind === "redacao" ? (
					<RedactionBlock key={`r-${index}`} section={part.section} text={part.text} />
				) : (
					<ReactMarkdown key={`m-${index}`} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
						{withChips(part.text)}
					</ReactMarkdown>
				)
			)}
		</div>
	)
}

/**
 * Redação sugerida. O aviso é fixo e fica FORA do que se copia: vai para o documento oficial
 * só o texto proposto.
 */
export function RedactionBlock({ section, text }: { section: string | null; text: string }) {
	const [copied, setCopied] = useState(false)

	const copy = async () => {
		await navigator.clipboard.writeText(text)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<figure className="my-3 border border-border bg-muted/60">
			<figcaption className="flex items-center justify-between gap-2 border-border border-b px-3 py-1.5">
				<span className="text-label text-muted-foreground">Redação sugerida{section ? ` · seção ${section}` : ""}</span>
				<Button size="xs" variant="ghost" onClick={copy} aria-label="Copiar a redação sugerida">
					{copied ? <Check /> : <Copy />}
					{copied ? "copiado" : "copiar"}
				</Button>
			</figcaption>
			<pre className="whitespace-pre-wrap px-3 py-2 font-serif text-sm leading-relaxed">{text}</pre>
			<p className="border-border border-t px-3 py-1.5 text-[11px] text-muted-foreground">
				Sugestão do assistente — confira com a norma antes de usar no documento.
			</p>
		</figure>
	)
}
