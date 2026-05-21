// Routing

import { NeuroNoise } from "@paper-design/shaders-react"
import { createFileRoute, Link } from "@tanstack/react-router"
// Icons
import {
	BarChart3,
	BookOpen,
	Building2,
	Calendar,
	ChefHat,
	ChevronDown,
	ChevronRight,
	ClipboardCheck,
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
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InfoPanel } from "@/components/ui/info-panel"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { SectionLabel } from "@/components/ui/section-label"
import { useTheme } from "@/hooks/ui/useTheme"
import type { Feature, Module, Step } from "@/types/ui"

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
		description: "Cozinhas distribuem as preparações do dia por cozinheiro e turno. Refeitórios controlam o acesso e registram a presença dos comensais.",
	},
	{
		icon: BarChart3,
		title: "Governar e Analisar",
		description:
			"Administração centraliza o catálogo de insumos e a estrutura de unidades. Os indicadores fecham o ciclo com visibilidade sobre toda a cadeia.",
	},
]

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
	// Heroes — os dois diferenciais institucionais do SISUB
	{
		icon: ClipboardCheck,
		title: "Planejamento Nutricional",
		description: "Cardápios com controle de nutrientes, modelos semanais e calendário mensal de produção.",
	},
	{
		icon: FileText,
		title: "Integração ComprasGov",
		description: "Geração de listas de necessidades e pedidos de empenho sincronizados com o sistema federal.",
	},
	// Secundários
	{
		icon: QrCode,
		title: "Controle de Presença",
		description: "Acesso ao refeitório por QR code com registro automático de presenças e auditoria.",
	},
	{
		icon: BarChart3,
		title: "Análises Gerenciais",
		description: "Dashboards e KPIs sobre consumo, desperdício, demanda e eficiência operacional.",
	},
	{
		icon: Users,
		title: "Multi-perfil e Acesso por Escopo",
		description: "Controle de acesso por módulo e entidade: cada perfil opera apenas no seu escopo.",
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
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const title = "SISUB - Sistema de Subsistência"
		const description = "Plataforma integrada de gestão de subsistência da Força Aérea Brasileira: do planejamento nutricional ao empenho de insumos."
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: `${baseUrl}/` },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:url", content: `${baseUrl}/` },
			],
		}
	},
	component: Home,
})

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */

// Hex equivalents of OKLCH tokens — shaders-react does not accept OKLCH
const NEURO_LIGHT = {
	colorBack: "#ffffff",
	colorMid: "#dce6f7",
	colorFront: "#b8ccec",
} as const

const NEURO_DARK = {
	colorBack: "#06090f",
	colorMid: "#0d1830",
	colorFront: "#172545",
} as const

// Gradient mask: shader visible only on the right, all 4 edges fade to transparent
const HERO_SHADER_MASK = [
	"linear-gradient(to right, transparent 35%, black 60%, black 88%, transparent 100%)",
	"linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
].join(", ")

