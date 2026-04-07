// Routing
import { createFileRoute, Link } from "@tanstack/react-router"
// Icons
import type { LucideIcon } from "lucide-react"
import {
	BarChart3,
	BookOpen,
	Building2,
	Calendar,
	ChefHat,
	ChevronRight,
	ChevronsDown,
	ClipboardCheck,
	Clock,
	FileText,
	Flame,
	Globe,
	QrCode,
	Settings,
	ShieldCheck,
	Truck,
	Users,
	UtensilsCrossed,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoPanel } from "@/components/ui/info-panel"
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item"
import { SectionLabel } from "@/components/ui/section-label"
import type { Feature, Step } from "@/types/ui"

/* ========================================================================
   DATA
   ======================================================================== */

export const steps: Step[] = [
	{
		icon: Calendar,
		title: "Planejar",
		description: "Nutricionistas montam cardápios com equilíbrio nutricional. Unidades preparam aquisições sincronizadas com o ComprasGov.",
	},
	{
		icon: UtensilsCrossed,
		title: "Produzir e Servir",
		description: "Cozinhas executam com foco no que cada cozinheiro precisa fazer agora. Refeitórios controlam o fluxo de entrada e a presença dos comensais.",
	},
	{
		icon: BarChart3,
		title: "Governar e Analisar",
		description: "Administração padroniza insumos e mantém o organograma. Analytics fecha o ciclo com inteligência operacional sobre toda a cadeia.",
	},
]

type Module = {
	icon: LucideIcon
	label: string
	role: string
}

export const modules: Module[] = [
	{ icon: UtensilsCrossed, label: "Comensal", role: "Militar" },
	{ icon: Building2, label: "Refeitório", role: "Fiscal" },
	{ icon: Truck, label: "Unidade", role: "Gestor de OM" },
	{ icon: ChefHat, label: "Cozinha", role: "Nutricionista" },
	{ icon: Flame, label: "Produção", role: "Cozinheiro" },
	{ icon: Globe, label: "Global", role: "Administrador" },
	{ icon: BarChart3, label: "Análises", role: "Gestão" },
]

export const features: Feature[] = [
	{
		icon: ClipboardCheck,
		title: "Planejamento Nutricional",
		description: "Cardápios com controle de nutrientes, templates semanais e calendário mensal de produção.",
	},
	{
		icon: QrCode,
		title: "Controle de Presença",
		description: "Acesso ao refeitório por QR code com registro automático de presenças e auditoria.",
	},
	{
		icon: FileText,
		title: "Integração ComprasGov",
		description: "Geração de listas de necessidades e pedidos de empenho sincronizados com o sistema federal.",
	},
	{
		icon: BarChart3,
		title: "Business Intelligence",
		description: "Dashboards e KPIs sobre consumo, desperdício, demanda e eficiência operacional.",
	},
	{
		icon: Users,
		title: "Multi-perfil e PBAC",
		description: "Controle de acesso por módulo e entidade: cada ator opera apenas no seu escopo.",
	},
	{
		icon: Settings,
		title: "Padronização Sistêmica",
		description: "Catálogo centralizado de insumos e preparações para toda a rede de unidades.",
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
					"Plataforma integrada de gestão de subsistência da Força Aérea Brasileira. Do planejamento nutricional ao empenho de insumos — um sistema para toda a cadeia do rancho.",
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
					<p className="font-mono text-xs text-muted-foreground tracking-[0.2em] uppercase mb-6 md:mb-8">Sistema de Subsistência · Força Aérea Brasileira</p>
					<h1 className="text-6xl md:text-7xl lg:text-[6rem] xl:text-[7rem] font-bold tracking-tight leading-[0.95] text-foreground mb-8 md:mb-10">
						Gestão
						<br />
						<span className="text-primary">integrada.</span>
					</h1>
					<p className="text-muted-foreground text-base md:text-xl leading-relaxed mb-10 md:mb-12 max-w-sm md:max-w-md">
						Da previsão do comensal ao empenho de insumos — uma plataforma para toda a cadeia de subsistência da FAB.
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

			{/* A cadeia operacional */}
			<section id="steps" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="01" label="A cadeia operacional" />
				<div className="mt-8 divide-y divide-border">
					{steps.map((step, i) => {
						const Icon = step.icon
						return (
							<div key={step.title} className="flex items-start gap-5 py-5 stagger-item">
								<span className="font-mono text-3xl font-bold text-muted-foreground tabular-nums leading-none min-w-[2.5rem]">
									{String(i + 1).padStart(2, "0")}
								</span>
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

			{/* Os módulos */}
			<section id="modules" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="02" label="Os módulos" />
				<ul className="mt-8 border border-border rounded-md overflow-hidden divide-y divide-border bg-card">
					{modules.map((mod) => {
						const Icon = mod.icon
						return (
							<Item key={mod.label} variant="default">
								<ItemMedia variant="icon">
									<Icon className="h-4 w-4 text-primary" aria-hidden />
								</ItemMedia>
								<ItemContent>
									<ItemTitle className="font-semibold">{mod.label}</ItemTitle>
								</ItemContent>
								<ItemActions>
									<Badge variant="outline">{mod.role}</Badge>
								</ItemActions>
							</Item>
						)
					})}
				</ul>
			</section>

			{/* Funcionalidades */}
			<section id="features" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="03" label="Funcionalidades" />
				<div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{features.map((feature) => {
						const Icon = feature.icon
						return (
							<Card key={feature.title} variant="tile">
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
						description="Entenda cada módulo, seu perfil de acesso e como operar o sistema no dia a dia."
						tags={["comensal", "fiscal", "nutricionista", "gestor"]}
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
								Multi-perfil
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
