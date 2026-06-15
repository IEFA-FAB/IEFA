import type { UniformVariantWithPieces } from "@iefa/database/rumaer"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { signedImageQueryOptions, uniformQueryOptions } from "@/lib/uniforms/hooks"
import {
	CATEGORIA_LABELS,
	CIRCULO_LABELS,
	EQ_CIVIL_LABELS,
	GENERO_LABELS,
	GRUPO_LABELS,
	OBRIGATORIEDADE_LABELS,
	OBRIGATORIEDADE_ORDER,
	TIPO_PECA_LABELS,
	uniformTitle,
} from "@/lib/uniforms/labels"

export const Route = createFileRoute("/_public/uniformes/$uniformId/")({
	loader: async ({ context, params }) => {
		const uniform = await context.queryClient.ensureQueryData(uniformQueryOptions(params.uniformId))
		if (!uniform) throw notFound()
	},
	component: DetailPage,
})

const SUB_LABEL = (sub: string | null) => (sub == null ? "Padrão" : sub === "gestante" ? "Gestante" : sub === "tropa_montada" ? "Tropa montada" : sub)

function DetailPage() {
	const { uniformId } = Route.useParams()
	const { data: uniform } = useSuspenseQuery(uniformQueryOptions(uniformId))
	// loader garante não-null (notFound() quando ausente); fallbacks mantêm a ordem dos hooks.
	const variants = uniform?.variants ?? []
	const [circulo, setCirculo] = useState(() => variants[0]?.circulo ?? "oficiais")
	const [genero, setGenero] = useState(() => variants[0]?.genero ?? "masculino")
	const [sub, setSub] = useState<string | null>(() => variants[0]?.sub_variacao ?? null)

	const circulos = useMemo(() => [...new Set(variants.map((v) => v.circulo))], [variants])
	const generos = useMemo(() => [...new Set(variants.filter((v) => v.circulo === circulo).map((v) => v.genero))], [variants, circulo])
	const subs = useMemo(
		() => [...new Set(variants.filter((v) => v.circulo === circulo && v.genero === genero).map((v) => v.sub_variacao))],
		[variants, circulo, genero]
	)

	const selected: UniformVariantWithPieces | undefined = useMemo(
		() =>
			variants.find((v) => v.circulo === circulo && v.genero === genero && v.sub_variacao === sub) ??
			variants.find((v) => v.circulo === circulo && v.genero === genero) ??
			variants.find((v) => v.circulo === circulo) ??
			variants[0],
		[variants, circulo, genero, sub]
	)

	const { data: imageUrl } = useQuery(signedImageQueryOptions(selected?.image_path))

	if (!uniform) return null

	return (
		<div className="flex flex-col gap-8">
			<Link to="/uniformes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
				<ArrowLeft className="size-4" aria-hidden="true" />
				Todos os uniformes
			</Link>

			<header className="flex flex-col gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="outline">{GRUPO_LABELS[uniform.grupo]}</Badge>
					{uniform.art_referencia && <Badge variant="ghost">{uniform.art_referencia}</Badge>}
				</div>
				<h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">{uniformTitle(uniform)}</h1>
				{uniform.traje && <p className="text-base text-muted-foreground">{uniform.traje}</p>}
			</header>

			<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-8">
				{/* Coluna esquerda: imagem + seletor de variante */}
				<div className="flex flex-col gap-4">
					<div className="aspect-[3/4] border border-border rounded-lg bg-muted/30 flex items-center justify-center overflow-hidden">
						{imageUrl ? (
							<img
								src={imageUrl}
								alt={`${uniformTitle(uniform)} — ${CIRCULO_LABELS[circulo]} ${GENERO_LABELS[genero]}`}
								className="h-full w-full object-contain"
							/>
						) : (
							<span className="text-sm text-muted-foreground px-6 text-center">
								{selected?.image_path ? "Carregando imagem…" : "Sem ilustração cadastrada"}
							</span>
						)}
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<VariantControl label="Círculo" value={circulo} onChange={setCirculo} options={circulos} render={(c) => CIRCULO_LABELS[c]} />
						<VariantControl label="Gênero" value={genero} onChange={setGenero} options={generos} render={(g) => GENERO_LABELS[g]} />
						{subs.length > 1 && (
							<div className="flex flex-col gap-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variação</span>
								<Select value={sub ?? "__null__"} onValueChange={(v) => setSub(v === "__null__" ? null : v)}>
									<SelectTrigger>
										<SelectValue>{SUB_LABEL(sub)}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{subs.map((s) => (
											<SelectItem key={s ?? "__null__"} value={s ?? "__null__"}>
												{SUB_LABEL(s)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				</div>

				{/* Coluna direita: categorias + composição + equivalências */}
				<div className="flex flex-col gap-6">
					{uniform.descricao_md && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{uniform.descricao_md}</p>}

					<section className="flex flex-col gap-2">
						<h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Categoria — quem pode usar</h2>
						<div className="flex flex-wrap gap-1.5">
							{uniform.categories.length === 0 ? (
								<span className="text-sm text-muted-foreground">Não especificado.</span>
							) : (
								uniform.categories.map((c) => (
									<Badge key={c.categoria} variant="secondary">
										{CATEGORIA_LABELS[c.categoria]}
									</Badge>
								))
							)}
						</div>
					</section>

					<section className="flex flex-col gap-3">
						<h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Composição</h2>
						{!selected || selected.pieces.length === 0 ? (
							<p className="text-sm text-muted-foreground">Sem peças cadastradas para esta variante.</p>
						) : (
							OBRIGATORIEDADE_ORDER.map((nivel) => {
								const itens = selected.pieces.filter((p) => p.obrigatoriedade === nivel)
								if (itens.length === 0) return null
								return (
									<div key={nivel} className="flex flex-col gap-1.5">
										<h3 className="text-sm font-semibold">{OBRIGATORIEDADE_LABELS[nivel]}</h3>
										<ul className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
											{itens.map((p) => (
												<li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2">
													<div className="flex flex-col gap-0.5">
														<span className="text-sm">{p.piece.nome}</span>
														{p.piece_item && <span className="text-xs font-medium text-foreground">{p.piece_item.nome}</span>}
														{p.observacao && <span className="text-xs text-muted-foreground">{p.observacao}</span>}
														{(p.restricao_posto?.length || p.restricao_quadro?.length) && (
															<span className="text-xs text-muted-foreground">
																Restrição: {[...(p.restricao_posto ?? []), ...(p.restricao_quadro ?? [])].join(", ")}
															</span>
														)}
													</div>
													<Badge variant="outline" className="shrink-0">
														{TIPO_PECA_LABELS[p.piece.tipo]}
													</Badge>
												</li>
											))}
										</ul>
									</div>
								)
							})
						)}
					</section>

					{(uniform.eq_mb || uniform.eq_eb || uniform.eq_civil) && (
						<section className="flex flex-col gap-2">
							<h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Equivalências</h2>
							<Card>
								<CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4">
									<Equivalence label="Marinha (MB)" value={uniform.eq_mb} />
									<Equivalence label="Exército (EB)" value={uniform.eq_eb} />
									<Equivalence label="Civil" value={uniform.eq_civil ? EQ_CIVIL_LABELS[uniform.eq_civil] : null} />
								</CardContent>
							</Card>
						</section>
					)}
				</div>
			</div>
		</div>
	)
}

function VariantControl<T extends string>({
	label,
	value,
	onChange,
	options,
	render,
}: {
	label: string
	value: T
	onChange: (v: T) => void
	options: T[]
	render: (v: T) => string
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
			<Select value={value} onValueChange={(v) => onChange(v as T)}>
				<SelectTrigger>
					<SelectValue>{render(value)}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o} value={o}>
							{render(o)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

function Equivalence({ label, value }: { label: string; value: string | null }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
			<span className="text-sm">{value ?? "—"}</span>
		</div>
	)
}
