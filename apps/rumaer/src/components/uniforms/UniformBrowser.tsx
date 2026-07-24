import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowDown, ArrowRight, ArrowUp, ImageOff, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { uniformMatchesQuery } from "@/lib/uniforms/filter"
import { uniformPreviewImagesQueryOptions, uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { CATEGORIA_LABELS, GRUPO_ACCENT, GRUPO_LABELS, GRUPO_ORDER, uniformTitle } from "@/lib/uniforms/labels"
import { CATEGORIAS, SORT_LABELS, SORT_OPTIONS, type SortKey, type UniformSearch } from "@/lib/uniforms/search"
import { cn } from "@/lib/utils"
import type { UniformListItem } from "@/server/uniforms.fn"

/** Comparador estável entre uniformes para a chave de ordenação (sempre ascendente; direção aplicada depois). */
function compareUniforms(a: UniformListItem, b: UniformListItem, sort: SortKey): number {
	switch (sort) {
		case "numero": {
			if (a.numero == null && b.numero == null) return a.nome.localeCompare(b.nome, "pt-BR")
			if (a.numero == null) return 1
			if (b.numero == null) return -1
			if (a.numero !== b.numero) return a.numero - b.numero
			return (a.letra ?? "").localeCompare(b.letra ?? "", "pt-BR")
		}
		case "art": {
			const aArt = a.art_referencia ?? ""
			const bArt = b.art_referencia ?? ""
			if (!aArt && !bArt) return a.ordem - b.ordem
			if (!aArt) return 1
			if (!bArt) return -1
			return aArt.localeCompare(bArt, "pt-BR", { numeric: true })
		}
		case "nome":
			return uniformTitle(a).localeCompare(uniformTitle(b), "pt-BR")
		case "grupo": {
			const ga = GRUPO_ORDER.indexOf(a.grupo)
			const gb = GRUPO_ORDER.indexOf(b.grupo)
			if (ga !== gb) return ga - gb
			return a.ordem - b.ordem
		}
		default:
			return a.ordem - b.ordem
	}
}

type SetSearch = (updater: (prev: UniformSearch) => UniformSearch) => void

/**
 * Lista completa de uniformes — busca por texto, filtros por grupo/categoria, ordenação e grid.
 * Lê e escreve o estado nos search params da rota dona (a home `/`), via `search`/`setSearch`.
 */
export function UniformBrowser({ search, setSearch }: { search: UniformSearch; setSearch: SetSearch }) {
	const { data: uniforms } = useSuspenseQuery(uniformsQueryOptions({ grupo: search.grupo, categoria: search.categoria }))

	const grupoValue = search.grupo ?? "all"
	const categoriaValue = search.categoria ?? "all"
	const q = search.q ?? ""
	const sort: SortKey = search.sort ?? "ordem"
	const dir = search.dir ?? "asc"

	const term = q.trim()
	const matched = term ? uniforms.filter((u) => uniformMatchesQuery(u, q)) : uniforms

	const filtered = [...matched].sort((a, b) => compareUniforms(a, b, sort))
	if (dir === "desc") filtered.reverse()

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-2">
				<h2 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">Todos os uniformes</h2>
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
							onChange={(e) => setSearch((p) => ({ ...p, q: e.target.value || undefined }))}
							placeholder="Nº, art. de referência, traje, equivalência…"
							aria-label="Buscar uniforme"
							className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-1.5">
					<span className="text-label text-muted-foreground">Grupo</span>
					<Select value={grupoValue} onValueChange={(v) => setSearch((p) => ({ ...p, grupo: v === "all" ? undefined : (v as (typeof GRUPO_ORDER)[number]) }))}>
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
						onValueChange={(v) => setSearch((p) => ({ ...p, categoria: v === "all" ? undefined : (v as (typeof CATEGORIAS)[number]) }))}
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

				{/* Ordenação */}
				<div className="flex flex-col gap-1.5">
					<span className="text-label text-muted-foreground">Ordenar por</span>
					<div className="flex items-stretch gap-2">
						<Select value={sort} onValueChange={(v) => setSearch((p) => ({ ...p, sort: v === "ordem" ? undefined : (v as SortKey) }))}>
							<SelectTrigger className="min-w-48">
								<SelectValue>{SORT_LABELS[sort]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{SORT_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<button
							type="button"
							onClick={() => setSearch((p) => ({ ...p, dir: dir === "asc" ? "desc" : undefined }))}
							aria-label={dir === "asc" ? "Ordem crescente — alternar para decrescente" : "Ordem decrescente — alternar para crescente"}
							title={dir === "asc" ? "Crescente" : "Decrescente"}
							className="flex shrink-0 items-center justify-center rounded-lg border border-input bg-card px-3 text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-foreground focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
						>
							{dir === "asc" ? <ArrowUp className="size-4" aria-hidden="true" /> : <ArrowDown className="size-4" aria-hidden="true" />}
						</button>
					</div>
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
								<Card
									className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md"
									style={{
										borderColor: `color-mix(in oklch, ${GRUPO_ACCENT[u.grupo]} 35%, var(--border))`,
										background: `color-mix(in oklch, ${GRUPO_ACCENT[u.grupo]} 5%, var(--card))`,
									}}
								>
									<CardHeader>
										<div className="flex items-center justify-between gap-2">
											<Badge
												variant="outline"
												style={{ borderColor: `color-mix(in oklch, ${GRUPO_ACCENT[u.grupo]} 45%, transparent)`, color: GRUPO_ACCENT[u.grupo] }}
											>
												{GRUPO_LABELS[u.grupo]}
											</Badge>
											<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
										</div>
										<CardTitle className="mt-2">{uniformTitle(u)}</CardTitle>
									</CardHeader>
									{/* Imagem inline só no mobile (sem hover) — ajuda a identificar o uniforme na busca */}
									<UniformCardMedia uniformId={u.id} title={uniformTitle(u)} />
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
 * Imagem de capa inline exibida dentro do card no mobile (onde não há hover).
 * Carrega sob demanda: só busca as imagens quando o card entra no viewport
 * (IntersectionObserver), e some se o uniforme não tiver ilustração.
 */
function UniformCardMedia({ uniformId, title }: { uniformId: string; title: string }) {
	const ref = useRef<HTMLDivElement>(null)
	const [inView, setInView] = useState(false)

	useEffect(() => {
		const el = ref.current
		if (!el || inView) return
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setInView(true)
					io.disconnect()
				}
			},
			{ rootMargin: "300px" }
		)
		io.observe(el)
		return () => io.disconnect()
	}, [inView])

	const { data: images, isLoading } = useQuery({ ...uniformPreviewImagesQueryOptions(uniformId), enabled: inView })
	const count = images?.length ?? 0
	const cover = images?.[0]

	return (
		<div ref={ref} className="md:hidden">
			{!isLoading && count === 0 ? null : (
				<div className="relative mt-3 aspect-[4/3] border-y border-border/60 bg-muted/20">
					{cover ? (
						<img src={cover} alt={title} className="absolute inset-0 h-full w-full object-contain" />
					) : (
						<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
							{isLoading ? <Spinner className="size-5" /> : <ImageOff className="size-5" aria-hidden="true" />}
						</div>
					)}
					{count > 1 && (
						<span className="absolute right-2 bottom-2 rounded-full bg-foreground/70 px-1.5 py-0.5 text-[10px] font-medium text-background">
							+{count - 1} foto(s)
						</span>
					)}
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
