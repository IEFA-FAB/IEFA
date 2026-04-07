import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Building, Flask, GraduationCap, NavArrowDown, NavArrowRight, OpenBook } from "iconoir-react"
import { AppCard } from "@/components/AppCard"
import { DynamicIcon } from "@/components/dynamicIcon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useAppsData } from "@/hooks/useAppsData"
import type { AppItem } from "@/types/domain"

export const Route = createFileRoute("/_public/")({
	staticData: {
		nav: {
			title: "Início",
			section: "Portal",
			subtitle: "Página inicial do Portal IEFA",
			keywords: ["home", "portal", "iefa", "institucional"],
			order: 0,
		},
	},
	component: Home,
	head: () => ({
		meta: [
			{ title: "Portal IEFA" },
			{
				name: "description",
				content: "Portal do Instituto de Economia, Finanças e Administração da Aeronáutica",
			},
		],
	}),
})

const PILLARS = [
	{
		icon: GraduationCap,
		title: "Ensino",
		description:
			"Capacitação de gestores e agentes da administração do COMAER por meio de cursos presenciais, estágios, treinamentos e plataforma EaD própria.",
	},
	{
		icon: Flask,
		title: "Pesquisa & Inovação",
		description:
			"Instituição Científica, Tecnológica e de Inovação reconhecida pelo DCTA, fomentando a produção científica e parcerias estratégicas na Aeronáutica.",
	},
	{
		icon: Building,
		title: "Gestão",
		description:
			"Suporte técnico à SEFA e seus sistemas corporativos, assessoria a militares e civis, e fortalecimento do desenvolvimento sustentável da Força Aérea.",
	},
]

function SkeletonGrid() {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
			<div className="h-40 animate-pulse rounded-xl bg-muted" />
			<div className="h-40 animate-pulse rounded-xl bg-muted" />
		</div>
	)
}

function AppGrid({ list }: { list: AppItem[] }) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
			{list.map((app) => (
				<AppCard key={app.title} app={app} />
			))}
		</div>
	)
}

