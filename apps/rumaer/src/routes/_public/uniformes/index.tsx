import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "iconoir-react"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { CATEGORIA_LABELS, GRUPO_LABELS, GRUPO_ORDER, uniformTitle } from "@/lib/uniforms/labels"

const GRUPOS = ["historicos", "representacao", "servicos", "educacao_fisica", "desfile"] as const
const CATEGORIAS = ["oficiais", "cadetes", "suboficiais", "sargentos", "alunos_formacao", "pracas"] as const

const searchSchema = z.object({
	grupo: z.enum(GRUPOS).optional(),
	categoria: z.enum(CATEGORIAS).optional(),
})

export const Route = createFileRoute("/_public/uniformes/")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(uniformsQueryOptions(deps)),
	component: BrowsePage,
})

function BrowsePage() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const { data: uniforms } = useSuspenseQuery(uniformsQueryOptions(search))

	const grupoValue = search.grupo ?? "all"
	const categoriaValue = search.categoria ?? "all"

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-2">
				<h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">Uniformes</h1>
				<p className="text-sm text-muted-foreground">{uniforms.length} uniforme(s) — filtre por grupo ou categoria.</p>
			</header>

			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupo</span>
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
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria</span>
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

			{uniforms.length === 0 ? (
				<p className="text-sm text-muted-foreground border border-dashed border-border px-4 py-8 text-center">
					Nenhum uniforme encontrado para o filtro selecionado.
				</p>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{uniforms.map((u) => (
						<Link key={u.id} to="/uniformes/$uniformId" params={{ uniformId: u.id }} className="group">
							<Card className="h-full transition-shadow group-hover:shadow-[4px_4px_0_0_var(--foreground)]">
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
						</Link>
					))}
				</div>
			)}
		</div>
	)
}
