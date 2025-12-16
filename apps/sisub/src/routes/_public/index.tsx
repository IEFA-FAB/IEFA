// UI Components (from @iefa/ui)
import { Feature, MealType, Step } from "@/types/domain";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Separator,
} from "@iefa/ui";

// Routing
import { createFileRoute, Link } from "@tanstack/react-router";

// Icons
import type { LucideIcon } from "lucide-react";
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
} from "lucide-react";

// React
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";

/* ========================================================================
   TYPE DEFINITIONS
   ======================================================================== */

/**
 * Representa um passo do tutorial/workflow do sistema
 */



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
];

/**
 * Tipos de refeição disponíveis no SISUB
 * Exibidos na seção "Tipos de refeição disponíveis"
 */
export const mealTypes: MealType[] = [
	{ icon: Coffee, label: "Café da Manhã", time: "06:00 - 08:00" },
	{ icon: UtensilsCrossed, label: "Almoço", time: "11:30 - 13:30" },
	{ icon: Pizza, label: "Janta", time: "18:00 - 20:00" },
	{ icon: Cake, label: "Ceia", time: "21:00 - 22:00" },
];

/**
 * Funcionalidades principais do SISUB
 * Exibidas na seção "Principais funcionalidades" com sistema de seleção interativa
 */
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
		description:
			"Café da manhã, almoço, janta e ceia - marque quais refeições você irá consumir.",
	},
	{
		icon: Users,
		title: "Por Organização Militar",
		description:
			"Sistema organizado por OM, facilitando o controle e gestão do rancho.",
	},
	{
		icon: Bell,
		title: "Interface responsiva",
		description:
			"Acesse de qualquer dispositivo - computador, tablet ou smartphone.",
	},
	{
		icon: ShieldCheck,
		title: "Seguro e confiável",
		description:
			"Autenticação segura e dados protegidos com tecnologia Supabase.",
	},
	{
		icon: Settings,
		title: "Controle de demanda",
		description:
			"Ajude a administração a prever a demanda e reduzir o desperdício de alimentos.",
	},
];

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

/**
 * Rota pública da página inicial do SISUB
 * Define meta tags para SEO e renderiza o componente Home
 */
export const Route = createFileRoute("/_public/")({
	head: () => ({
		meta: [
			{ title: "Previsão SISUB" },
			{ name: "description", content: "Ajude a melhorar o SISUB" },
		],
	}),
	component: Home,
});

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */

/**
 * Página inicial pública do SISUB
 *
 * Seções:
 * 1. Hero - Apresentação principal com CTA
 * 2. Como Funciona - 3 passos explicativos
 * 3. Tipos de Refeição - 4 tipos disponíveis
 * 4. Funcionalidades - Features interativas
 * 5. Tutorial + Changelog - Links para documentação
 * 6. CTA Final - Chamada para ação
 */

