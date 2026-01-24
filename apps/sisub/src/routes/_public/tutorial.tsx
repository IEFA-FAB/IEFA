// routes/home/tutorial.tsx

// shadcn (via seu kit). Ajuste o import conforme o seu projeto caso necessário.
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
import { createFileRoute, Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	AlertTriangle,
	BookOpen,
	CalendarCheck,
	Camera,
	ChevronRight,
	HelpCircle,
	Info,
	Lock,
	QrCode,
	RefreshCw,
	Save,
	Settings,
	ShieldCheck,
} from "lucide-react";
import { type JSX, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_public/tutorial")({
	component: Tutorial,
	head: () => ({
		meta: [
			{ title: "Tutorial SISUB" },
			{
				name: "description",
				content:
					"Aprenda a usar o SISUB: como preencher previsões e como fiscalizar via QR.",
			},
		],
	}),
});

function Tutorial() {
	return (
		<div className="min-h-screen">
			{/* Hero */}
			<Appear
				id="hero"
				as="section"
				className="container mx-auto px-4 pt-14 pb-10"
				duration="duration-500"
				outClass="opacity-0 translate-y-6"
				inClass="opacity-100 translate-y-0"
			>
				<Card className="rounded-2xl border border-border bg-card shadow-sm">
					<CardContent className="p-8 md:p-10">
						<div className="flex items-start md:items-center md:justify-between flex-col md:flex-row gap-6">
							<div>
								<Badge
									variant="outline"
									className="inline-flex items-center gap-2 mb-4"
								>
									<BookOpen className="w-4 h-4 text-primary" />
									{heroData.badge}
								</Badge>
								<h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-3">
									{heroData.title}
								</h1>
								<p className="text-muted-foreground max-w-2xl">
									{heroData.subtitle}
								</p>
							</div>
							<div className="flex gap-3">
								<Button
									render={
										<Link
											to={heroData.primaryButton.to}
											aria-label="Ir para Previsão"
										>
											{heroData.primaryButton.label}
										</Link>
									}
								/>
								<Button
									render={
										<Link
											to={heroData.secondaryButton.to}
											aria-label="Ir para Fiscal"
										>
											{heroData.secondaryButton.label}
										</Link>
									}
									variant="outline"
								/>
							</div>
						</div>
					</CardContent>
				</Card>
			</Appear>

			{/* Visão Geral */}
			<Appear
				id="overview"
				as="section"
				className="container mx-auto px-4 py-10"
				duration="duration-500"
				delayClass="delay-100"
			>
				<div className="text-center mb-10">
					<Badge variant="outline" className="mx-auto mb-3 gap-2">
						<Info className="h-4 w-4 text-primary" />
						Visão geral
					</Badge>
					<h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
						Configurações e atalhos úteis
					</h2>
				</div>

				<div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
					{overviewCards.map((card) => (
						<Card
							key={card.title}
							className="group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 focus-within:ring-1 focus-within:ring-ring"
						>
							<div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/50 via-primary/20 to-primary/50" />
							<CardHeader>
								<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted ring-1 ring-inset ring-border">
									<card.icon className="h-6 w-6 text-primary" />
								</div>
								<CardTitle className="text-lg">{card.title}</CardTitle>
								<CardDescription className="text-muted-foreground">
									{card.description}
								</CardDescription>
							</CardHeader>
						</Card>
					))}
				</div>
			</Appear>

			{/* Tutorial do Usuário (Previsão) */}
			<Appear
				id="rancho"
				as="section"
				className="py-14"
				duration="duration-500"
				delayClass="delay-150"
			>
				<div className="container mx-auto px-4">
					<div className="text-center mb-10">
						<Badge variant="outline" className="mx-auto mb-3 gap-2">
							<CalendarCheck className="h-4 w-4 text-primary" />
							Previsão
						</Badge>
						<h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
							Preenchendo sua Previsão
						</h2>
						<p className="text-muted-foreground">
							Como usar a página de Previsão (Rancho) para informar suas
							refeições
						</p>
					</div>

					<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
						{ranchoSteps.map((s) => (
							<StepCard
								key={s.title}
								icon={s.icon}
								title={s.title}
								description={s.description}
							/>
						))}
					</div>

					<div className="mt-10 text-center">
						<Button
							render={
								<Link to="/forecast">
									Abrir página de Previsão
									<ChevronRight className="w-4 h-4" />
								</Link>
							}
							className="gap-2"
						/>
					</div>
				</div>
			</Appear>

			{/* Tutorial do Fiscal (QR) */}
			<Appear
				id="fiscal"
				as="section"
				className="container mx-auto px-4 py-14"
				duration="duration-500"
				delayClass="delay-200"
			>
				<div className="text-center mb-10">
					<Badge variant="outline" className="mx-auto mb-3 gap-2">
						<QrCode className="h-4 w-4 text-primary" />
						Fiscal
					</Badge>
					<h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
						Fiscalização com Leitura de QR
					</h2>
					<p className="text-muted-foreground">
						Passo a passo para usar o leitor e confirmar entradas
					</p>
				</div>

				<div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
					{fiscalSteps.map((s) => (
						<StepCard
							key={s.title}
							icon={s.icon}
							title={s.title}
							description={s.description}
						/>
					))}
				</div>

				<Card className="rounded-xl border border-border bg-card shadow-sm p-6 mt-8 max-w-4xl mx-auto">
					<CardTitle className="text-lg">Dicas úteis</CardTitle>
					<Separator className="my-3" />
					<ul className="text-muted-foreground text-sm list-disc pl-5 space-y-1">
						{qrReaderTips.map((t) => (
							<li key={t}>{t}</li>
						))}
					</ul>
					<div className="mt-4">
						<Button
							render={
								<Link to="/presence">
									Abrir Leitor de QR
									<QrCode className="w-4 h-4" />
								</Link>
							}
							variant="outline"
							className="gap-2"
						/>
					</div>
				</Card>
			</Appear>

			{/* Boas Práticas */}
			<Appear
				id="tips"
				as="section"
				className="py-14"
				duration="duration-500"
				delayClass="delay-200"
			>
				<div className="container mx-auto px-4">
					<Card className="rounded-2xl border border-border bg-card shadow-sm max-w-5xl mx-auto">
						<CardHeader className="pb-3">
							<Badge variant="outline" className="w-fit gap-2">
								<ShieldCheck className="h-4 w-4 text-primary" />
								Boas Práticas
							</Badge>
							<CardTitle className="text-2xl">Recomendações</CardTitle>
							<CardDescription className="text-muted-foreground">
								Dicas para garantir uma experiência consistente e segura
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="text-foreground space-y-2 list-disc pl-6">
								{tips.map((tip) => (
									<li key={tip}>{tip}</li>
								))}
							</ul>
						</CardContent>
					</Card>
				</div>
			</Appear>

			{/* FAQ */}
			<Appear
				id="faq"
				as="section"
				className="container mx-auto px-4 py-14"
				duration="duration-500"
				delayClass="delay-200"
			>
				<div className="text-center mb-8">
					<Badge variant="outline" className="mx-auto mb-3 gap-2">
						<HelpCircle className="w-4 h-4 text-primary" />
						Dúvidas Frequentes
					</Badge>
					<h2 className="text-3xl font-extrabold tracking-tight text-foreground">
						FAQ
					</h2>
				</div>

				<div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
					{faqItems.map((qa) => (
						<Card
							key={qa.question}
							className="rounded-xl border border-border bg-card shadow-sm"
						>
							<CardHeader className="pb-2">
								<CardTitle className="text-base">{qa.question}</CardTitle>
							</CardHeader>
							<CardContent className="pt-0">
								<p className="text-sm text-muted-foreground">{qa.answer}</p>
							</CardContent>
						</Card>
					))}
				</div>
			</Appear>

			{/* Troubleshooting */}
			<Appear
				id="troubleshooting"
				as="section"
				className="py-14"
				duration="duration-500"
				delayClass="delay-200"
			>
				<div className="container mx-auto px-4">
					<Card className="rounded-2xl border border-border bg-card shadow-sm max-w-5xl mx-auto">
						<CardHeader className="pb-3">
							<Badge variant="outline" className="w-fit gap-2">
								<AlertTriangle className="h-4 w-4 text-primary" />
								Resolução de Problemas
							</Badge>
							<CardTitle className="text-2xl">Se algo não funcionar</CardTitle>
							<CardDescription className="text-muted-foreground">
								Ações rápidas para restabelecer o uso normal do sistema
							</CardDescription>
						</CardHeader>
					</Card>
				</div>
			</Appear>

			{/* Privacidade */}
			<Appear
				id="privacy"
				as="section"
				className="container mx-auto px-4 py-14"
				duration="duration-500"
				delayClass="delay-200"
			>
				<Card className="rounded-2xl border border-border bg-card shadow-sm max-w-4xl mx-auto text-center">
					<CardHeader>
						<CardTitle className="text-2xl">{privacy.title}</CardTitle>
						<CardDescription className="text-muted-foreground">
							{privacy.text}
						</CardDescription>
					</CardHeader>
				</Card>
			</Appear>

			{/* CTA Final */}
			<Appear
				id="cta"
				as="section"
				className="py-16"
				duration="duration-500"
				delayClass="delay-250"
			>
				<div className="relative text-center max-w-3xl mx-auto rounded-2xl bg-linear-to-r from-primary to-primary/85 text-primary-foreground shadow-lg ring-1 ring-inset ring-border/30 overflow-hidden p-10 px-6 md:px-20">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_50%)]"
					/>
					<div className="relative">
						<h2 className="text-3xl font-extrabold tracking-tight mb-4">
							{ctaData.title}
						</h2>
						<p className="text-primary-foreground/85 text-lg mb-8 max-w-2xl mx-auto">
							{ctaData.text}
						</p>

						<div className="flex flex-wrap items-center justify-center gap-4">
							{ctaData.buttons.map((btn) => (
								<Button
									key={btn.label}
									render={<Link to={btn.to}>{btn.label}</Link>}
									variant={btn.variant === "outline" ? "outline" : "secondary"}
									className={
										btn.variant === "outline"
											? "text-primary-foreground border-primary-foreground/70 hover:bg-primary-foreground/10"
											: "text-primary shadow-none"
									}
								/>
							))}
						</div>
					</div>
				</div>
			</Appear>
		</div>
	);
}

