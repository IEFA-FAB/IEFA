// routes/_public/tutorial.tsx

import { createFileRoute, Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
	BarChart3,
	BookOpen,
	Building2,
	Calendar,
	CalendarCheck,
	Camera,
	ChefHat,
	ChevronRight,
	FileText,
	HelpCircle,
	Info,
	Lock,
	QrCode,
	RefreshCw,
	Save,
	Settings,
	ShieldCheck,
	ShoppingCart,
	Truck,
	UtensilsCrossed,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoPanel } from "@/components/ui/info-panel"
import { SectionLabel } from "@/components/ui/section-label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/* ========================================================================
   DATA
   ======================================================================== */

type StepItem = { icon: LucideIcon; title: string; description: string }
type QAItem = { question: string; answer: string }

const comensalSteps: StepItem[] = [
	{
		icon: QrCode,
		title: "Seu QR de Acesso",
		description: "Na página de Previsão, clique no ícone de QR no cabeçalho. É este código que o fiscal lê na entrada do refeitório.",
	},
	{
		icon: BookOpen,
		title: "Consulte o Cardápio",
		description: "Veja o que será servido antes de marcar. O cardápio é planejado pelo nutricionista da sua cozinha.",
	},
	{
		icon: CalendarCheck,
		title: "Marque as Refeições",
		description: 'Nos cards de cada dia, ative café, almoço, janta ou ceia conforme o que for consumir. Use "Unidade Padrão" para preencher rapidamente.',
	},
	{
		icon: Lock,
		title: "Dias Bloqueados",
		description: "Hoje, amanhã e depois de amanhã não podem ser editados. O rancho precisa de antecedência para planejar a produção.",
	},
	{
		icon: Save,
		title: "Salve as Alterações",
		description: 'Use o botão flutuante "Salvar alterações" para gravar tudo de uma vez. Aguarde a confirmação antes de sair da página.',
	},
]

const fiscalSteps: StepItem[] = [
	{
		icon: Camera,
		title: "Permita o Acesso à Câmera",
		description: "Ao abrir o leitor, conceda permissão da câmera ao navegador. Sem isso, o scanner não inicia.",
	},
	{
		icon: QrCode,
		title: "Leia o QR do Comensal",
		description: "Aponte a câmera para o QR exibido pelo militar. O sistema valida a previsão para a refeição e unidade atuais.",
	},
	{
		icon: Info,
		title: "Confira a Previsão",
		description: "Verifique se o comensal tem previsão registrada para a refeição corrente. Ajuste os dados se necessário.",
	},
	{
		icon: Save,
		title: "Confirme a Presença",
		description: 'Confirme o acesso no diálogo. Com "Fechar Auto." ativo, a confirmação ocorre automaticamente após ~3s.',
	},
	{
		icon: RefreshCw,
		title: "Controle o Scanner",
		description: 'Use "Pausar/Ler" para alternar o scanner. Se a câmera ficar instável, use o botão de "refresh".',
	},
]

const qrTips: string[] = [
	"Prefira a câmera traseira (environment) para melhor foco.",
	"Mantenha o QR do comensal visível e bem iluminado.",
	'Com "Fechar Auto." ativo, a confirmação ocorre automaticamente após alguns segundos.',
	"Em caso de falha na câmera, tente outro navegador ou recarregue a página.",
]

const kitchenSteps: StepItem[] = [
	{
		icon: CalendarCheck,
		title: "Crie Templates Semanais",
		description: "Monte cardápios de 7 dias com as preparações de cada refeição. Templates podem ser reutilizados e aplicados ao longo do mês.",
	},
	{
		icon: BookOpen,
		title: "Gerencie Receitas",
		description:
			"Cadastre preparações com modo de preparo, ingredientes e informações nutricionais. Use receitas globais ou crie versões locais para sua cozinha.",
	},
	{
		icon: Calendar,
		title: "Planeje o Calendário Mensal",
		description: "Aplique templates ao calendário de produção. Visualize o mês completo e ajuste conforme a necessidade operacional.",
	},
	{
		icon: Info,
		title: "Equilíbrio Nutricional",
		description: "Verifique os nutrientes planejados por dia e refeição. Ajuste preparações para atender aos requisitos da tropa.",
	},
	{
		icon: RefreshCw,
		title: "Adapte Receitas Globais",
		description: "Faça fork de receitas padronizadas pelo SDAB para a realidade da sua cozinha, mantendo o vínculo com a versão original.",
	},
]

