import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "iconoir-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GRUPO_DESCRIPTIONS, GRUPO_LABELS, GRUPO_ORDER } from "@/lib/uniforms/labels"

export const Route = createFileRoute("/_public/")({
	component: LandingPage,
})

function LandingPage() {
	return (
		<div className="flex flex-col gap-12">
			<section className="flex flex-col gap-4 max-w-3xl">
				<p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Força Aérea Brasileira · RUMAER</p>
				<h1 className="font-serif text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05]">Regulamento de Uniformes da Aeronáutica</h1>
				<p className="text-base text-muted-foreground leading-relaxed">
					Navegue os uniformes da FAB de forma interativa: veja para quem cada um serve, a composição peça a peça com sua obrigatoriedade, alterne entre
					variantes por círculo hierárquico e gênero, e consulte as equivalências com Marinha, Exército e trajes civis.
				</p>
				<div>
					<Link
						to="/uniformes"
						className="inline-flex items-center gap-2 border border-foreground bg-foreground px-4 py-2.5 text-sm font-medium uppercase tracking-wide text-background transition-colors hover:bg-foreground/90"
					>
						Ver todos os uniformes
						<ArrowRight className="size-4" aria-hidden="true" />
					</Link>
				</div>
			</section>

			<section className="flex flex-col gap-5">
				<h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Grupos de uniformes</h2>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{GRUPO_ORDER.map((grupo) => (
						<Link key={grupo} to="/uniformes" search={{ grupo }} className="group">
							<Card className="h-full transition-shadow group-hover:shadow-[4px_4px_0_0_var(--foreground)]">
								<CardHeader>
									<CardTitle className="flex items-center justify-between gap-2">
										{GRUPO_LABELS[grupo]}
										<ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
									</CardTitle>
									<CardDescription>{GRUPO_DESCRIPTIONS[grupo]}</CardDescription>
								</CardHeader>
								<CardContent />
							</Card>
						</Link>
					))}
				</div>
			</section>
		</div>
	)
}
