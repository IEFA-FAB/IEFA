import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, BookOpen, Building2, Calendar, ExternalLink, FlaskConical, GraduationCap, MapPin, Microscope, Shield, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export const Route = createFileRoute("/_public/about")({
	component: About,
	head: () => ({
		meta: [
			{ title: "Sobre o IEFA | Portal IEFA" },
			{
				name: "description",
				content: "Conheça o Instituto de Economia, Finanças e Administração da Aeronáutica — sua história, missão, competências, estrutura e atuação.",
			},
		],
	}),
})

const HISTORY_ITEMS = [
	{
		date: "Out 2023",
		label: "Criação",
		description:
			"O IEFA foi criado pela Portaria GABAER nº 592/GC3, de 16 de outubro de 2023, assinada pelo Comandante da Aeronáutica Ten Brig Ar Marcelo Kanitz Damasceno.",
	},
	{
		date: "Jan 2024",
		label: "Ativação",
		description: "O Instituto foi ativado em 2 de janeiro de 2024, iniciando suas operações de ensino e pesquisa no Rio de Janeiro — RJ.",
	},
	{
		date: "Dez 2024",
		label: "Reconhecimento como ICT",
		description: "O IEFA foi reconhecido como Instituição Científica, Tecnológica e de Inovação (ICT) pelo DCTA, publicado no BCA nº 222 de dezembro de 2024.",
	},
	{
		date: "Mai 2025",
		label: "Novo Regulamento",
		description:
			"Aprovação do novo ROCA 21-120 e RICA 21-355, atualizando o Regulamento e o Regimento Interno do Instituto para refletir sua maturidade institucional.",
	},
]

const COMPETENCIAS = [
	{
		icon: GraduationCap,
		text: "Promover a elevação do nível profissional dos recursos humanos, viabilizando cursos, estágios, treinamentos e outros eventos de capacitação no âmbito do COMAER ou fora dele.",
	},
	{
		icon: BookOpen,
		text: "Propor a atualização dos currículos das escolas de formação, atendendo aos requisitos de especialização técnica dos recursos humanos das áreas de Economia, Finanças e Administração sob gestão da SEFA.",
	},
	{
		icon: Users,
		text: "Promover o intercâmbio acadêmico com órgãos de ensino e pesquisa, públicos e privados, bem como com as Forças Armadas nacionais e de nações amigas.",
	},
	{
		icon: Shield,
		text: "Prestar assessoria à SEFA quanto à capacitação técnica de militares e civis, quando da designação para exercerem cargos, encargos, comissões ou funções nas áreas de Economia, Finanças e Administração.",
	},
	{
		icon: Microscope,
		text: "Pesquisar, produzir e disseminar conhecimento em temas de interesse dos sistemas da SEFA.",
	},
	{
		icon: FlaskConical,
		text: "Contribuir para o avanço da ciência, tecnologia e inovação nas áreas de interesse dos sistemas corporativos da SEFA, bem como nos produtos e serviços de interesse da Defesa.",
	},
	{
		icon: Building2,
		text: "Contribuir para o fortalecimento do desenvolvimento sustentável e fomentar a indústria nacional.",
	},
]

const DIVISIONS = [
	{
		icon: GraduationCap,
		sigla: "DE",
		title: "Divisão de Ensino",
		description:
			"Planeja, coordena, executa, avalia e controla as atividades de ensino e treinamento sob responsabilidade do IEFA. Gerencia o Sistema de Gerenciamento da Capacitação (SGC) e os processos de certificação.",
		subsections: ["DE-1 Seção de Planejamento", "DE-2 Seção de Execução", "DE-3 Seção de Avaliação e Controle"],
	},
	{
		icon: FlaskConical,
		sigla: "DFP",
		title: "Divisão de Fomento à Pesquisa",
		description:
			"Planeja, coordena, executa, avalia e controla as atividades de pesquisa e inovação de interesse da SEFA. Coordena a produção científica, acordos de cooperação, propriedade intelectual e transferência de tecnologia.",
		subsections: ["DFP-1 Seção de Pesquisa e Inovação", "DFP-2 Biblioteca", "NGC Núcleos de Gestão do Conhecimento"],
	},
	{
		icon: Building2,
		sigla: "DA",
		title: "Divisão Administrativa",
		description:
			"Executa as atividades necessárias ao funcionamento do IEFA — gestão de recursos humanos, orçamento, finanças, patrimônio e infraestrutura — em coordenação com o Gabinete da DIRAD.",
		subsections: ["DA-1 Seção de Apoio ao Ensino", "DA-2 Seção de Gestão de Recursos de Ensino"],
	},
]

