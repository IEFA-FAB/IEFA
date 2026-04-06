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
import { Button } from "@/components/ui/button"
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
				content:
					"Sistema inteligente para previsão de demanda do rancho. Planeje suas refeições, reduza desperdícios e otimize a gestão alimentar.",
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
			<section className="pb-16 md:pb-24 pt-2 animate-fade-slide-in">
				<p className="font-mono text-xs text-muted-foreground tracking-[0.18em] uppercase mb-8">
					Sistema de Subsistência · Força Aérea Brasileira
				</p>
				<h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.0] text-foreground mb-6">
					Planeje
					<br />
					seu rancho.
				</h1>
				<p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-10 max-w-md">
					Preveja demanda, reduza desperdício e gerencie refeições por OM — um sistema feito para militares.
				</p>
				<div className="flex flex-wrap items-center gap-5">
					<Button
						nativeButton={false}
						render={
							<Link to="/auth" className="flex items-center gap-2">
								Acessar Sistema
								<ChevronRight className="h-4 w-4" />
							</Link>
						}
					/>
					<span className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
						<ShieldCheck className="h-3.5 w-3.5" aria-hidden />
						Login obrigatório
					</span>
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
								<span className="font-mono text-3xl font-bold text-border tabular-nums leading-none min-w-[2.5rem]">
									{String(i + 1).padStart(2, "0")}
								</span>
								<div className="pt-0.5">
									<div className="flex items-center gap-2 mb-1">
										<Icon className="h-4 w-4 text-primary flex-shrink-0" aria-hidden />
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
									<Icon className="h-4 w-4 text-primary flex-shrink-0" aria-hidden />
									<span className="font-semibold text-sm text-foreground">{meal.label}</span>
								</div>
								<span className="font-mono text-sm text-muted-foreground tabular-nums">{meal.time}</span>
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
							<div
								key={feature.title}
								className="flex flex-col gap-2 p-4 border border-border rounded-md bg-card hover:bg-muted/40 transition-colors"
							>
								<div className="flex items-center gap-2">
									<Icon className="h-4 w-4 text-primary flex-shrink-0" aria-hidden />
									<h3 className="font-bold text-sm text-foreground">{feature.title}</h3>
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
							</div>
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

/* ========================================================================
   UTILITY COMPONENTS
   ======================================================================== */

function SectionLabel({ index, label }: { index: string; label: string }) {
	return (
		<div className="flex items-center gap-3">
			<span className="font-mono text-xs text-muted-foreground/40 tabular-nums">{index}</span>
			<div className="h-px w-6 bg-border" />
			<span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
		</div>
	)
}

type InfoPanelProps = {
	icon: React.ComponentType<{ className?: string }>
	label: string
	title: string
	description: string
	tags: string[]
	to: string
	cta: string
}

function InfoPanel({ icon: Icon, label, title, description, tags, to, cta }: InfoPanelProps) {
	return (
		<div className="border border-border rounded-md bg-card p-5 flex flex-col gap-4 hover:bg-muted/30 transition-colors">
			<div className="flex items-center gap-2">
				<Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
				<span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
			</div>
			<div>
				<h3 className="font-bold text-lg text-foreground mb-1">{title}</h3>
				<p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{tags.map((tag) => (
					<span key={tag} className="font-mono text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-sm">
						{tag}
					</span>
				))}
			</div>
			<Button
				variant="outline"
				nativeButton={false}
				render={
					<Link to={to} className="flex items-center gap-2">
						{cta}
						<ChevronRight className="h-4 w-4" />
					</Link>
				}
				className="self-start mt-auto"
			/>
		</div>
	)
}
