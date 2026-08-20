import type { UniformVariantWithPieces } from "@iefa/database/rumaer"
import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { type ReactNode, useId, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { signedImageQueryOptions, uniformQueryOptions } from "@/lib/uniforms/hooks"
import {
	CATEGORIA_LABELS,
	CIRCULO_LABELS,
	CIRCULO_ORDER,
	EQ_CIVIL_LABELS,
	formatPieceName,
	GENERO_LABELS,
	GENERO_ORDER,
	GRUPO_LABELS,
	OBRIGATORIEDADE_LABELS,
	OBRIGATORIEDADE_ORDER,
	TIPO_PECA_LABELS,
	uniformTitle,
} from "@/lib/uniforms/labels"
import { type UniformView, uniformViewSchema } from "@/lib/uniforms/search"
import { resolveVariantSelection } from "@/lib/uniforms/variants"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_public/uniformes/$uniformId/")({
	validateSearch: uniformViewSchema,
	loader: async ({ context, params }) => {
		const uniform = await context.queryClient.ensureQueryData(uniformQueryOptions(params.uniformId))
		if (!uniform) throw notFound()
	},
	component: DetailPage,
})

const SUB_LABEL = (sub: string | null) => (sub == null ? "Padrão" : sub === "gestante" ? "Gestante" : sub === "tropa_montada" ? "Tropa montada" : sub)