/* =================================
   Componentes reutilizáveis simples
   ================================= */

function StepCard(props: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	const { icon: Icon, title, description } = props;
	return (
		<Card
			className="group w-full text-left rounded-xl border bg-card p-6 shadow-sm transition-all duration-300
                 border-border ring-1 ring-inset ring-transparent hover:-translate-y-0.5 hover:shadow-md hover:ring-border
                 focus-within:ring-1 focus-within:ring-ring"
		>
			<div className="mb-3 flex items-center gap-3">
				<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted ring-1 ring-inset ring-border">
					<Icon className="h-6 w-6 text-primary" />
				</div>
				<h3 className="text-lg font-bold text-foreground">{title}</h3>
			</div>
			<p className="text-muted-foreground text-sm">{description}</p>
		</Card>
	);
}

/**
 * Appear: wrapper genérico para animar seção ao entrar na viewport.
 * Usa tokens do tema e evita estado global duplicado.
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
			className={[
				className,
				"transition-all",
				duration,
				delayClass,
				visible ? inClass : outClass,
			].join(" ")}
			{...rest}
		>
			{children}
		</Comp>
	);
}

/* ===========
   Dados locais
   =========== */

type ButtonLink = {
	to: string;
	label: string;
	variant?: "default" | "outline";
};

