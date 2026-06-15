import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, ImageOff, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { uniformPreviewImagesQueryOptions, uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { CATEGORIA_LABELS, GRUPO_LABELS, GRUPO_ORDER, uniformTitle } from "@/lib/uniforms/labels"
import { cn } from "@/lib/utils"

const GRUPOS = ["historicos", "representacao", "servicos", "educacao_fisica", "desfile"] as const
const CATEGORIAS = ["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"] as const

const searchSchema = z.object({
	grupo: z.enum(GRUPOS).optional(),
	categoria: z.enum(CATEGORIAS).optional(),
	q: z.string().optional(),
})

export const Route = createFileRoute("/_public/uniformes/")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ grupo: search.grupo, categoria: search.categoria }),
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(uniformsQueryOptions(deps)),
	component: BrowsePage,
})

function BrowsePage() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data: uniforms } = useSuspenseQuery(uniformsQueryOptions({ grupo: search.grupo, categoria: search.categoria }))

	const grupoValue = search.grupo ?? "all"
	const categoriaValue = search.categoria ?? "all"
	const q = search.q ?? ""

	const term = q.trim().toLowerCase()
	const filtered = term
		? uniforms.filter((u) => {
				const haystack = [uniformTitle(u), u.nome, u.traje ?? "", GRUPO_LABELS[u.grupo], ...u.categories.map((c) => CATEGORIA_LABELS[c.categoria])]
					.join(" ")
					.toLowerCase()
				return haystack.includes(term)
			})
		: uniforms

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">Uniformes</h1>
				<p className="text-sm text-muted-foreground">
					{filtered.length} uniforme(s){term ? ` para “${q}”` : ""} — busque ou filtre por grupo e categoria.
				</p>
			</header>

			<div className="flex flex-wrap items-end gap-4">
				{/* Busca por texto */}
				<div className="flex min-w-64 flex-1 flex-col gap-1.5">
					<span className="text-label text-muted-foreground">Buscar</span>
					<div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 shadow-xs focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30">
						<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<input
							type="text"
							value={q}
							onChange={(e) => navigate({ search: (p) => ({ ...p, q: e.target.value || undefined }) })}
							placeholder="Uniforme, ocasião ou peça…"
							aria-label="Buscar uniforme"
							className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-label text-muted-foreground">Grupo</span>
					<Select
						value={grupoValue}
						onValueChange={(v) => navigate({ search: (p) => ({ ...p, grupo: v === "all" ? undefined : (v as (typeof GRUPOS)[number]) }) })}
					>
						<SelectTrigger className="min-w-48">
							<SelectValue placeholder="Todos os grupos">{search.grupo ? GRUPO_LABELS[search.grupo] : "Todos os grupos"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos os grupos</SelectItem>
							{GRUPO_ORDER.map((g) => (
								<SelectItem key={g} value={g}>
									{GRUPO_LABELS[g]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-label text-muted-foreground">Categoria</span>
					<Select
						value={categoriaValue}
						onValueChange={(v) => navigate({ search: (p) => ({ ...p, categoria: v === "all" ? undefined : (v as (typeof CATEGORIAS)[number]) }) })}
					>
						<SelectTrigger className="min-w-48">
							<SelectValue placeholder="Todas as categorias">{search.categoria ? CATEGORIA_LABELS[search.categoria] : "Todas as categorias"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todas as categorias</SelectItem>
							{CATEGORIAS.map((c) => (
								<SelectItem key={c} value={c}>
									{CATEGORIA_LABELS[c]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{filtered.length === 0 ? (
				<p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
					Nenhum uniforme encontrado para o filtro selecionado.
				</p>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{filtered.map((u) => (
						<HoverCard key={u.id}>
							<HoverCardTrigger render={<Link to="/uniformes/$uniformId" params={{ uniformId: u.id }} className="group block" />}>
								<Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
									<CardHeader>
										<div className="flex items-center justify-between gap-2">
											<Badge variant="outline">{GRUPO_LABELS[u.grupo]}</Badge>
											<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
										</div>
										<CardTitle className="mt-2">{uniformTitle(u)}</CardTitle>
									</CardHeader>
									<CardContent className="flex flex-col gap-2">
										<p className="text-sm text-muted-foreground">{u.traje ?? u.nome}</p>
										<div className="flex flex-wrap gap-1">
											{u.categories.map((c) => (
												<Badge key={c.categoria} variant="secondary">
													{CATEGORIA_LABELS[c.categoria]}
												</Badge>
											))}
										</div>
									</CardContent>
								</Card>
							</HoverCardTrigger>
							<HoverCardContent side="right" align="start" className="w-60 overflow-hidden p-0">
								<UniformPreview uniformId={u.id} title={uniformTitle(u)} />
							</HoverCardContent>
						</HoverCard>
					))}
				</div>
			)}
		</div>
	)
}

/**
 * Slideshow das imagens do uniforme exibido no hover-card.
 * As imagens só são buscadas/assinadas quando o card abre (Portal monta sob demanda).
 */
function UniformPreview({ uniformId, title }: { uniformId: string; title: string }) {
	const { data: images, isLoading } = useQuery(uniformPreviewImagesQueryOptions(uniformId))
	const [index, setIndex] = useState(0)
	const count = images?.length ?? 0

	// Auto-avanço; reinicia quando a quantidade de imagens muda.
	useEffect(() => {
		setIndex(0)
		if (count <= 1) return
		const id = setInterval(() => setIndex((i) => (i + 1) % count), 1800)
		return () => clearInterval(id)
	}, [count])

	const active = count > 0 ? index % count : 0

	return (
		<div className="flex flex-col">
			<div className="relative aspect-[3/4] bg-muted/30">
				{isLoading ? (
					<div className="absolute inset-0 flex items-center justify-center">
						<Spinner className="size-5 text-muted-foreground" />
					</div>
				) : count === 0 ? (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
						<ImageOff className="size-5" aria-hidden="true" />
						<span className="text-xs">Sem ilustração</span>
					</div>
				) : (
					images?.map((src, i) => (
						<img
							key={src}
							src={src}
							alt={title}
							className={cn("absolute inset-0 h-full w-full object-contain transition-opacity duration-500", i === active ? "opacity-100" : "opacity-0")}
						/>
					))
				)}

				{count > 1 && (
					<div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
						{images?.map((src, i) => (
							<span key={src} className={cn("size-1.5 rounded-full transition-colors", i === active ? "bg-foreground" : "bg-foreground/25")} />
						))}
					</div>
				)}
			</div>
			<p className="truncate px-3 py-2 text-xs font-medium text-foreground">{title}</p>
		</div>
	)
}
