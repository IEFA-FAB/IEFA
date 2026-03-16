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
	PlayCircle,
	QrCode,
	Settings,
	ShieldCheck,
	Star,
	Users,
	UtensilsCrossed,
} from "lucide-react"
// React
import type { ElementType, JSX } from "react"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { MealType } from "@/types/domain/meal"
import type { Feature, Step } from "@/types/ui"

/* ========================================================================
   DATA
   ======================================================================== */

export const steps: Step[] = [
	{
		icon: ShieldCheck,
		title: "Faça Login",
		description:
			"Acesse o sistema com suas credenciais militares de forma segura através da autenticação Supabase.",
	},
	{
		icon: Calendar,
		title: "Selecione os Dias",
		description:
			"Visualize os próximos 30 dias em cards organizados e selecione as refeições que irá consumir.",
	},
	{
		icon: ClipboardCheck,
		title: "Confirme Automaticamente",
		description:
			"Suas seleções são salvas automaticamente, ajudando na previsão de demanda do rancho.",
	},
]

export const mealTypes: MealType[] = [
	{ icon: Coffee, label: "Café da Manhã", time: "06:00 - 08:00", color: "amber" },
	{ icon: UtensilsCrossed, label: "Almoço", time: "11:30 - 13:30", color: "blue" },
	{ icon: Pizza, label: "Janta", time: "18:00 - 20:00", color: "orange" },
	{ icon: Cake, label: "Ceia", time: "21:00 - 22:00", color: "purple" },
]