const unitSteps: StepItem[] = [
	{
		icon: FileText,
		title: "Gere a Lista de Necessidades",
		description: "A partir do planejamento das cozinhas da sua OM, gere automaticamente a lista de insumos necessários para o período.",
	},
	{
		icon: ShoppingCart,
		title: "Sincronize com o ComprasGov",
		description: "Consulte preços, pregões e atas de registro de preço vigentes diretamente do sistema federal de compras.",
	},
	{
		icon: Info,
		title: "Verifique Preços e Pregões",
		description: "Acompanhe os preços praticados nas atas e pregões para garantir aquisições dentro dos parâmetros legais e orçamentários.",
	},
	{
		icon: Save,
		title: "Emita Pedidos de Empenho",
		description: "Com as necessidades consolidadas e preços verificados, formalize os pedidos de empenho diretamente pelo módulo.",
	},
]

const faqItems: QAItem[] = [
	{
		question: "Onde encontro meu QR para o rancho?",
		answer: "Na página de Previsão (aba Comensal), clique no ícone de QR no cabeçalho. Um diálogo exibirá seu código e seu ID.",
	},
	{
		question: "Por que não consigo editar dias próximos?",
		answer: "Por política operacional, edições para hoje, amanhã e depois de amanhã são bloqueadas para garantir o preparo adequado das refeições.",
	},
	{
		question: "Como acesso um módulo diferente?",
		answer:
			"Acesse o hub de módulos após o login e selecione o módulo correspondente ao seu perfil. O acesso depende das permissões atribuídas ao seu usuário.",
	},
	{
		question: "Quem gerencia as permissões de acesso?",
		answer: "As permissões são gerenciadas pelos administradores no módulo Global. Em caso de acesso negado, contate o responsável pelo sistema na sua OM.",
	},
	{
		question: "Como sincronizar com o ComprasGov?",
		answer:
			"No módulo Unidade, acesse a seção de Compras e use o botão de sincronização. Certifique-se de que sua OM está configurada corretamente no módulo Global.",
	},
	{
		question: "Minhas alterações não foram salvas.",
		answer: "Confirme que o botão de salvar foi acionado e aguarde a mensagem de sucesso antes de sair da página.",
	},
	{
		question: "Página em branco ou erro ao carregar.",
		answer: "Recarregue o navegador (F5). Se persistir, limpe o cache ou acesse por uma aba anônima.",
	},
	{
		question: "Câmera não inicia no leitor de QR.",
		answer: "Verifique as permissões de câmera nas configurações do site (cadeado na barra de endereço) ou tente outro navegador.",
	},
	{
		question: "Módulo não aparece no hub.",
		answer: "Seu usuário pode não ter permissão para esse módulo. Contate o administrador da sua OM para verificar o acesso.",
	},
]

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

export const Route = createFileRoute("/_public/tutorial")({
	component: Tutorial,
	head: () => ({
		meta: [
			{ title: "Tutorial — SISUB" },
			{
				name: "description",
				content: "Guia rápido do SISUB por perfil: comensal, fiscal, nutricionista e gestor de OM.",
			},
		],
	}),
})

/* ========================================================================
   STEP LIST
   ======================================================================== */

