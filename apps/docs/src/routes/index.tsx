import { createFileRoute, Link } from "@tanstack/react-router"
import { HomeLayout } from "fumadocs-ui/layouts/home"
import { baseOptions } from "@/lib/layout.shared"

export const Route = createFileRoute("/")({
	component: Home,
})

const APPS = [
	{
		slug: "portal",
		title: "Portal IEFA",
		label: "Portal Web",
		description: "Portal web institucional — CMS (Sanity), drag-drop, edição markdown e gestão de publicações.",
		color: "text-blue-500",
		bg: "bg-blue-500/10",
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<rect width="16" height="20" x="4" y="2" rx="2" />
				<path d="M9 22v-4h6v4" />
				<path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
			</svg>
		),
	},
	{
		slug: "sifare",
		title: "SiFare",
		label: "Fardamento",
		description: "Sistema de Fardamento Reembolsável — gestão de itens de vestuário e fardamento militar.",
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
				<circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
			</svg>
		),
	},
	{
		slug: "sisub",
		title: "Sisub",
		label: "Subsistência",
		description: "Sistema de Subsistência — cardápios, receitas, planejamento e analytics de rancho.",
		color: "text-orange-500",
		bg: "bg-orange-500/10",
		icon: (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
				<path d="M7 2v20" />
				<path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
			</svg>
		),
	},
] as const

function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<div className="relative flex flex-col w-full text-fd-foreground">
				{/* ── Hero ────────────────────────────────────────────────────────────── */}
				<section aria-label="Apresentação do IEFA Docs" className="relative w-full min-h-[calc(100dvh-3.5rem)] flex flex-col items-center justify-between">
					{/* Conteúdo central */}
					<div className="flex-1 flex flex-col items-center justify-center text-center gap-8 px-4 py-16">
						<p className="text-xs font-medium tracking-[0.2em] uppercase text-fd-muted-foreground">Documentação Interna</p>

						<h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-fd-foreground">IEFA Docs</h1>

						<div className="flex flex-col items-center gap-2">
							<p className="text-base sm:text-lg font-semibold tracking-widest text-fd-foreground uppercase">Capacitar · Pesquisar · Inovar</p>
							<p className="max-w-sm text-sm sm:text-base text-fd-muted-foreground leading-relaxed">
								Documentação da suite de aplicações internas do Instituto de Economia, Finanças e Administração da Aeronáutica.
							</p>
						</div>

						<div className="flex flex-wrap gap-3 justify-center items-center pt-2">
							<Link
								to="/docs/$"
								params={{ _splat: "portal" }}
								className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
							>
								Explorar Docs
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M5 12h14M12 5l7 7-7 7" />
								</svg>
							</Link>
							<Link
								to="/docs/$"
								params={{ _splat: "" }}
								className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-fd-border bg-fd-card text-fd-foreground font-medium text-sm hover:bg-fd-muted transition-colors cursor-pointer"
							>
								Visão geral
							</Link>
						</div>
					</div>

					{/* Indicador de scroll */}
					<div className="pb-8 flex flex-col items-center gap-2 text-fd-muted-foreground/50 select-none" aria-hidden="true">
						<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="animate-bounce"
							aria-hidden="true"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</div>
				</section>

				{/* ── Sistemas ────────────────────────────────────────────────────────── */}
				<section id="sistemas" aria-labelledby="sistemas-heading" className="py-24 px-4">
					<div className="max-w-4xl mx-auto">
						<div className="mb-12 text-center">
							<h2 id="sistemas-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
								Sistemas
							</h2>
							<p className="text-fd-muted-foreground mt-3 text-sm sm:text-base">Navegue pela documentação de cada sistema da suite IEFA.</p>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
							{APPS.map(({ slug, title, label, description, color, bg, icon }) => (
								<Link
									key={slug}
									to="/docs/$"
									params={{ _splat: slug }}
									className="group flex flex-col gap-4 p-5 rounded-xl border border-fd-border bg-fd-card hover:bg-fd-muted transition-colors cursor-pointer"
								>
									<div className={`flex items-center justify-center w-10 h-10 rounded-lg ${bg} ${color}`}>{icon}</div>
									<div>
										<span className={`text-xs font-medium tracking-wide uppercase ${color}`}>{label}</span>
										<h3 className="text-base font-semibold mt-0.5 text-fd-foreground">{title}</h3>
										<p className="mt-1.5 text-sm text-fd-muted-foreground leading-relaxed">{description}</p>
									</div>
									<div className={`mt-auto inline-flex items-center gap-1.5 text-sm font-medium ${color}`}>
										Explorar
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2.5"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
											className="transition-transform group-hover:translate-x-0.5"
										>
											<path d="M5 12h14M12 5l7 7-7 7" />
										</svg>
									</div>
								</Link>
							))}
						</div>
					</div>
				</section>
			</div>
		</HomeLayout>
	)
}