export const features: Feature[] = [
	{
		icon: BarChart3,
		title: "Planejamento de 30 dias",
		description:
			"Visualize e planeje suas refeições para os próximos 30 dias de forma simples e intuitiva.",
	},
	{
		icon: QrCode,
		title: "4 tipos de refeição",
		description: "Café da manhã, almoço, janta e ceia - marque quais refeições você irá consumir.",
	},
	{
		icon: Users,
		title: "Por Organização Militar",
		description: "Sistema organizado por OM, facilitando o controle e gestão do rancho.",
	},
	{
		icon: Bell,
		title: "Interface responsiva",
		description: "Acesse de qualquer dispositivo - computador, tablet ou smartphone.",
	},
	{
		icon: ShieldCheck,
		title: "Seguro e confiável",
		description: "Autenticação segura e dados protegidos com tecnologia Supabase.",
	},
	{
		icon: Settings,
		title: "Controle de demanda",
		description: "Ajude a administração a prever a demanda e reduzir o desperdício de alimentos.",
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
	const [currentFeature, setCurrentFeature] = useState(0)
	const CurrentFeatureIcon = features[currentFeature]?.icon ?? ShieldCheck

	return (
		<div className="w-full">
			{/* Hero */}
			<HomeHero />

			{/* Como Funciona */}
			<Appear id="steps" className="py-16 md:py-24 bg-muted/10" aria-labelledby="steps-heading">
				<div className="text-center mb-14">
					<Badge variant="outline" className="mx-auto mb-4 gap-2 border-primary/30">
						<Star className="h-4 w-4 text-primary" />
						Passo a passo
					</Badge>
					<h2
						id="steps-heading"
						className="text-3xl md:text-4xl lg:text-5xl font-sans font-bold tracking-tight text-foreground mb-4"
					>
						Como funciona o sistema
					</h2>
					<p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
						Um processo simples e eficiente para gerenciar suas previsões de refeições
					</p>
				</div>

				<div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
					{steps.map((step, index) => {
						const Icon = step.icon
						return (
							<Card
								key={step.title}
								className="group bg-card transition-colors hover:bg-muted/50 stagger-item"
								style={{ animationDelay: `${index * 0.1}s` }}
							>
								<CardHeader className="text-center pt-8">
									<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-md bg-primary/10 transition-colors group-hover:bg-primary/15">
										<Icon className="h-8 w-8 text-primary" />
									</div>
									<CardTitle className="text-xl font-bold">{step.title}</CardTitle>
									<CardDescription className="text-muted-foreground leading-relaxed">
										{step.description}
									</CardDescription>
								</CardHeader>
							</Card>
						)
					})}
				</div>
			</Appear>

			{/* Tipos de Refeição */}
			<Appear id="meals" className="py-16 md:py-24" aria-labelledby="meals-heading">
				<div className="text-center mb-14">
					<Badge
						variant="outline"
						className="mx-auto mb-4 gap-2 px-3 py-1.5 font-sans border-primary/30"
					>
						<UtensilsCrossed className="h-4 w-4 text-primary" />
						Refeições
					</Badge>
					<h2
						id="meals-heading"
						className="text-3xl md:text-4xl lg:text-5xl font-sans font-bold tracking-tight text-foreground mb-4"
					>
						Tipos de refeição disponíveis
					</h2>
					<p className="text-muted-foreground text-base md:text-lg leading-relaxed">
						Marque quais refeições você irá consumir em cada dia
					</p>
				</div>

				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
					{mealTypes.map((meal, index) => {
						const Icon = meal.icon
						return (
							<Card
								key={meal.label}
								className="group text-center transition-colors hover:bg-muted/50 stagger-item"
								style={{ animationDelay: `${index * 0.1}s` }}
							>
								<CardHeader className="pt-8">
									<div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-md bg-primary/10 transition-colors group-hover:bg-primary/15">
										<Icon className="h-8 w-8 text-primary" />
									</div>
									<CardTitle className="text-lg font-bold">{meal.label}</CardTitle>
									<p className="text-sm font-mono text-muted-foreground mt-1">{meal.time}</p>
								</CardHeader>
							</Card>
						)
					})}
				</div>
			</Appear>

			{/* Funcionalidades */}
			<Appear
				id="features"
				className="py-16 md:py-24 bg-muted/10"
				aria-labelledby="features-heading"
			>
				<div className="text-center mb-14">
					<Badge
						variant="outline"
						className="mx-auto mb-4 gap-2 px-3 py-1.5 font-sans border-primary/30"
					>
						<Star className="h-4 w-4 text-primary" />
						Funcionalidades
					</Badge>
					<h2
						id="features-heading"
						className="text-3xl md:text-4xl lg:text-5xl font-sans font-bold tracking-tight text-foreground mb-4"
					>
						Principais funcionalidades
					</h2>
					<p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
						Desenvolvido especificamente para atender as necessidades do rancho militar
					</p>
				</div>

				{/* Feature em destaque */}
				<div className="max-w-4xl mx-auto mb-10">
					<div className="relative p-8 md:p-12 text-primary-foreground text-center bg-primary overflow-hidden rounded-md">
						<div className="relative z-10">
							<div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-md bg-primary-foreground/15">
								<CurrentFeatureIcon className="h-10 w-10 text-primary-foreground" />
							</div>
							<h3 className="text-2xl md:text-3xl font-bold mb-4">
								{features[currentFeature]?.title ?? "—"}
							</h3>
							<p className="text-base md:text-lg leading-relaxed text-primary-foreground/90 max-w-2xl mx-auto">
								{features[currentFeature]?.description ?? ""}
							</p>
						</div>
					</div>
				</div>

				<Separator className="my-8 max-w-6xl mx-auto" />

				<div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
					{features.map((feature, index) => {
						const Icon = feature.icon
						const active = index === currentFeature
						return (
							<button
								type="button"
								key={feature.title}
								onClick={() => setCurrentFeature(index)}
								className={cn(
									"group w-full text-left rounded-md border p-6 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
									active ? "bg-muted border-primary" : "bg-card border-border hover:bg-muted/50"
								)}
								aria-pressed={active}
							>
								<div className="mb-3 flex items-center gap-3">
									<div
										className={cn(
											"flex h-12 w-12 items-center justify-center rounded-md transition-colors",
											active
												? "bg-primary/10 text-primary"
												: "bg-muted text-foreground/80 group-hover:bg-primary/5 group-hover:text-primary"
										)}
									>
										<Icon className="h-6 w-6" />
									</div>
									<h3
										className={cn(
											"text-lg font-bold",
											active ? "text-primary" : "text-card-foreground"
										)}
									>
										{feature.title}
									</h3>
								</div>
								<p className="text-muted-foreground text-sm leading-relaxed">
									{feature.description}
								</p>
							</button>
						)
					})}
				</div>
			</Appear>

			{/* Tutorial + Changelog */}
			<section id="learn" className="py-20" aria-label="Aprenda">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-6xl mx-auto">
					<Appear id="tutorial">
						<InfoCard
							badgeIcon={BookOpen}
							badgeText="Tutorial"
							title="Guia do SISUB"
							description="Aprenda passo a passo a preencher previsões e a fiscalizar com QR no SISUB."
							chips={[
								{ icon: Users, text: "usuário" },
								{ icon: ShieldCheck, text: "fiscal" },
								{ icon: PlayCircle, text: "passo a passo" },
							]}
							cta={{ to: "/tutorial", label: "Ver Tutorial" }}
						/>
					</Appear>

					<Appear id="changelog" delayClass="delay-100">
						<InfoCard
							badgeIcon={FileText}
							badgeText="Novidades"
							title="Novidades do SISUB"
							description="Acompanhe as melhorias, correções e novas funcionalidades em tempo real."
							chips={[
								{ icon: Star, text: "feat" },
								{ icon: ShieldCheck, text: "fix" },
								{ icon: FileText, text: "docs" },
								{ icon: Clock, text: "perf" },
							]}
							cta={{ to: "/changelog", label: "Ver Changelog" }}
						/>
					</Appear>
				</div>
			</section>

			{/* CTA Final */}
			<Appear id="cta" className="relative py-20 md:py-24" aria-labelledby="cta-heading">
				<div className="relative text-center max-w-4xl mx-auto rounded-md bg-primary text-primary-foreground overflow-hidden p-10 md:p-16">
					<div className="relative z-10">
						<h2
							id="cta-heading"
							className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-6"
						>
							Pronto para começar?
						</h2>
						<p className="text-primary-foreground/90 text-base md:text-lg leading-relaxed mb-10 max-w-2xl mx-auto">
							Faça parte da modernização do SISUB. Acesse agora e comece a planejar suas refeições
							de forma inteligente.
						</p>

						<div className="flex flex-col items-center gap-4">
							<Button
								nativeButton={false}
								render={
									<Link to="/auth" aria-label="Ir para a página de login">
										Fazer Login
										<ChevronRight className="h-5 w-5" />
									</Link>
								}
								className="gap-2 px-8 py-6 text-base font-semibold transition-all"
							/>

							<div className="mt-8 flex flex-wrap justify-center items-center gap-6 md:gap-8 text-primary-foreground/85">
								<div className="flex items-center gap-2">
									<Users className="h-5 w-5" />
									<span className="text-sm">Sistema colaborativo</span>
								</div>
								<div className="flex items-center gap-2">
									<Clock className="h-5 w-5" />
									<span className="text-sm">Disponível 24/7</span>
								</div>
								<div className="flex items-center gap-2">
									<ShieldBadge />
									<span className="text-sm">Dados seguros</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Appear>
		</div>
	)
}

/* ========================================================================
   UTILITY COMPONENTS
   ======================================================================== */

function HomeHero() {
	return (
		<Appear
			id="hero"
			as="div"
			className="relative px-4 py-20 md:py-28 overflow-hidden"
			inClass="opacity-100 translate-y-0"
			outClass="opacity-0 translate-y-10"
			duration="duration-700"
		>
			<div className="relative text-center space-y-8 max-w-5xl mx-auto">
				<Badge variant="secondary" className="px-4 py-2 text-sm font-medium">
					Sistema de Previsão de Subsistência
				</Badge>

				<h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight tracking-tight">
					Sistema de <span className="text-primary">Subsistência</span>
				</h1>

				<p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
					Sistema inteligente para previsão de demanda do rancho. Planeje suas refeições, reduza
					desperdícios e otimize a gestão alimentar.
				</p>

				<div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
					<Button
						nativeButton={false}
						render={<Link to="/auth">Acessar Sistema</Link>}
						className="gap-2 px-8 py-6 text-base font-semibold transition-all"
					/>
					<div className="flex items-center space-x-2 text-sm text-muted-foreground">
						<ShieldBadge />
						<span>Login seguro necessário</span>
					</div>
				</div>
			</div>
		</Appear>
	)
}

function ShieldBadge() {
	return (
		<span className="inline-flex items-center justify-center rounded-md w-5 h-5 bg-primary/10 text-primary">
			<ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
		</span>
	)
}

type InfoChip = {
	icon: React.ComponentType<{ className?: string }>
	text: string
}

type InfoCardProps = {
	badgeIcon: React.ComponentType<{ className?: string }>
	badgeText: string
	title: string
	description: string
	chips?: InfoChip[]
	cta: { to: string; label: string }
}

const EMPTY_CHIPS: InfoChip[] = []

function InfoCard({
	badgeIcon: BadgeIcon,
	badgeText,
	title,
	description,
	chips = EMPTY_CHIPS,
	cta,
}: InfoCardProps) {
	return (
		<Card className="transition-colors hover:bg-muted/50 border-border/50 bg-card">
			<CardHeader className="items-center text-center">
				<Badge variant="outline" className="mx-auto mb-3 gap-2 border-primary/30">
					<BadgeIcon className="h-4 w-4 text-primary" />
					{badgeText}
				</Badge>
				<CardTitle className="text-2xl md:text-3xl font-bold">{title}</CardTitle>
				<CardDescription className="text-muted-foreground max-w-md mx-auto leading-relaxed">
					{description}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col items-center">
				{!!chips.length && (
					<div className="mb-8 flex flex-wrap items-center justify-center gap-2">
						{chips.map((c) => {
							const Icon = c.icon
							return (
								<Badge
									key={c.text}
									variant="secondary"
									className="gap-1.5 px-2.5 py-1 font-mono text-xs"
								>
									<Icon className="h-3.5 w-3.5" />
									{c.text}
								</Badge>
							)
						})}
					</div>
				)}
				<Button
					nativeButton={false}
					render={
						<Link to={cta.to} aria-label={cta.label}>
							{cta.label}
							<ChevronRight className="h-5 w-5" />
						</Link>
					}
					className="gap-2 font-semibold"
				/>
			</CardContent>
		</Card>
	)
}

/* ========================================================================
   ANIMATION COMPONENT
   ======================================================================== */

type AppearProps = {
	id?: string
	as?: keyof JSX.IntrinsicElements
	className?: string
	inClass?: string
	outClass?: string
	duration?: string
	delayClass?: string
	threshold?: number
	rootMargin?: string
	children: React.ReactNode
	[key: string]: unknown
}

/**
 * Wrapper de animação ao scroll via IntersectionObserver.
 */
function Appear({
	id,
	as = "section",
	className = "",
	inClass = "opacity-100 translate-y-0",
	outClass = "opacity-0 translate-y-8",
	duration = "duration-700",
	delayClass = "",
	threshold = 0.12,
	rootMargin = "0px 0px -10% 0px",
	children,
	...rest
}: AppearProps) {
	const [visible, setVisible] = useState(false)
	const ref = useRef<HTMLElement | null>(null)

	useEffect(() => {
		const el = ref.current
		if (!el) return
		const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
			threshold,
			rootMargin,
		})
		obs.observe(el)
		return () => obs.disconnect()
	}, [threshold, rootMargin])

	const Comp = as as ElementType

	return (
		<Comp
			id={id}
			ref={ref}
			className={cn(
				className,
				"transition-all",
				duration,
				delayClass,
				visible ? inClass : outClass
			)}
			{...rest}
		>
			{children}
		</Comp>
	)
}
