// Routing
import { createFileRoute, Link } from "@tanstack/react-router"
// Icons
import {
	BarChart3,
	Bell,
	BookOpen,
	Cake,
	Calendar,
	ChevronRight,
	ChevronsDown,
	ClipboardCheck,
	Clock,
	Coffee,
	FileText,
	Pizza,
	QrCode,
	Settings,
	ShieldCheck,
	Users,
	UtensilsCrossed,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoPanel } from "@/components/ui/info-panel"
import { SectionLabel } from "@/components/ui/section-label"
import type { MealType } from "@/types/domain/meal"
import type { Feature, Step } from "@/types/ui"

/* ========================================================================
   DATA
   ======================================================================== */

export const steps: Step[] = [
	{
		icon: ShieldCheck,
		title: "Faça Login",
		description: "Acesse com suas credenciais militares de forma segura.",
	},
	{
		icon: Calendar,
		title: "Selecione os Dias",
		description: "Visualize os próximos 30 dias e marque as refeições que irá consumir.",
	},
	{
		icon: ClipboardCheck,
		title: "Confirmação Automática",
		description: "Suas seleções são salvas automaticamente, auxiliando na previsão de demanda do rancho.",
	},
]

export const mealTypes: MealType[] = [
	{ icon: Coffee, label: "Café da Manhã", time: "06:00 — 08:00", color: "amber" },
	{ icon: UtensilsCrossed, label: "Almoço", time: "11:30 — 13:30", color: "blue" },
	{ icon: Pizza, label: "Janta", time: "18:00 — 20:00", color: "orange" },
	{ icon: Cake, label: "Ceia", time: "21:00 — 22:00", color: "purple" },
]

export const features: Feature[] = [
	{
		icon: BarChart3,
		title: "Planejamento de 30 dias",
		description: "Visualize e planeje refeições para os próximos 30 dias.",
	},
	{
		icon: QrCode,
		title: "4 tipos de refeição",
		description: "Café da manhã, almoço, janta e ceia — marque o que irá consumir.",
	},
	{
		icon: Users,
		title: "Por Organização Militar",
		description: "Controle organizado por OM para gestão eficiente do rancho.",
	},
	{
		icon: Bell,
		title: "Interface responsiva",
		description: "Acesse de computador, tablet ou smartphone.",
	},
	{
		icon: ShieldCheck,
		title: "Seguro e confiável",
		description: "Autenticação protegida com dados seguros.",
	},
	{
		icon: Settings,
		title: "Controle de demanda",
		description: "Auxilia a administração a prever demanda e reduzir desperdício.",
	},
]

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

export const Route = createFileRoute("/_public/")({
	head: () => ({
		meta: [
			{ title: "SISUB - Sistema de Subsistência" },
			{
				name: "description",
				content: "Sistema inteligente para previsão de demanda do rancho. Planeje suas refeições, reduza desperdícios e otimize a gestão alimentar.",
			},
		],
	}),
	component: Home,
})

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */

