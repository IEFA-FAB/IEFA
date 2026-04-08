// Routing
import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
// Icons
import { BookOpen, ChevronsDown, ShieldCheck } from "lucide-react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { Button } from "@/components/ui/button"
import { InfoPanel } from "@/components/ui/info-panel"
import { SectionLabel } from "@/components/ui/section-label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import { type ChangelogEntry, type ChangelogPageResult, fetchChangelogPageFn } from "@/server/changelog.fn"

/* ========================================================================
   UTILITIES
   ======================================================================== */

function safeAnchorId(id: string) {
	return `chlg-${String(id)}`.replace(/[^A-Za-z0-9\-_:.]/g, "-")
}

function formatDate(iso: string) {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return iso
	return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(d)
}

function transformLinkUri(href?: string) {
	if (!href) return href
	try {
		const u = new URL(href, "https://dummy.base")
		return ["http:", "https:", "mailto:"].includes(u.protocol) ? href : "#"
	} catch {
		return "#"
	}
}

/* ========================================================================
   TAG STYLING
   ======================================================================== */

const TONE_CLASSES: Record<string, string> = {
	primary: "bg-primary/10 text-primary border-primary/25",
	secondary: "bg-secondary/10 text-secondary-foreground border-secondary/25",
	accent: "bg-accent/10 text-accent-foreground border-accent/25",
	destructive: "bg-destructive/10 text-destructive border-destructive/25",
	muted: "bg-muted text-muted-foreground border-border",
}

function toneBadge(tone: "primary" | "secondary" | "accent" | "destructive" | "muted" = "muted") {
	return TONE_CLASSES[tone] ?? TONE_CLASSES.muted
}

const TAG_TONE: Record<string, string> = {
	feat: toneBadge("primary"),
	fix: toneBadge("destructive"),
	docs: toneBadge("secondary"),
	perf: toneBadge("accent"),
}

/* ========================================================================
   MARKDOWN
   ======================================================================== */

// Definido fora do componente para evitar recriação a cada render
const markdownComponents: Partial<Components> = {
	// biome-ignore lint/suspicious/noExplicitAny: markdown props
	a: ({ node, href, ...props }: any) => (
		<a
			{...props}
			href={transformLinkUri(href)}
			className="cursor-pointer text-primary hover:text-primary/90 underline"
			target="_blank"
			rel="noopener noreferrer nofollow"
		/>
	),
	// biome-ignore lint/suspicious/noExplicitAny: markdown component props
	ul: ({ node, ...props }: any) => <ul {...props} className="list-disc pl-6" />,
	// biome-ignore lint/suspicious/noExplicitAny: markdown component props
	ol: ({ node, ...props }: any) => <ol {...props} className="list-decimal pl-6" />,
	// biome-ignore lint/suspicious/noExplicitAny: markdown component props
	code: (props: any) => {
		const { inline, className, children, ...rest } = props
		if (inline) {
			return (
				<code {...rest} className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground", className)}>
					{children}
				</code>
			)
		}
		return (
			<pre className="bg-muted text-foreground p-4 rounded-md overflow-x-auto">
				<code {...rest} className={className}>
					{children}
				</code>
			</pre>
		)
	},
}

/* ========================================================================
   SUBCOMPONENTS
   ======================================================================== */

function TagBadge({ tag }: { id: string; tag: string }) {
	const key = (tag ?? "").toLowerCase()
	const tone = TAG_TONE[key] ?? toneBadge("muted")
	return <span className={cn("inline-flex items-center text-xs font-mono px-2 py-0.5 rounded-full border", tone)}>{tag}</span>
}

function MarkdownContent({ children }: { children: string }) {
	return (
		<div className="prose max-w-none leading-relaxed dark:prose-invert prose-headings:text-foreground prose-p:text-muted-foreground">
			<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
				{children}
			</ReactMarkdown>
		</div>
	)
}

function ChangelogEntryItem({ entry }: { entry: ChangelogEntry }) {
	const anchorId = safeAnchorId(entry.id)
	return (
		<article id={anchorId} className="py-8 first:pt-0">
			<div className="flex flex-wrap items-start justify-between gap-3 mb-3">
				<div className="flex items-center gap-3">
					<Tooltip>
						<TooltipTrigger
							render={
								<a
									href={`#${anchorId}`}
									className="cursor-pointer font-mono text-xs text-muted-foreground/60 hover:text-muted-foreground"
									aria-label="Link para esta entrada"
								>
									#
								</a>
							}
						/>
						<TooltipContent>Copiar link desta entrada</TooltipContent>
					</Tooltip>
					{entry.version && (
						<span className={cn("inline-flex items-center text-xs font-mono px-2 py-0.5 rounded-full border", toneBadge("primary"))}>v{entry.version}</span>
					)}
					<h2 className="font-bold text-sm text-foreground">{entry.title}</h2>
				</div>
				<time className="font-mono text-xs text-muted-foreground/60 shrink-0" dateTime={entry.published_at} title={formatDate(entry.published_at)}>
					{formatDistanceToNow(new Date(entry.published_at), { addSuffix: true, locale: ptBR })}
				</time>
			</div>
			{entry.tags?.length ? (
				<div className="flex flex-wrap gap-2 mb-4">
					{entry.tags.map((t) => (
						<TagBadge key={`${entry.id}-${t}`} id={entry.id} tag={t} />
					))}
				</div>
			) : null}
			<MarkdownContent>{entry.body ?? ""}</MarkdownContent>
		</article>
	)
}

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