function Home() {
	const [currentFeature, setCurrentFeature] = useState(0);
	const CurrentFeatureIcon = features[currentFeature]?.icon ?? ShieldCheck;

	return (
		<div className="w-full">
			<HomeHero />

			{/* Como Funciona */}
			<Appear
				id="steps"
				className="py-16 md:py-20"
				aria-labelledby="steps-heading"
			>
				<div className="text-center mb-14">
					<Badge variant="outline" className="mx-auto mb-3 gap-2">
						<Star className="h-4 w-4 text-primary" />
						Passo a passo
					</Badge>

					<h2
						id="steps-heading"
						className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4"
					>
						Como funciona o sistema
					</h2>
					<p className="text-muted-foreground max-w-2xl mx-auto">
						Um processo simples e eficiente para gerenciar suas previsões de
						refeições
					</p>
				</div>

				<div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
					{steps.map((step) => {
						const Icon = step.icon;
						return (
							<Card
								key={step.title}
								className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 focus-within:ring-1 focus-within:ring-ring"
							>
								<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/50 via-primary/20 to-primary/50" />
								<CardHeader className="text-center">
									<div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted ring-1 ring-inset ring-border">
										<Icon className="h-8 w-8 text-primary" />
									</div>
									<CardTitle className="text-xl">{step.title}</CardTitle>
									<CardDescription className="text-muted-foreground">
										{step.description}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div
										aria-hidden
										className="pointer-events-none absolute -right-10 -bottom-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-all duration-300 group-hover:scale-110"
									/>
								</CardContent>
							</Card>
						);
					})}
				</div>
			</Appear>

			{/* Tipos de Refeição */}
			<Appear
				id="meals"
				className="py-16 md:py-20"
				aria-labelledby="meals-heading"
			>
				<div className="text-center mb-14">
					<Badge variant="outline" className="mx-auto mb-3 gap-2">
						<UtensilsCrossed className="h-4 w-4 text-primary" />
						Refeições
					</Badge>
				</div>

				<div className="text-center mb-6">
					<h2
						id="meals-heading"
						className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4"
					>
						Tipos de refeição disponíveis
					</h2>
					<p className="text-muted-foreground">
						Marque quais refeições você irá consumir em cada dia
					</p>
				</div>

				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
					{mealTypes.map((meal) => {
						const Icon = meal.icon;
						return (
							<Card
								key={meal.label}
								tabIndex={0}
								className="group rounded-xl border border-border bg-card text-center shadow-sm ring-1 ring-inset ring-transparent hover:ring-border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
							>
								<CardHeader>
									<div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted ring-1 ring-inset ring-border">
										<Icon className="h-8 w-8 text-foreground/80" />
									</div>
									<CardTitle className="text-lg">{meal.label}</CardTitle>
								</CardHeader>
							</Card>
						);
					})}
				</div>
			</Appear>

			{/* Features (sem Tabs; simplificado) */}
			<Appear
				id="features"
				className="py-16 md:py-20"
				aria-labelledby="features-heading"
			>
				<div className="text-center mb-14">
					<Badge variant="outline" className="mx-auto mb-3 gap-2">
						<Star className="h-4 w-4 text-primary" />
						Funcionalidades
					</Badge>
					<h2
						id="features-heading"
						className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-4"
					>
						Principais funcionalidades
					</h2>
					<p className="text-muted-foreground max-w-2xl mx-auto">
						Desenvolvido especificamente para atender as necessidades do rancho
						militar
					</p>
				</div>

				{/* Destaque da feature atual */}
				<div className="max-w-4xl mx-auto mb-8">
					<div className="rounded-xl p-8 text-primary-foreground text-center shadow-lg ring-1 ring-inset ring-border/30 bg-linear-to-r from-primary to-primary/85">
						<div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-inset ring-primary-foreground/20">
							<CurrentFeatureIcon className="h-10 w-10 text-primary-foreground" />
						</div>
						<h3 className="text-2xl font-bold mb-3 drop-shadow-sm">
							{features[currentFeature]?.title ?? "—"}
						</h3>
						<p className="text-base md:text-lg/relaxed text-primary-foreground/90">
							{features[currentFeature]?.description ?? ""}
						</p>
					</div>
				</div>

				<Separator className="my-6" />

				{/* Grid de features com seleção */}
				<div className="max-w-6xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-6">
					{features.map((feature, index) => {
						const Icon = feature.icon;
						const active = index === currentFeature;
						return (
							<button
								type="button"
								key={feature.title}
								onClick={() => setCurrentFeature(index)}
								className={`group w-full text-left rounded-xl border bg-card p-6 shadow-sm transition-all duration-300 border-border ring-1 ring-inset ${
									active
										? "ring-primary/40 shadow-md"
										: "ring-transparent hover:-translate-y-0.5 hover:shadow-md hover:ring-border"
								} focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
								aria-pressed={active}
							>
								<div className="mb-3 flex items-center gap-3">
									<div
										className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ring-border ${
											active
												? "bg-primary/10 text-primary"
												: "bg-muted text-foreground/80"
										}`}
									>
										<Icon className="h-5 w-5" />
									</div>
									<h3
										className={`text-lg font-bold ${active ? "text-primary" : "text-card-foreground"}`}
									>
										{feature.title}
									</h3>
								</div>
								<p className="text-muted-foreground text-sm">
									{feature.description}
								</p>
							</button>
						);
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
			<Appear id="cta" className="relative py-20" aria-labelledby="cta-heading">
				<div className="relative text-center max-w-3xl mx-auto rounded-2xl bg-linear-to-r from-primary to-primary/85 text-primary-foreground shadow-lg ring-1 ring-inset ring-border/30 overflow-hidden p-10 px-20">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_50%)]"
					/>
					<div className="relative">
						<h2
							id="cta-heading"
							className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4"
						>
							Pronto para começar?
						</h2>
						<p className="text-primary-foreground/85 text-lg mb-8">
							Faça parte da modernização do SISUB. Acesse agora e comece a
							planejar suas refeições de forma inteligente.
						</p>

						<div className="flex flex-col items-center gap-3">
							<Button asChild size="lg" variant="secondary" className="gap-2">
								<Link to="/auth" aria-label="Ir para a página de login">
									Fazer Login
									<ChevronRight className="h-5 w-5" />
								</Link>
							</Button>

							<div className="mt-6 flex flex-wrap justify-center items-center gap-6 text-primary-foreground/85">
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
	);
}

/* ========================================================================
   UTILITY COMPONENTS
   ======================================================================== */

/**
 * Hero da página inicial
 * Apresenta o título principal, descrição e CTA para acessar o sistema
 */

function HomeHero() {
	return (
		<Appear
			id="hero"
			as="div"
			className="px-4 py-16"
			inClass="opacity-100 translate-y-0"
			outClass="opacity-0 translate-y-10"
			duration="duration-500"
		>
			<div className="text-center space-y-6 max-w-4xl mx-auto">
				<Badge
					variant="secondary"
					className="px-4 py-2 text-sm font-medium animate-pulse"
				>
					Sistema de Previsão de Subsistência
				</Badge>

				<h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
					Sistema de
					<span className="block text-transparent bg-clip-text bg-linear-to-r from-primary to-primary/60">
						Subsistência
					</span>
				</h1>

				<p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
					Sistema inteligente para previsão de demanda do rancho. Planeje suas
					refeições, reduza desperdícios e otimize a gestão alimentar.
				</p>

				<div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
					<Button asChild size="lg" className="gap-2">
						<Link to="/auth">Acessar Sistema</Link>
					</Button>

					<div className="flex items-center space-x-2 text-sm text-muted-foreground">
						<ShieldBadge />
						<span>Login seguro necessário</span>
					</div>
				</div>
			</div>
		</Appear>
	);
}

/**
 * Badge com ícone de escudo para indicar segurança
 * Usado no Hero e CTA final
 */
function ShieldBadge() {
	return (
		<span className="inline-flex items-center justify-center rounded-full w-5 h-5 bg-primary/10 text-primary">
			<ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
		</span>
	);
}

/**
 * Props para o componente InfoChip
 */
type InfoChip = {
	/** Componente de ícone React */
	icon: React.ComponentType<{ className?: string }>;
	/** Texto a ser exibido */
	text: string;
};

/**
 * Card informativo com badge, título, descrição, chips e CTA
 * Usado nas seções Tutorial e Changelog
 */

function InfoCard(props: {
	badgeIcon: React.ComponentType<{ className?: string }>;
	badgeText: string;
	title: string;
	description: string;
	chips?: InfoChip[];
	cta: { to: string; label: string };
}) {
	const {
		badgeIcon: BadgeIcon,
		badgeText,
		title,
		description,
		chips = [],
		cta,
	} = props;

	return (
		<Card className="transition-all duration-700">
			<CardHeader className="items-center text-center">
				<Badge variant="outline" className="mx-auto mb-1 gap-2">
					<BadgeIcon className="h-4 w-4 text-primary" />
					{badgeText}
				</Badge>
				<CardTitle className="text-2xl md:text-3xl">{title}</CardTitle>
				<CardDescription className="text-muted-foreground max-w-md mx-auto">
					{description}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col items-center">
				{!!chips.length && (
					<div className="mb-8 flex flex-wrap items-center justify-center gap-2">
						{chips.map((c) => {
							const Icon = c.icon;
							return (
								<Badge key={c.text} variant="secondary" className="gap-1">
									<Icon className="h-3.5 w-3.5" />
									{c.text}
								</Badge>
							);
						})}
					</div>
				)}
				<Button asChild variant="default">
					<Link to={cta.to} aria-label={cta.label} className="gap-2">
						{cta.label}
						<ChevronRight className="h-5 w-5" />
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}

/**
 * Componente wrapper para animação de aparecimento ao scroll
 * Utiliza IntersectionObserver para detectar quando o elemento entra na viewport
 *
 * @param id - ID opcional para o elemento
 * @param as - Tag HTML a ser renderizada (padrão: "section")
 * @param className - Classes CSS adicionais
 * @param inClass - Classes quando visível (padrão: "opacity-100 translate-y-0")
 * @param outClass - Classes quando invisível (padrão: "opacity-0 translate-y-8")
 * @param duration - Duração da transição (padrão: "duration-700")
 * @param delayClass - Delay da animação (ex: "delay-100")
 * @param threshold - Porcentagem mínima visível para ativar (padrão: 0.12)
 * @param rootMargin - Margem do IntersectionObserver (padrão: "0px 0px -10% 0px")
 */
function Appear(props: {
	id?: string;
	as?: keyof JSX.IntrinsicElements;
	className?: string;
	inClass?: string;
	outClass?: string;
	duration?: string; // ex: "duration-700"
	delayClass?: string; // ex: "delay-100"
	threshold?: number;
	rootMargin?: string;
	children: React.ReactNode;
	[key: string]: any;
}) {
	const {
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
	} = props;

	const [visible, setVisible] = useState(false);
	const ref = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const obs = new IntersectionObserver(
			([entry]) => setVisible(entry.isIntersecting),
			{
				threshold,
				rootMargin,
			},
		);
		obs.observe(el);
		return () => obs.disconnect();
	}, [threshold, rootMargin]);

	const Comp = as as any;

	return (
		<Comp
			id={id}
			ref={ref}
			className={`${className} transition-all ${duration} ${delayClass} ${visible ? inClass : outClass}`}
			{...rest}
		>
			{children}
		</Comp>
	);
}