type OverviewCard = {
	icon: LucideIcon;
	title: string;
	description: string;
};

type StepItem = {
	icon: LucideIcon;
	title: string;
	description: string;
};

type QAItem = {
	question: string;
	answer: string;
};

const heroData = {
	badge: "Guia Rápido do SISUB",
	title: "Como usar o SISUB: Previsões e Fiscalização por QR",
	subtitle:
		"Siga este passo a passo para preencher suas previsões de refeições e realizar a fiscalização com segurança e rapidez.",
	primaryButton: { to: "/forecast", label: "Ir para Previsão" } as ButtonLink,
	secondaryButton: {
		to: "/presence",
		label: "Ir para Fiscal",
		variant: "outline",
	} as ButtonLink,
};

const overviewCards: OverviewCard[] = [
	{
		icon: Settings,
		title: "Unidade Padrão",
		description:
			"Aplique a OM padrão aos dias sem unidade para acelerar o preenchimento.",
	},
	{
		icon: CalendarCheck,
		title: "Marque as Refeições",
		description: "Café, almoço, janta e ceia – selecione o que irá consumir.",
	},
	{
		icon: Save,
		title: "Salvamento em Lote",
		description: "Use o botão flutuante para gravar as alterações pendentes.",
	},
];

const ranchoSteps: StepItem[] = [
	{
		icon: QrCode,
		title: "Abra seu QR no cabeçalho",
		description:
			"Na página de Previsão (Rancho), clique no botão com ícone de QR no topo para exibir seu código. É ele que o fiscal irá ler.",
	},
	{
		icon: Settings,
		title: "Defina a Unidade Padrão",
		description:
			'Use "Unidade Padrão" para aplicar rapidamente a OM aos dias sem unidade definida.',
	},
	{
		icon: CalendarCheck,
		title: "Marque as Refeições",
		description:
			"Nos cards de cada dia, ative/desative café, almoço, janta e ceia conforme for consumir.",
	},
	{
		icon: Lock,
		title: "Dias bloqueados (política)",
		description:
			"Por operação do rancho, não é possível editar Hoje, Amanhã e Depois de Amanhã. Planeje-se com antecedência.",
	},
	{
		icon: Save,
		title: "Salve Alterações",
		description:
			'Quando houver pendências, use o botão flutuante "Salvar alterações" para gravar tudo de uma vez.',
	},
	{
		icon: RefreshCw,
		title: "Atualize Previsões",
		description:
			"Se necessário, clique em atualizar para recarregar os dados existentes.",
	},
];

