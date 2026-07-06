import { createFileRoute } from "@tanstack/react-router"
import { ArrowDown } from "lucide-react"
import { UniformBrowser } from "@/components/uniforms/UniformBrowser"
import { UniformSearchBox } from "@/components/uniforms/UniformSearchBox"
import { uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { GRUPO_LABELS, GRUPO_ORDER } from "@/lib/uniforms/labels"
import { type UniformSearch, uniformSearchSchema } from "@/lib/uniforms/search"

export const Route = createFileRoute("/_public/")({
	validateSearch: uniformSearchSchema,
	loaderDeps: ({ search }) => ({ grupo: search.grupo, categoria: search.categoria }),
	loader: ({ context, deps }) => context.queryClient.ensureQueryData(uniformsQueryOptions(deps)),
	component: HomePage,
})

/** Rola suavemente até a lista completa de uniformes (âncora `#lista`). */
function scrollToList() {
	document.getElementById("lista")?.scrollIntoView({ behavior: "smooth" })
}

function HomePage() {
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const setSearch = (updater: (prev: UniformSearch) => UniformSearch) => navigate({ search: updater })

	function onSubmitSearch(q: string) {
		navigate({ search: (p) => ({ ...p, q: q || undefined }) })
		scrollToList()
	}

	function onSelectUniform(uniformId: string) {
		navigate({ to: "/uniformes/$uniformId", params: { uniformId } })
	}

	function pickGrupo(g: (typeof GRUPO_ORDER)[number]) {
		navigate({ search: (p) => ({ ...p, grupo: g }) })
		scrollToList()
	}

	return (
		<div className="flex flex-col">
			{/* CHAT — tela cheia (inclusive mobile): opções acima, campo de busca ao centro, seta para a lista */}
			<section className="relative -mt-8 flex min-h-[calc(100svh-3.75rem)] flex-col items-center justify-center md:-mt-10">
				{/* Textura de fundo full-bleed — grade técnica (adapta ao tema) */}
				<div className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden" aria-hidden="true">
					<div
						className="absolute inset-0 text-foreground/[0.055]"
						style={{
							backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
							backgroundSize: "46px 46px",
							maskImage: "radial-gradient(120% 92% at 50% 34%, #000 0%, transparent 72%)",
							WebkitMaskImage: "radial-gradient(120% 92% at 50% 34%, #000 0%, transparent 72%)",
						}}
					/>
					{/* Transição suave — dissolve o fim do hero na faixa da lista */}
					<div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-muted/25" />
				</div>

				<div className="flex w-full max-w-2xl flex-col items-center py-16 text-center">
					<span className="text-label inline-flex items-center gap-3 text-primary">
						<span className="h-0.5 w-6 rounded-full bg-gold" />
						Força Aérea Brasileira
						<span className="font-semibold tracking-normal text-muted-foreground">RCA 35-2/2023</span>
					</span>

					<h1 className="mt-5 text-4xl leading-[1.05] font-extrabold text-foreground sm:text-5xl">
						Qual <span className="underline decoration-gold decoration-4 underline-offset-[6px]">uniforme</span> você procura?
					</h1>

					<p className="mt-4 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
						Consulta oficial do RUMAER: a composição de cada peça e o porte correto, conforme o seu posto e círculo hierárquico.
					</p>

					{/* Opções de busca — atalhos por grupo, acima do campo */}
					<div className="mt-8 flex flex-wrap items-center justify-center gap-2">
						{GRUPO_ORDER.map((g) => (
							<button
								key={g}
								type="button"
								onClick={() => pickGrupo(g)}
								className="rounded-full border border-input bg-card px-3.5 py-1.5 text-sm font-medium text-foreground/80 shadow-xs transition-colors hover:border-gold hover:text-foreground"
							>
								{GRUPO_LABELS[g]}
							</button>
						))}
					</div>

					{/* Campo de busca — ação principal, com sugestões ao vivo */}
					<div className="mt-4 w-full">
						<UniformSearchBox initialQuery={search.q} onSubmitSearch={onSubmitSearch} onSelectUniform={onSelectUniform} />
					</div>
				</div>

				{/* Seta — leva à lista completa abaixo, na mesma página */}
				<button
					type="button"
					onClick={scrollToList}
					className="group absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-full px-3 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<span className="text-label text-[10px]">Todos os uniformes</span>
					<ArrowDown className="size-4 animate-nudge text-gold-2 motion-reduce:animate-none" aria-hidden="true" />
				</button>
			</section>

			{/* LISTA — full-bleed levemente destacada (a antiga tela /uniformes) */}
			<section id="lista" className="relative left-1/2 -mb-8 w-screen -translate-x-1/2 scroll-mt-15 bg-muted/25 md:-mb-10">
				<div className="mx-auto w-full px-4 py-12 sm:px-6 md:px-8 md:py-16 lg:max-w-[1100px] xl:max-w-[1180px]">
					<UniformBrowser search={search} setSearch={setSearch} />
				</div>
			</section>
		</div>
	)
}