export const Route = createFileRoute("/_public/changelog")({
	component: Changelog,
	head: () => ({
		meta: [{ title: "Changelog — SISUB" }, { name: "description", content: "Melhorias, correções e novas funcionalidades do SISUB em tempo real." }],
	}),
})

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */

const PAGE_SIZE = 10 as const

function Changelog() {
	const { data, isLoading, isFetchingNextPage, error, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
		queryKey: ["changelog", "list", PAGE_SIZE],
		queryFn: ({ pageParam = 0 }) =>
			fetchChangelogPageFn({
				data: { page: pageParam as number, pageSize: PAGE_SIZE },
			}) as Promise<ChangelogPageResult>,
		getNextPageParam: (lastPage) => lastPage.nextPage,
		initialPageParam: 0,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
		retry: 2,
		refetchOnWindowFocus: false,
	})

	// React Compiler optimizes this — sem useMemo manual
	const items = data?.pages.flatMap((p) => p.items) ?? []

	return (
		<div className="w-full">
			{/* Hero */}
			<section className="min-h-[calc(100svh-5.5rem)] md:min-h-[calc(100svh-6rem)] flex flex-col justify-between pb-6 pt-2 animate-fade-slide-in">
				<div className="flex-1 flex flex-col justify-start md:justify-center max-w-3xl">
					<p className="font-mono text-xs text-muted-foreground/60 tracking-[0.2em] uppercase mb-6 md:mb-8">Sistema de Subsistência · Força Aérea Brasileira</p>
					<h1 className="text-6xl md:text-7xl lg:text-[6rem] xl:text-[7rem] font-bold tracking-tight leading-[0.95] text-foreground mb-8 md:mb-10">
						Novidades
						<br />
						<span className="text-primary">do sistema.</span>
					</h1>
					<p className="text-muted-foreground text-base md:text-xl leading-relaxed mb-10 md:mb-12 max-w-sm md:max-w-md">
						Melhorias, correções e novas funcionalidades em tempo real.
					</p>
					<Button nativeButton={false} render={<Link to="/">← Voltar</Link>} variant="outline" size="lg" />
				</div>
				<div className="flex justify-center pb-2" aria-hidden>
					<ChevronsDown className="h-5 w-5 text-muted-foreground/40 animate-bounce" />
				</div>
			</section>

			{/* 01 — Atualizações */}
			<section id="atualizacoes" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="01" label="Atualizações" />

				{isLoading && <p className="mt-8 text-sm text-muted-foreground">Carregando atualizações…</p>}

				{!isLoading && error && (
					<div className="mt-8">
						<p className="mb-3 text-sm text-destructive">{(error as Error).message}</p>
						<Button onClick={() => refetch()} variant="outline" size="sm">
							Tentar novamente
						</Button>
					</div>
				)}

				{!isLoading && !error && items.length === 0 && (
					<p className="mt-8 text-sm text-muted-foreground">Nenhuma publicação encontrada ainda. Volte em breve.</p>
				)}

				{!isLoading && !error && items.length > 0 && (
					<>
						<div className="mt-8 divide-y divide-border">
							{items.map((entry) => (
								<ChangelogEntryItem key={entry.id} entry={entry} />
							))}
						</div>
						{hasNextPage && (
							<div className="mt-8">
								<Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} aria-busy={isFetchingNextPage} variant="outline">
									{isFetchingNextPage ? "Carregando…" : "Carregar mais"}
								</Button>
							</div>
						)}
					</>
				)}
			</section>

			{/* 02 — Saiba mais */}
			<section id="saiba-mais" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="02" label="Saiba mais" />
				<div className="mt-8 grid md:grid-cols-2 gap-4">
					<InfoPanel
						icon={BookOpen}
						label="Tutorial"
						title="Guia do SISUB"
						description="Entenda cada módulo, seu perfil de acesso e como operar o sistema no dia a dia."
						tags={["comensal", "fiscal", "nutricionista", "gestor"]}
						to="/tutorial"
						cta="Ver Tutorial"
					/>
					<InfoPanel
						icon={ShieldCheck}
						label="Acesso"
						title="Entrar no SISUB"
						description="Acesse o sistema com suas credenciais militares para começar a operar seu módulo."
						tags={["login", "hub", "módulos"]}
						to="/auth"
						cta="Fazer Login"
					/>
				</div>
			</section>
		</div>
	)
}