function DetailPage() {
	const { uniformId } = Route.useParams()
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const looksName = useId()
	const { data: uniform } = useSuspenseQuery(uniformQueryOptions(uniformId))
	// loader garante não-null (notFound() quando ausente); o fallback mantém a ordem dos hooks.
	const variants = useMemo(() => uniform?.variants ?? [], [uniform])

	// A seleção mora na URL, não em estado local: é ela que se compartilha. O que a
	// URL não disser cai no padrão do catálogo (oficiais, masculino) — ver
	// `resolveVariantSelection`, que também absorve link com valor que este
	// uniforme não tem em vez de quebrar a tela.
	const { circulo, genero, sub, variant } = useMemo(
		() => resolveVariantSelection(variants, { circulo: search.circulo, genero: search.genero, sub: search.sub }),
		[variants, search.circulo, search.genero, search.sub]
	)
	const selected: UniformVariantWithPieces | undefined = variant

	const circulos = useMemo(() => CIRCULO_ORDER.filter((c) => variants.some((v) => v.circulo === c)), [variants])
	const generos = useMemo(() => GENERO_ORDER.filter((g) => variants.some((v) => v.circulo === circulo && v.genero === g)), [variants, circulo])
	const subs = useMemo(
		() => [...new Set(variants.filter((v) => v.circulo === circulo && v.genero === genero).map((v) => v.sub_variacao))],
		[variants, circulo, genero]
	)

	/**
	 * Grava a escolha na URL. `replace` porque cada clique num seletor não é um
	 * passo de navegação — voltar tem que sair da tela, não desfazer o último chip.
	 * A sub-variação é limpa junto: ela só existe dentro de um par círculo+gênero.
	 */
	function setView(patch: Partial<UniformView>, resetSub = false) {
		navigate({ search: (p) => ({ ...p, ...(resetSub ? { sub: undefined } : {}), ...patch }), replace: true })
	}

	// "look" = imagem alternativa atrelada a uma peça facultativa/eventual (ausente = imagem base).
	// A chave é a peça (não a imagem): ela sobrevive à troca de círculo/gênero, e some
	// sozinha quando a variante nova não tem aquela alternativa.
	const looks = selected?.images ?? []
	const activeLook = search.look ? looks.find((l) => l.piece_id === search.look) : undefined
	const { data: imageUrl } = useQuery(signedImageQueryOptions(activeLook?.image_path ?? selected?.image_path))

	if (!uniform) return null

	const title = uniformTitle(uniform)
	const versionLabel = `${CIRCULO_LABELS[circulo]} · ${GENERO_LABELS[genero]}${sub ? ` · ${SUB_LABEL(sub)}` : ""}`

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
				<h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
				{uniform.traje && <p className="text-base text-muted-foreground">{uniform.traje}</p>}
			</header>

			{/* Seletor de versão — acima da imagem e em destaque: é o controle que mais
			    muda o que a tela mostra, e antes ficava escondido embaixo dela. */}
			{selected && (
				<section aria-label="Versão do uniforme" className="rounded-xl border border-border bg-card px-4 py-4 shadow-xs sm:px-5">
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						<VariantChoice
							label="Círculo hierárquico"
							value={circulo}
							options={circulos}
							render={(c) => CIRCULO_LABELS[c]}
							onChange={(c) => setView({ circulo: c }, true)}
						/>
						<VariantChoice label="Gênero" value={genero} options={generos} render={(g) => GENERO_LABELS[g]} onChange={(g) => setView({ genero: g }, true)} />
						{subs.length > 1 && (
							<VariantChoice
								label="Variação"
								value={sub}
								options={subs}
								render={SUB_LABEL}
								keyOf={(s) => s ?? "__null__"}
								onChange={(s) => setView({ sub: s ?? undefined })}
							/>
						)}
					</div>
				</section>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-8">
				{/* Coluna esquerda: imagem da versão selecionada */}
				<div className="flex flex-col gap-4">
					<figure className="flex flex-col gap-2">
						<div className="aspect-[3/4] border border-border rounded-lg bg-muted/30 flex items-center justify-center overflow-hidden">
							{imageUrl ? (
								<img src={imageUrl} alt={`${title} — ${versionLabel}`} className="h-full w-full object-contain" />
							) : (
								<span className="text-sm text-muted-foreground px-6 text-center">
									{(activeLook?.image_path ?? selected?.image_path) ? "Carregando imagem…" : "Sem ilustração cadastrada"}
								</span>
							)}
						</div>
						<figcaption className="text-xs text-muted-foreground">{versionLabel}</figcaption>
					</figure>

					{looks.length > 0 && (
						<ChipGroup label="Configuração">
							<ChoiceChip name={looksName} selected={!activeLook} onSelect={() => setView({ look: undefined })}>
								Padrão
							</ChoiceChip>
							{looks.map((l) => (
								<ChoiceChip key={l.id} name={looksName} selected={activeLook?.id === l.id} onSelect={() => setView({ look: l.piece_id })}>
									{l.legenda ?? "Variação"}
								</ChoiceChip>
							))}
						</ChipGroup>
					)}
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
														<span className="text-sm">{formatPieceName(p.piece.nome)}</span>
														{p.piece_item && <span className="text-xs font-medium text-foreground">{p.piece_item.nome}</span>}
														{p.observacao && <span className="text-xs text-muted-foreground">{p.observacao}</span>}
														{(p.restricao_posto?.length || p.restricao_quadro?.length) && (
															<span className="text-xs text-muted-foreground">
																Restrição: {[...(p.restricao_posto ?? []), ...(p.restricao_quadro ?? [])].join(", ")}
															</span>
														)}
													</div>
													{p.piece.tipo && (
														<Badge variant="outline" className="shrink-0">
															{TIPO_PECA_LABELS[p.piece.tipo]}
														</Badge>
													)}
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

/**
 * Grupo de opções da versão do uniforme. Chips em vez de `<select>`: as opções
 * ficam todas à vista, e o que está ativo se lê sem abrir nada.
 */
function VariantChoice<T extends string | null>({
	label,
	value,
	options,
	render,
	onChange,
	keyOf,
}: {
	label: string
	value: T
	options: readonly T[]
	render: (v: T) => string
	onChange: (v: T) => void
	keyOf?: (v: T) => string
}) {
	const name = useId()
	const key = keyOf ?? ((v: T) => String(v))

	return (
		<ChipGroup label={label}>
			{options.map((o) => (
				<ChoiceChip key={key(o)} name={name} selected={o === value} onSelect={() => onChange(o)}>
					{render(o)}
				</ChoiceChip>
			))}
		</ChipGroup>
	)
}

/** Grupo de escolha única. `fieldset`/`legend` dão a semântica sem uma linha de ARIA. */
function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
	return (
		<fieldset className="flex min-w-0 flex-col">
			<legend className="text-label mb-2 text-muted-foreground">{label}</legend>
			<div className="flex flex-wrap gap-1.5">{children}</div>
		</fieldset>
	)
}

/**
 * Chip de escolha única — mesmo visual para versão e configuração.
 * Por baixo é um `input[type=radio]`: navegação por seta e leitura de tela saem
 * de graça, coisa que um `<button aria-checked>` só imita.
 */
function ChoiceChip({ name, selected, onSelect, children }: { name: string; selected: boolean; onSelect: () => void; children: ReactNode }) {
	return (
		<label
			className={cn(
				"cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40",
				selected
					? "border-primary bg-primary text-primary-foreground shadow-xs"
					: "border-input bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
			)}
		>
			<input type="radio" name={name} checked={selected} onChange={onSelect} className="sr-only" />
			{children}
		</label>
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