function Home() {
	const { data, isLoading, error } = useAppsData(50)

	const apps: AppItem[] = (data ?? []).map((a) => ({
		title: a.title,
		description: a.description,
		to: a.to_path ?? undefined,
		href: a.href ?? undefined,
		icon: <DynamicIcon name={a.icon_key ?? undefined} className="h-5 w-5" />,
		badges: a.badges ?? [],
		external: !!a.external,
		contributors: (a.contributors ?? []).map((c) => ({
			label: c.label,
			url: c.url ?? undefined,
			icon: c.icon_key ? <DynamicIcon name={c.icon_key} className="h-4 w-4" /> : undefined,
		})),
	}))

	const suiteApps = apps.filter((a) => !a.external).slice(0, 4)
	const partnerApps = apps.filter((a) => a.external).slice(0, 4)

	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero — ocupa toda a primeira tela ─────────────────────────────────── */}
			{/*
			 * min-h calcula: 100dvh menos o header (h-14 = 3.5rem)
			 * menos o py-8 do container (2rem mobile / 2.5rem md).
			 */}
			<section
				aria-label="Apresentação do Portal IEFA"
				className="relative w-full
          min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-2.5rem)]
          flex flex-col items-center justify-between"
			>
				{/* Conteúdo central */}
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-8 px-4 py-12">
					{/* Label institucional — acima do título */}
					<p className="text-label text-muted-foreground">Economia · Finanças · Administração</p>

					{/* Título principal — usa a utility .text-hero do design system */}
					<h1 className="text-hero text-balance">Portal IEFA</h1>

					{/* Slogan + descrição — agrupados, distantes dos botões */}
					<div className="flex flex-col items-center gap-3">
						<p className="text-lg sm:text-xl font-semibold tracking-widest text-foreground uppercase">Capacitar · Pesquisar · Inovar</p>
						<p className="max-w-xs sm:max-w-sm text-sm sm:text-base text-muted-foreground leading-relaxed">
							Conhecimento e inovação a serviço da gestão pública.
						</p>
					</div>

					<div className="flex flex-wrap gap-3 justify-center items-center pt-2">
						<Button
							render={
								<Link to="/facilities" aria-label="Ver todas as facilidades e aplicações">
									Ver facilidades
								</Link>
							}
							size="lg"
							variant="default"
						/>
						<Button
							render={
								<Link to="/journal" aria-label="Acessar Sistema de Gestão de Publicações">
									Publicações
								</Link>
							}
							size="lg"
							variant="secondary"
						/>
					</div>
				</div>

				{/* Indicador de scroll */}
				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Seções de conteúdo — com espaçamento aumentado entre cada bloco ─── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28">
				{/* ── O Instituto ───────────────────────────────────────────────────── */}
				<section aria-labelledby="instituto-heading">
					<div className="text-center mb-10">
						<h2 id="instituto-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
							O Instituto
						</h2>
						<p className="text-muted-foreground mt-3 text-pretty max-w-2xl mx-auto text-sm sm:text-base">
							Criado em outubro de 2023 e ativado em janeiro de 2024, o IEFA é subordinado à SEFA e sediado no Rio de Janeiro — RJ. Em seu primeiro ano,
							capacitou mais de <strong>850 militares</strong> em <strong>10 cursos</strong> e foi reconhecido como{" "}
							<strong>Instituição Científica, Tecnológica e de Inovação (ICT)</strong> pelo DCTA.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{PILLARS.map(({ icon: Icon, title, description }) => (
							<Card key={title} className="border border-border bg-card/60">
								<CardContent className="pt-6 flex flex-col gap-3">
									<div className="flex items-center gap-3">
										<div className="rounded-lg bg-primary/10 p-2.5">
											<Icon className="h-5 w-5 text-primary" aria-hidden="true" />
										</div>
										<h3 className="font-semibold text-base">{title}</h3>
									</div>
									<p className="text-sm text-muted-foreground text-pretty leading-relaxed">{description}</p>
								</CardContent>
							</Card>
						))}
					</div>

					<div className="mt-8 flex justify-center">
						<Button
							render={
								<Link to="/about" className="inline-flex items-center gap-2">
									Conheça o Instituto
									<ArrowRight className="h-4 w-4" aria-hidden="true" />
								</Link>
							}
							variant="outline"
						/>
					</div>
				</section>

				{/* ── Nossa Suite ───────────────────────────────────────────────────── */}
				<section id="suite" aria-labelledby="suite-heading">
					<div className="flex items-end justify-between mb-1">
						<div>
							<h2 id="suite-heading" className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
								Nossa suite
							</h2>
							<p className="text-muted-foreground mt-2 text-pretty">Ferramentas e sistemas desenvolvidos e mantidos pelo IEFA.</p>
						</div>
						<Link
							to="/facilities"
							className="hidden sm:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors pb-0.5"
							aria-label="Ver todas as facilidades"
						>
							Ver todas <NavArrowRight className="h-4 w-4" aria-hidden="true" />
						</Link>
					</div>

					<Separator className="my-6" />

					{isLoading ? (
						<SkeletonGrid />
					) : error ? (
						<p className="text-sm text-destructive">Erro ao carregar apps: {error instanceof Error ? error.message : "Erro desconhecido"}</p>
					) : suiteApps.length > 0 ? (
						<AppGrid list={suiteApps} />
					) : null}

					<div className="mt-6 flex sm:hidden justify-center">
						<Button render={<Link to="/facilities">Ver todas</Link>} variant="outline" size="sm" />
					</div>
				</section>

				{/* ── Parceiros & Serviços ──────────────────────────────────────────── */}
				{(isLoading || partnerApps.length > 0) && (
					<section id="parceiros" aria-labelledby="parceiros-heading">
						<div className="flex items-end justify-between mb-1">
							<div>
								<h2 id="parceiros-heading" className="text-2xl md:text-3xl font-bold tracking-tight text-balance">
									Parceiros & Serviços
								</h2>
								<p className="text-muted-foreground mt-2 text-pretty">Plataformas e serviços externos integrados ao ecossistema do IEFA.</p>
							</div>
							<Link
								to="/facilities"
								className="hidden sm:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors pb-0.5"
								aria-label="Ver todas as facilidades"
							>
								Ver todas <NavArrowRight className="h-4 w-4" aria-hidden="true" />
							</Link>
						</div>

						<Separator className="my-6" />

						{isLoading ? <SkeletonGrid /> : <AppGrid list={partnerApps} />}
					</section>
				)}

				{/* ── Publicações ───────────────────────────────────────────────────── */}
				<section id="publicacoes" aria-labelledby="publicacoes-heading">
					<Separator className="mb-12 md:mb-14" />

					<div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center">
						<div className="rounded-xl bg-primary/10 p-4 shrink-0">
							<OpenBook className="h-7 w-7 text-primary" aria-hidden="true" />
						</div>

						<div className="flex-1">
							<h2 id="publicacoes-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
								Sistema de Gestão de Publicações
							</h2>
							<p className="mt-3 text-muted-foreground text-sm sm:text-base text-pretty max-w-2xl leading-relaxed">
								Submeta artigos, acompanhe o fluxo de revisão e acesse as publicações científicas do IEFA. Um sistema editorial completo — da submissão à
								publicação — integrado à missão de pesquisa e disseminação do conhecimento do Instituto.
							</p>
						</div>

						<Button render={<Link to="/journal">Acessar</Link>} variant="default" className="shrink-0" />
					</div>
				</section>
			</div>
			{/* fim das seções */}
		</div>
	)
}