const fiscalSteps: StepItem[] = [
	{
		icon: Camera,
		title: "Permita o Acesso à Câmera",
		description:
			"Ao abrir o leitor, conceda a permissão da câmera. Sem isso, o scanner não inicia.",
	},
	{
		icon: QrCode,
		title: "Escaneie o QR do Militar",
		description:
			"Aponte a câmera para o QR do usuário (obtido pelo botão no cabeçalho da página de Previsão).",
	},
	{
		icon: Info,
		title: "Confira a Previsão",
		description:
			"O sistema mostra a previsão para data, refeição e unidade atuais. Ajuste se necessário.",
	},
	{
		icon: Save,
		title: "Confirme a Presença",
		description:
			'Confirme no diálogo. Com "Fechar Auto." ativo, a confirmação ocorre automaticamente após ~3s.',
	},
	{
		icon: RefreshCw,
		title: "Pausar/Retomar e Atualizar",
		description:
			'Use "Pausar/Ler" para controlar o scanner e o botão de "refresh" se a câmera ficar instável.',
	},
];

const qrReaderTips: string[] = [
	"Prefira a câmera traseira (environment) para melhor foco.",
	"Mantenha o QR visível e bem iluminado.",
	"Com “Fechar Auto.” ativo, a confirmação ocorre automaticamente após alguns segundos.",
	"Use “Pausar/Ler” para alternar o scanner e “refresh” se a câmera ficar instável.",
];

const tips: string[] = [
	"Planeje com antecedência: as edições para Hoje, Amanhã e Depois de Amanhã são bloqueadas.",
	"Sempre confirme a OM antes de salvar as seleções do dia.",
	"Leve seu QR aberto no celular quando chegar ao rancho para agilizar a fiscalização.",
	"Evite redes instáveis ao usar o leitor de QR.",
];

const faqItems: QAItem[] = [
	{
		question: "Onde encontro meu QR para o rancho?",
		answer:
			"Na página de Previsão (Rancho), clique no botão com ícone de QR no cabeçalho. Um diálogo abrirá exibindo o seu QR e o seu ID.",
	},
	{
		question: "Por que não consigo editar dias próximos?",
		answer:
			"Por política operacional do rancho, as edições para Hoje, Amanhã e Depois de Amanhã são bloqueadas, permitindo o preparo adequado das refeições.",
	},
	{
		question: "Minhas alterações não salvaram",
		answer:
			"Verifique se há alterações pendentes e clique em “Salvar alterações”. Aguarde a confirmação antes de sair da página.",
	},
	{
		question: "Sem acesso à câmera",
		answer:
			"Conceda permissão ao navegador nas configurações do site (cadeado na barra de endereço) ou tente outro navegador/dispositivo.",
	},
];

const privacy = {
	title: "Privacidade e Segurança",
	text: "O uso do QR e das previsões deve seguir as normas internas da OM. Em caso de dúvidas sobre dados e acessos, procure o responsável pelo sistema.",
};

const ctaData = {
	title: "Pronto para aplicar?",
	text: "Acesse agora as páginas de Previsão e Fiscalização para colocar em prática os passos deste tutorial.",
	buttons: [
		{ to: "/forecast", label: "Abrir Previsão →", variant: "default" as const },
		{
			to: "/presence",
			label: "Abrir Leitor de QR →",
			variant: "outline" as const,
		},
	] as ButtonLink[],
};