function StepList({ steps }: { steps: StepItem[] }) {
	return (
		<div className="divide-y divide-border">
			{steps.map((step, i) => {
				const Icon = step.icon
				return (
					<div key={step.title} className="flex items-start gap-5 py-5 stagger-item">
						<span className="font-mono text-3xl font-bold text-muted-foreground/50 tabular-nums leading-none min-w-[2.5rem]">
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
	)
}

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */

function Tutorial() {
	return (
		<div className="w-full">
			{/* Hero */}
			<section className="pt-14 pb-10 animate-fade-slide-in">
				<p className="font-mono text-xs text-muted-foreground/60 tracking-[0.2em] uppercase mb-6">Sistema de Subsistência · Força Aérea Brasileira</p>
				<h1 className="text-6xl md:text-7xl font-bold tracking-tight leading-[0.95] text-foreground mb-6">
					Guia
					<br />
					<span className="text-primary">do SISUB.</span>
				</h1>
				<p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-sm md:max-w-md">
					Selecione seu perfil e veja o que você precisa saber para operar o sistema.
				</p>
			</section>

			{/* Tabs */}
			<section className="border-t border-border">
				<Tabs defaultValue="comensal" className="w-full">
					<TabsList className="w-full mt-6 mb-2">
						<TabsTrigger value="comensal" className="gap-1.5" aria-label="Comensal">
							<UtensilsCrossed className="h-3.5 w-3.5 shrink-0" aria-hidden />
							<span className="hidden sm:inline">Comensal</span>
						</TabsTrigger>
						<TabsTrigger value="refeitorio" className="gap-1.5" aria-label="Refeitório">
							<Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
							<span className="hidden sm:inline">Refeitório</span>
						</TabsTrigger>
						<TabsTrigger value="cozinha" className="gap-1.5" aria-label="Cozinha">
							<ChefHat className="h-3.5 w-3.5 shrink-0" aria-hidden />
							<span className="hidden sm:inline">Cozinha</span>
						</TabsTrigger>
						<TabsTrigger value="unidade" className="gap-1.5" aria-label="Unidade">
							<Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
							<span className="hidden sm:inline">Unidade</span>
						</TabsTrigger>
						<TabsTrigger value="duvidas" className="gap-1.5" aria-label="Dúvidas">
							<HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
							<span className="hidden sm:inline">Dúvidas</span>
						</TabsTrigger>
					</TabsList>

					{/* Comensal */}
					<TabsContent value="comensal" className="pt-6 pb-16">
						<StepList steps={comensalSteps} />
					</TabsContent>

					{/* Refeitório */}
					<TabsContent value="refeitorio" className="pt-6 pb-16">
						<StepList steps={fiscalSteps} />
						<Card className="mt-8">
							<CardHeader>
								<CardTitle className="text-sm">Dicas para o leitor de QR</CardTitle>
							</CardHeader>
							<CardContent>
								<ul className="divide-y divide-border">
									{qrTips.map((tip) => (
										<li key={tip} className="py-2.5 text-sm text-muted-foreground leading-relaxed">
											{tip}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					</TabsContent>

					{/* Cozinha */}
					<TabsContent value="cozinha" className="pt-6 pb-16">
						<StepList steps={kitchenSteps} />
					</TabsContent>

					{/* Unidade */}
					<TabsContent value="unidade" className="pt-6 pb-16">
						<StepList steps={unitSteps} />
					</TabsContent>

					{/* Dúvidas */}
					<TabsContent value="duvidas" className="pt-6 pb-16">
						<div className="divide-y divide-border">
							{faqItems.map((qa) => (
								<div key={qa.question} className="py-5">
									<h3 className="font-bold text-sm text-foreground mb-1">{qa.question}</h3>
									<p className="text-sm text-muted-foreground leading-relaxed">{qa.answer}</p>
								</div>
							))}
						</div>
					</TabsContent>
				</Tabs>
			</section>

			{/* Saiba mais */}
			<section id="saiba-mais" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="01" label="Saiba mais" />
				<div className="mt-8 grid md:grid-cols-2 gap-4">
					<InfoPanel
						icon={FileText}
						label="Novidades"
						title="Changelog"
						description="Acompanhe as melhorias, correções e novas funcionalidades em tempo real."
						tags={["feat", "fix", "docs", "perf"]}
						to="/changelog"
						cta="Ver Changelog"
					/>
					<InfoPanel
						icon={BarChart3}
						label="Hub de módulos"
						title="Painel Principal"
						description="Acesse o hub para navegar entre os módulos disponíveis para o seu perfil."
						tags={["comensal", "fiscal", "nutricionista", "gestor"]}
						to="/hub"
						cta="Ir para o Hub"
					/>
				</div>
			</section>

			{/* CTA */}
			<section id="acesso" className="py-12 md:py-16 border-t border-border">
				<SectionLabel index="02" label="Acesso" />
				<div className="mt-8 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
					<h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
						Pronto para
						<br />
						operar?
					</h2>
					<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
						<Button
							nativeButton={false}
							render={
								<Link to="/hub" className="flex items-center gap-2">
									Ir para o Hub
									<ChevronRight className="h-4 w-4" />
								</Link>
							}
						/>
						<div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
							<span className="flex items-center gap-1.5">
								<ShieldCheck className="h-3.5 w-3.5" aria-hidden />
								Seguro
							</span>
							<span className="flex items-center gap-1.5">
								<Settings className="h-3.5 w-3.5" aria-hidden />
								Multi-módulo
							</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}