const STATS = [
	{ value: "+850", label: "Militares capacitados no 1º ano" },
	{ value: "10", label: "Cursos realizados em 2024" },
	{ value: "ICT", label: "Reconhecimento pelo DCTA" },
	{ value: "RJ", label: "Sede: Rio de Janeiro" },
]

const EXTERNAL_LINKS = [
	{
		label: "IEFA Virtual",
		description: "Plataforma EaD oficial do IEFA",
		href: "https://iefavirtual.educaer.fab.mil.br/",
	},
	{
		label: "Força Aérea Brasileira",
		description: "Portal oficial da FAB",
		href: "https://www.fab.mil.br/",
	},
	{
		label: "SEFA",
		description: "Secretaria de Economia, Finanças e Administração da Aeronáutica",
		href: "https://www.fab.mil.br/sefa",
	},
]

function About() {
	return (
		<div className="relative flex flex-col w-full text-foreground gap-14 md:gap-16">
			{/* ─── Voltar ────────────────────────────────────────────────────────────── */}
			<div>
				<Button
					render={
						<Link to="/" className="inline-flex items-center gap-2">
							<ArrowLeft className="h-4 w-4" aria-hidden="true" />
							Início
						</Link>
					}
					variant="ghost"
					size="sm"
					className="-ml-2"
				/>
			</div>

			{/* ─── Cabeçalho institucional ───────────────────────────────────────────── */}
			<header className="flex flex-col gap-4">
				<div className="flex flex-wrap gap-2">
					<Badge variant="outline" className="text-xs font-normal">
						Ministério da Defesa
					</Badge>
					<Badge variant="outline" className="text-xs font-normal">
						Comando da Aeronáutica
					</Badge>
					<Badge variant="outline" className="text-xs font-normal">
						SEFA
					</Badge>
				</div>

				<h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-balance">
					Instituto de Economia, Finanças e Administração da Aeronáutica
				</h1>

				<p className="text-lg sm:text-xl text-muted-foreground font-medium">IEFA</p>

				<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
						Rio de Janeiro — RJ
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
						Ativado em janeiro de 2024
					</span>
				</div>
			</header>

			<Separator />

			{/* ─── Missão e Finalidade ───────────────────────────────────────────────── */}
			<section aria-labelledby="missao-heading">
				<h2 id="missao-heading" className="text-xl md:text-2xl font-bold tracking-tight mb-4">
					Missão e Finalidade
				</h2>
				<blockquote
					className="border-l-4 border-primary pl-6 py-1
            text-base sm:text-lg text-muted-foreground italic text-pretty leading-relaxed"
				>
					"Capacitar gestores e agentes da administração do COMAER e fomentar pesquisas nas áreas de Economia, Finanças e Administração da Aeronáutica, atuando
					em todos os temas relacionados aos sistemas sob a égide da Secretaria de Economia, Finanças e Administração da Aeronáutica — SEFA."
				</blockquote>
				<p className="mt-3 text-xs text-muted-foreground">
					Fonte: ROCA 21-120 — Regulamento do IEFA (Art. 1º), aprovado pela Portaria GABAER/GC3 nº 978, de 14 de maio de 2025.
				</p>
			</section>

			{/* ─── Em Números ───────────────────────────────────────────────────────── */}
			<section aria-labelledby="numeros-heading">
				<h2 id="numeros-heading" className="text-xl md:text-2xl font-bold tracking-tight mb-6">
					Em números
				</h2>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
					{STATS.map(({ value, label }) => (
						<Card key={label} className="border border-border bg-card/60 text-center">
							<CardContent className="pt-6 pb-5 flex flex-col gap-1">
								<span className="text-3xl font-bold text-primary">{value}</span>
								<span className="text-xs text-muted-foreground leading-snug">{label}</span>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			{/* ─── Histórico ─────────────────────────────────────────────────────────── */}
			<section aria-labelledby="historico-heading">
				<h2 id="historico-heading" className="text-xl md:text-2xl font-bold tracking-tight mb-6">
					Histórico
				</h2>
				<ol className="relative border-l border-border ml-3 flex flex-col gap-8" aria-label="Linha do tempo do IEFA">
					{HISTORY_ITEMS.map(({ date, label, description }) => (
						<li key={label} className="pl-8 relative">
							<span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-background" aria-hidden="true" />
							<time className="text-xs font-semibold uppercase tracking-wider text-primary">{date}</time>
							<h3 className="mt-1 font-semibold text-base">{label}</h3>
							<p className="mt-1 text-sm text-muted-foreground text-pretty leading-relaxed">{description}</p>
						</li>
					))}
				</ol>
			</section>

			{/* ─── Competências ──────────────────────────────────────────────────────── */}
			<section aria-labelledby="competencias-heading">
				<h2 id="competencias-heading" className="text-xl md:text-2xl font-bold tracking-tight mb-2">
					Competências
				</h2>
				<p className="text-sm text-muted-foreground mb-6">Conforme o Art. 4º do ROCA 21-120 — Regulamento do Instituto.</p>
				<ul className="flex flex-col gap-4" aria-label="Competências do IEFA">
					{COMPETENCIAS.map(({ icon: Icon, text }, idx) => (
						<li key={idx} className="flex items-start gap-4">
							<div className="mt-0.5 rounded-lg bg-primary/10 p-2 shrink-0">
								<Icon className="h-4 w-4 text-primary" aria-hidden="true" />
							</div>
							<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">
								<span className="font-semibold text-foreground mr-1">{String(idx + 1).padStart(2, "0")}.</span>
								{text}
							</p>
						</li>
					))}
				</ul>
			</section>

			{/* ─── Estrutura Organizacional ──────────────────────────────────────────── */}
			<section aria-labelledby="estrutura-heading">
				<h2 id="estrutura-heading" className="text-xl md:text-2xl font-bold tracking-tight mb-2">
					Estrutura Organizacional
				</h2>
				<p className="text-sm text-muted-foreground mb-6">O IEFA é composto por uma Direção (DIR) e três divisões principais, conforme o ROCA 21-120.</p>

				{/* Direção */}
				<div className="mb-4 rounded-xl border border-border bg-card/60 px-5 py-4">
					<div className="flex items-center gap-3">
						<Badge variant="secondary" className="shrink-0 font-mono text-xs">
							DIR
						</Badge>
						<div>
							<p className="font-semibold text-sm">Direção</p>
							<p className="text-xs text-muted-foreground">
								Assessorada pela CAP, CE, ACI, AIJ e Secretaria — exercida por Coronel do Quadro de Oficiais Intendentes
							</p>
						</div>
					</div>
				</div>

				{/* Divisões */}
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					{DIVISIONS.map(({ icon: Icon, sigla, title, description, subsections }) => (
						<Card key={sigla} className="border border-border bg-card/60 flex flex-col">
							<CardHeader className="pb-2">
								<div className="flex items-center gap-2 mb-1">
									<div className="rounded-lg bg-primary/10 p-2">
										<Icon className="h-4 w-4 text-primary" aria-hidden="true" />
									</div>
									<Badge variant="secondary" className="font-mono text-xs">
										{sigla}
									</Badge>
								</div>
								<CardTitle className="text-base leading-snug">{title}</CardTitle>
							</CardHeader>
							<CardContent className="flex flex-col gap-3 flex-1">
								<p className="text-xs text-muted-foreground text-pretty leading-relaxed">{description}</p>
								<ul className="flex flex-col gap-1 mt-auto pt-2 border-t border-border/50">
									{subsections.map((s) => (
										<li key={s} className="text-xs text-muted-foreground flex items-start gap-1.5">
											<span className="mt-1.5 h-1 w-1 rounded-full bg-primary/60 shrink-0" aria-hidden="true" />
											{s}
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					))}
				</div>
			</section>

			{/* ─── Links Úteis ───────────────────────────────────────────────────────── */}
			<section aria-labelledby="links-heading">
				<h2 id="links-heading" className="text-xl md:text-2xl font-bold tracking-tight mb-6">
					Links úteis
				</h2>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					{EXTERNAL_LINKS.map(({ label, description, href }) => (
						<a
							key={label}
							href={href}
							target="_blank"
							rel="noreferrer noopener"
							className="group flex flex-col gap-1 rounded-xl border border-border bg-card/60 p-5
                transition-all hover:border-foreground hover:-translate-x-0.5 hover:-translate-y-0.5
                hover:shadow-[3px_3px_0_0_var(--foreground)] focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-ring/50"
							aria-label={`Abrir ${label} em nova aba`}
						>
							<div className="flex items-center justify-between">
								<span className="font-semibold text-sm">{label}</span>
								<ExternalLink
									className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
									aria-hidden="true"
								/>
							</div>
							<span className="text-xs text-muted-foreground">{description}</span>
						</a>
					))}
				</div>
			</section>

			{/* ─── Fontes ────────────────────────────────────────────────────────────── */}
			<footer className="border-t pt-6">
				<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
					Informações baseadas nos documentos oficiais: <strong>ROCA 21-120</strong> — Regulamento do IEFA (Portaria GABAER/GC3 nº 978, 14/05/2025) e{" "}
					<strong>RICA 21-355</strong> — Regimento Interno do IEFA (Portaria SEFA/AJUR nº 1250, 07/05/2025). Ministério da Defesa · Comando da Aeronáutica.
				</p>
			</footer>
		</div>
	)
}