function Home() {
	return (
		<div className="w-full">
			{/* Hero */}
			<section className="min-h-[calc(100svh-5.5rem)] md:min-h-[calc(100svh-6rem)] flex flex-col justify-between pb-6 pt-2 animate-fade-slide-in">
				<div className="flex-1 flex flex-col justify-start md:justify-center max-w-3xl">
					<p className="font-mono text-xs text-muted-foreground/60 tracking-[0.2em] uppercase mb-6 md:mb-8">Sistema de Subsistência · Força Aérea Brasileira</p>
					<h1 className="text-6xl md:text-7xl lg:text-[6rem] xl:text-[7rem] font-bold tracking-tight leading-[0.95] text-foreground mb-8 md:mb-10">
						Planeje
						<br />
						<span className="text-primary">seu rancho.</span>
					</h1>
					<p className="text-muted-foreground text-base md:text-xl leading-relaxed mb-10 md:mb-12 max-w-sm md:max-w-md">
						Preveja demanda, reduza desperdício e gerencie refeições por OM.
					</p>
					<div className="flex flex-wrap items-center gap-4 md:gap-6">
						<Button
							nativeButton={false}
							render={
								<Link to="/auth" className="flex items-center gap-2">
									Acessar Sistema
									<ChevronRight className="h-4 w-4" />
								</Link>
							}
							size="lg"
						/>
						<span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
							<ShieldCheck className="h-3.5 w-3.5" aria-hidden />
							Login obrigatório
						</span>
					</div>
				</div>
				<div className="flex justify-center pb-2" aria-hidden>
					<ChevronsDown className="h-5 w-5 text-muted-foreground/40 animate-bounce" />
				</div>
			</section>

			{/* Como Funciona */}
			<section id="steps" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="01" label="Como funciona" />
				<div className="mt-8 divide-y divide-border">
					{steps.map((step, i) => {
						const Icon = step.icon
						return (
							<div key={step.title} className="flex items-start gap-5 py-5 stagger-item">
								<span className="font-mono text-3xl font-bold text-border tabular-nums leading-none min-w-[2.5rem]">{String(i + 1).padStart(2, "0")}</span>
								<div className="pt-0.5">
									<div className="flex items-center gap-2 mb-1">
										<Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
										<h3 className="font-bold text-sm text-foreground">{step.title}</h3>
									</div>
									<p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
								</div>
							</div>
						)
					})}
				</div>
			</section>

			{/* Refeições */}
			<section id="meals" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="02" label="Refeições disponíveis" />
				<div className="mt-8 border border-border rounded-md overflow-hidden divide-y divide-border">
					{mealTypes.map((meal) => {
						const Icon = meal.icon
						return (
							<div key={meal.label} className="flex items-center justify-between px-5 py-4 bg-card hover:bg-muted/40 transition-colors">
								<div className="flex items-center gap-3">
									<Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
									<span className="font-semibold text-sm text-foreground">{meal.label}</span>
								</div>
								<Badge variant="outline" className="font-mono tabular-nums">
									{meal.time}
								</Badge>
							</div>
						)
					})}
				</div>
			</section>

			{/* Funcionalidades */}
			<section id="features" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="03" label="Funcionalidades" />
				<div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{features.map((feature) => {
						const Icon = feature.icon
						return (
							<Card key={feature.title} className="rounded-md ring-0 border border-border hover:bg-muted/40 transition-colors cursor-default">
								<CardHeader className="pb-0">
									<div className="flex items-center gap-2">
										<Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
										<CardTitle className="text-sm font-bold">{feature.title}</CardTitle>
									</div>
								</CardHeader>
								<CardContent>
									<p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
								</CardContent>
							</Card>
						)
					})}
				</div>
			</section>

			{/* Tutorial + Changelog */}
			<section id="learn" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="04" label="Saiba mais" />
				<div className="mt-8 grid md:grid-cols-2 gap-4">
					<InfoPanel
						icon={BookOpen}
						label="Tutorial"
						title="Guia do SISUB"
						description="Aprenda passo a passo a preencher previsões e a fiscalizar com QR no SISUB."
						tags={["usuário", "fiscal", "passo a passo"]}
						to="/tutorial"
						cta="Ver Tutorial"
					/>
					<InfoPanel
						icon={FileText}
						label="Novidades"
						title="Changelog"
						description="Acompanhe as melhorias, correções e novas funcionalidades em tempo real."
						tags={["feat", "fix", "docs", "perf"]}
						to="/changelog"
						cta="Ver Changelog"
					/>
				</div>
			</section>

			{/* CTA Final */}
			<section id="cta" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="05" label="Acesso" />
				<div className="mt-8 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
					<h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
						Pronto para
						<br />
						começar?
					</h2>
					<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
						<Button
							nativeButton={false}
							render={
								<Link to="/auth" className="flex items-center gap-2">
									Fazer Login
									<ChevronRight className="h-4 w-4" />
								</Link>
							}
						/>
						<div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
							<span className="flex items-center gap-1.5">
								<Users className="h-3.5 w-3.5" aria-hidden />
								Colaborativo
							</span>
							<span className="flex items-center gap-1.5">
								<Clock className="h-3.5 w-3.5" aria-hidden />
								24/7
							</span>
							<span className="flex items-center gap-1.5">
								<ShieldCheck className="h-3.5 w-3.5" aria-hidden />
								Seguro
							</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
