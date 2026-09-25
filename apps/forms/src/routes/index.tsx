import { createFileRoute, Link } from "@tanstack/react-router"
import { ClipboardCheck, Lock, NavArrowDown, SendDiagonal, StatsReport } from "iconoir-react"
import { lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { env } from "@/env"
import { useTenant } from "@/lib/tenant"

const CincoSLanding = lazy(() => import("@/components/cinco-s/Landing").then((m) => ({ default: m.CincoSLanding })))

export const Route = createFileRoute("/")({
	component: IndexPage,
	head: () => ({
		meta:
			env.VITE_APP_TENANT === "cinco-s"
				? [{ title: "Programa VETOR 5S — SEFA" }, { name: "description", content: "Programa VETOR 5S — Melhoria Contínua — SEFA/FAB" }]
				: [
						{ title: "Formulários IEFA" },
						{
							name: "description",
							content: "Sistema de questionários internos do Instituto de Economia, Finanças e Administração da Aeronáutica",
						},
					],
	}),
})

const FEATURES = [
	{
		icon: ClipboardCheck,
		title: "Questionários",
		description: "Crie questionários estruturados com múltiplos tipos de pergunta — texto, escolha única, múltipla escolha, escala, booleano e mais.",
	},
	{
		icon: SendDiagonal,
		title: "Coleta",
		description: "Publique e distribua para usuários @fab.mil.br. Respostas são salvas automaticamente — sem risco de perder dados.",
	},
	{
		icon: StatsReport,
		title: "Análise",
		description: "Visualize todas as respostas recebidas em um painel consolidado. Cada resposta inclui observações opcionais dos respondentes.",
	},
]

function IndexPage() {
	const { id } = useTenant()

	if (id === "cinco-s") {
		return (
			<Suspense>
				<CincoSLanding />
			</Suspense>
		)
	}

	return <FormsHome />
}

function FormsHome() {
	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero ─────────────────────────────────────────────────────────── */}
			<section
				aria-label="Apresentação do sistema de Formulários IEFA"
				className="relative w-full min-h-[calc(100dvh-2rem)] flex flex-col items-center justify-between px-4"
			>
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-8 py-12">
					<p className="text-label text-muted-foreground">Força Aérea Brasileira · IEFA</p>

					<h1 className="text-hero text-balance">Formulários</h1>

					<div className="flex flex-col items-center gap-3">
						<p className="text-lg sm:text-xl font-semibold tracking-widest text-foreground uppercase">Questionários · Pesquisas · Coleta</p>
						<p className="max-w-xs sm:max-w-sm text-sm sm:text-base text-muted-foreground leading-relaxed">
							Sistema de questionários internos para coleta estruturada de dados a serviço do COMAER.
						</p>
					</div>

					<div className="flex flex-wrap gap-3 justify-center items-center pt-2">
						<Button nativeButton={false} render={<Link to="/auth">Entrar</Link>} size="lg" variant="default" />
						<Button
							nativeButton={false}
							render={
								<Link to="/auth" search={{ tab: "register" }}>
									Criar conta
								</Link>
							}
							size="lg"
							variant="secondary"
						/>
					</div>
				</div>

				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Funcionalidades ──────────────────────────────────────────────── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28 max-w-4xl mx-auto px-4 sm:px-6">
				<section aria-labelledby="features-heading">
					<div className="text-center mb-10">
						<h2 id="features-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
							Como funciona
						</h2>
						<p className="text-muted-foreground mt-3 text-pretty max-w-2xl mx-auto text-sm sm:text-base">
							Crie, publique e analise questionários — tudo em um único sistema integrado ao ecossistema IEFA.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{FEATURES.map(({ icon: Icon, title, description }) => (
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
				</section>

				{/* ─── Acesso ──────────────────────────────────────────────────────── */}
				<section aria-labelledby="access-heading">
					<Separator className="mb-12 md:mb-14" />

					<div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center">
						<div className="rounded-lg bg-primary/10 p-4 shrink-0">
							<Lock className="h-7 w-7 text-primary" aria-hidden="true" />
						</div>

						<div className="flex-1">
							<h2 id="access-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
								Acesso restrito
							</h2>
							<p className="mt-3 text-muted-foreground text-sm sm:text-base text-pretty max-w-2xl leading-relaxed">
								O sistema é exclusivo para usuários com email institucional @fab.mil.br. Crie sua conta ou entre com suas credenciais para acessar o painel de
								questionários.
							</p>
						</div>

						<Button nativeButton={false} render={<Link to="/auth">Acessar</Link>} variant="default" className="shrink-0" />
					</div>
				</section>

				{/* ─── Footer ──────────────────────────────────────────────────────── */}
				<footer className="border-t border-border pt-8 pb-12">
					<div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
						<span>© {new Date().getFullYear()} IEFA — Instituto de Economia, Finanças e Administração</span>
						<span>Desenvolvido por Ten Nanni (IEFA)</span>
					</div>
				</footer>
			</div>
		</div>
	)
}