function Home() {
	const { theme } = useTheme()
	const neuroColors = theme === "dark" ? NEURO_DARK : NEURO_LIGHT

	// Shader starts static (speed=0 renders one frame, no rAF loop — faster init)
	// After WebGL compiles shaders (~150ms), fade it in then start animating
	const [shaderVisible, setShaderVisible] = useState(false)
	const [shaderSpeed, setShaderSpeed] = useState(0)

	useEffect(() => {
		// 150ms: enough for WebGL shader compilation on most devices
		const t1 = setTimeout(() => {
			setShaderVisible(true)
			const t2 = setTimeout(() => setShaderSpeed(0.08), 400)
			return () => clearTimeout(t2)
		}, 150)
		return () => clearTimeout(t1)
	}, [])

	return (
		<div className="w-full">
			{/* Hero */}
			<section className="relative min-h-[calc(100svh-5.5rem)] md:min-h-[calc(100svh-6rem)] flex flex-col justify-between pb-6 pt-2 animate-fade-slide-in">
				{/* Pixelated NeuroNoise — right side only, fades in after WebGL init */}
				<div
					aria-hidden
					style={{
						position: "absolute",
						inset: 0,
						pointerEvents: "none",
						opacity: shaderVisible ? 0.8 : 0,
						transition: "opacity 0.7s ease-out",
						maskImage: HERO_SHADER_MASK,
						WebkitMaskImage: HERO_SHADER_MASK,
						maskComposite: "intersect",
						WebkitMaskComposite: "destination-in",
					}}
				>
					<NeuroNoise
						{...neuroColors}
						speed={shaderSpeed}
						scale={0.55}
						brightness={1.0}
						contrast={2.6}
						maxPixelCount={40000}
						minPixelRatio={0.05}
						style={{ position: "absolute", inset: 0 }}
						className="hero-shader-canvas"
					/>
				</div>
				<div className="relative flex-1 flex flex-col justify-start md:justify-center max-w-3xl">
					<p className="font-mono text-eyebrow text-muted-foreground mb-6 md:mb-8">Sistema de Subsistência · Força Aérea Brasileira</p>
					<h1 className="text-hero text-foreground mb-8 md:mb-10">
						Gestão
						<br />
						<span className="text-primary">integrada.</span>
					</h1>
					<p className="text-lead text-muted-foreground mb-10 md:mb-12 max-w-sm md:max-w-md">
						Do planejamento de refeições ao empenho de insumos: uma plataforma para toda a cadeia de subsistência da FAB.
					</p>
					<div className="flex flex-wrap items-center gap-4 md:gap-6">
						<Button
							nativeButton={false}
							render={
								<Link to="/auth" className="flex items-center gap-2">
									Entrar
									<ChevronRight className="size-4" />
								</Link>
							}
							size="lg"
						/>
						<span className="inline-flex items-center gap-1.5 text-caption font-mono text-muted-foreground">
							<ShieldCheck className="size-3.5" aria-hidden />
							Acesso restrito
						</span>
					</div>
				</div>
				<button
					type="button"
					className="flex justify-center pb-2 bg-transparent border-0 p-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
					onClick={() => document.getElementById("steps")?.scrollIntoView({ behavior: "smooth" })}
					aria-label="Rolar para a cadeia operacional"
				>
					<ChevronDown className="size-5 text-muted-foreground opacity-40 animate-bounce" aria-hidden />
				</button>
			</section>

			{/* A cadeia operacional */}
			<section id="steps" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="01" label="A cadeia operacional" />
				<div className="mt-8 divide-y divide-border">
					{steps.map((step, i) => {
						const Icon = step.icon
						return (
							<div key={step.title} className="flex items-start gap-5 py-5 stagger-item">
								<span aria-hidden className="font-mono text-step-number text-muted-foreground tabular-nums min-w-[2.5rem]">
									{String(i + 1).padStart(2, "0")}
								</span>
								<div className="pt-0.5">
									<div className="flex items-center gap-2 mb-1">
										<Icon className="size-4 text-primary shrink-0" aria-hidden />
										<h3 className="text-subheading text-foreground">{step.title}</h3>
									</div>
									<p className="text-body text-muted-foreground">{step.description}</p>
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
									<Icon className="size-4 text-primary" aria-hidden />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{mod.label}</ItemTitle>
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

				{/* 2 hero features — diferenciais institucionais */}
				<div className="mt-8 grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border border border-border rounded-md overflow-hidden bg-card">
					{features.slice(0, 2).map((feature) => {
						const Icon = feature.icon
						return (
							<div key={feature.title} className="flex flex-col gap-3 p-5">
								<Icon className="size-5 text-primary" aria-hidden />
								<div>
									<p className="text-subheading text-foreground">{feature.title}</p>
									<p className="text-body text-muted-foreground mt-1">{feature.description}</p>
								</div>
							</div>
						)
					})}
				</div>

				{/* 4 secondary features */}
				<ul className="mt-3 border border-border rounded-md overflow-hidden divide-y divide-border bg-card">
					{features.slice(2).map((feature) => {
						const Icon = feature.icon
						return (
							<Item key={feature.title} variant="default">
								<ItemMedia variant="icon">
									<Icon className="size-4 text-primary" aria-hidden />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{feature.title}</ItemTitle>
									<ItemDescription>{feature.description}</ItemDescription>
								</ItemContent>
							</Item>
						)
					})}
				</ul>
			</section>

			{/* Tutorial + Changelog */}
			<section id="learn" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="04" label="Saiba mais" />
				<div className="mt-8 grid md:grid-cols-2 gap-4">
					<InfoPanel
						icon={BookOpen}
						label="Tutorial"
						title="Guia do SISUB"
						description="Entenda seu papel no sistema e como operar cada módulo no dia a dia."
						tags={["comensal", "fiscal", "nutricionista", "gestor"]}
						to="/tutorial"
						cta="Ver Tutorial"
					/>
					<InfoPanel
						icon={FileText}
						label="Changelog"
						title="Novidades e Correções"
						description="Acompanhe melhorias, correções e novas funcionalidades a cada versão lançada."
						tags={["funcionalidade", "correção", "melhoria", "desempenho"]}
						to="/changelog"
						cta="Ver Changelog"
					/>
				</div>
			</section>

			{/* CTA Final */}
			<section id="cta" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="05" label="Acesso" />
				<div className="mt-8 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
					<h2 className="text-section-title text-foreground">
						Pronto para
						<br />
						começar?
					</h2>
					<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
						<Button
							nativeButton={false}
							render={
								<Link to="/auth" className="flex items-center gap-2">
									Entrar
									<ChevronRight className="size-4" />
								</Link>
							}
						/>
						<div className="flex flex-wrap items-center gap-4 font-mono text-caption text-muted-foreground">
							<span className="flex items-center gap-1.5">
								<Users className="size-3.5" aria-hidden />6 perfis de acesso
							</span>
							<span className="flex items-center gap-1.5">
								<FileText className="size-3.5" aria-hidden />
								Integrado ao ComprasGov
							</span>
							<span className="flex items-center gap-1.5">
								<Building2 className="size-3.5" aria-hidden />
								Implantado no SDAB
							</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
