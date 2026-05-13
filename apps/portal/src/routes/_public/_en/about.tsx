import { createFileRoute } from "@tanstack/react-router"
import { Building, Calendar, Flask, GraduationCap, MapPin, NavArrowDown, OpenNewWindow } from "iconoir-react"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/_public/_en/about")({
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
	"Promover a elevação do nível profissional dos recursos humanos, viabilizando cursos, estágios, treinamentos e outros eventos de capacitação no âmbito do COMAER ou fora dele.",
	"Propor a atualização dos currículos das escolas de formação, atendendo aos requisitos de especialização técnica dos recursos humanos das áreas de Economia, Finanças e Administração sob gestão da SEFA.",
	"Promover o intercâmbio acadêmico com órgãos de ensino e pesquisa, públicos e privados, bem como com as Forças Armadas nacionais e de nações amigas.",
	"Prestar assessoria à SEFA quanto à capacitação técnica de militares e civis, quando da designação para exercerem cargos, encargos, comissões ou funções nas áreas de Economia, Finanças e Administração.",
	"Pesquisar, produzir e disseminar conhecimento em temas de interesse dos sistemas da SEFA.",
	"Contribuir para o avanço da ciência, tecnologia e inovação nas áreas de interesse dos sistemas corporativos da SEFA, bem como nos produtos e serviços de interesse da Defesa.",
	"Contribuir para o fortalecimento do desenvolvimento sustentável e fomentar a indústria nacional.",
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
		icon: Flask,
		sigla: "DFP",
		title: "Divisão de Fomento à Pesquisa",
		description:
			"Planeja, coordena, executa, avalia e controla as atividades de pesquisa e inovação de interesse da SEFA. Coordena a produção científica, acordos de cooperação, propriedade intelectual e transferência de tecnologia.",
		subsections: ["DFP-1 Seção de Pesquisa e Inovação", "DFP-2 Biblioteca", "NGC Núcleos de Gestão do Conhecimento"],
	},
	{
		icon: Building,
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
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero — ocupa toda a primeira tela ─────────────────────────────── */}
			<section
				aria-label="Apresentação institucional do IEFA"
				className="relative w-full
          min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-2.5rem)]
          flex flex-col"
			>
				{/* Conteúdo central */}
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-6 px-4 py-12">
					<div className="flex flex-wrap gap-2 justify-center">
						<Badge variant="outline">Ministério da Defesa</Badge>
						<Badge variant="outline">Comando da Aeronáutica</Badge>
						<Badge variant="outline">SEFA</Badge>
					</div>

					<h1 className="text-hero text-balance">IEFA</h1>

					<p className="text-label text-muted-foreground tracking-[0.2em]">Instituto de Economia, Finanças e Administração da Aeronáutica</p>

					<div className="flex flex-wrap gap-5 justify-center text-sm text-muted-foreground">
						<span className="inline-flex items-center gap-1.5">
							<MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
							Rio de Janeiro — RJ
						</span>
						<span className="inline-flex items-center gap-1.5">
							<Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
							Ativado em janeiro de 2024
						</span>
					</div>
				</div>

				{/* Indicador de scroll */}
				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Seções de conteúdo ─────────────────────────────────────────────── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28">
				{/* ── Missão e Finalidade ─────────────────────────────────────────── */}
				<section aria-labelledby="missao-heading">
					<h2 id="missao-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-8">
						Missão e Finalidade
					</h2>
					<blockquote className="border-l-2 border-foreground pl-6 py-1 text-base sm:text-lg text-muted-foreground italic text-pretty leading-relaxed">
						"Capacitar gestores e agentes da administração do COMAER e fomentar pesquisas nas áreas de Economia, Finanças e Administração da Aeronáutica,
						atuando em todos os temas relacionados aos sistemas sob a égide da Secretaria de Economia, Finanças e Administração da Aeronáutica — SEFA."
					</blockquote>
					<p className="mt-5 text-xs text-muted-foreground">
						Fonte: ROCA 21-120 — Regulamento do IEFA (Art. 1º), aprovado pela Portaria GABAER/GC3 nº 978, de 14 de maio de 2025.
					</p>
				</section>

				{/* ── Em Números ──────────────────────────────────────────────────── */}
				<section aria-labelledby="numeros-heading">
					<h2 id="numeros-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-8">
						Em números
					</h2>
					<div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-border border border-border">
						{STATS.map(({ value, label }) => (
							<div key={label} className="flex flex-col gap-1 px-6 py-8">
								<span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
								<span className="text-xs text-muted-foreground leading-snug text-pretty">{label}</span>
							</div>
						))}
					</div>
				</section>

				{/* ── Histórico ───────────────────────────────────────────────────── */}
				<section aria-labelledby="historico-heading">
					<h2 id="historico-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-8">
						Histórico
					</h2>
					<ol className="flex flex-col" aria-label="Linha do tempo do IEFA">
						{HISTORY_ITEMS.map(({ date, label, description }) => (
							<li key={label} className="flex gap-8 border-t border-border py-7">
								<time className="text-label text-muted-foreground shrink-0 w-20 pt-0.5">{date}</time>
								<div className="flex flex-col gap-1.5">
									<h3 className="font-semibold text-base">{label}</h3>
									<p className="text-sm text-muted-foreground text-pretty leading-relaxed">{description}</p>
								</div>
							</li>
						))}
					</ol>
				</section>

				{/* ── Competências ────────────────────────────────────────────────── */}
				<section aria-labelledby="competencias-heading">
					<div className="mb-8">
						<h2 id="competencias-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Competências
						</h2>
						<p className="text-sm text-muted-foreground">Conforme o Art. 4º do ROCA 21-120 — Regulamento do Instituto.</p>
					</div>

					<ol className="flex flex-col" aria-label="Competências do IEFA">
						{COMPETENCIAS.map((text, idx) => (
							<li key={idx} className="flex items-start gap-8 border-t border-border py-7">
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{String(idx + 1).padStart(2, "0")}.</span>
								<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">{text}</p>
							</li>
						))}
					</ol>
				</section>

				{/* ── Estrutura Organizacional ─────────────────────────────────────── */}
				<section aria-labelledby="estrutura-heading">
					<div className="mb-8">
						<h2 id="estrutura-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Estrutura Organizacional
						</h2>
						<p className="text-sm text-muted-foreground">O IEFA é composto por uma Direção (DIR) e três divisões principais, conforme o ROCA 21-120.</p>
					</div>

					{/* Direção */}
					<div className="mb-5 border border-border bg-card px-5 py-4 flex items-center gap-4">
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

					{/* Divisões */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{DIVISIONS.map(({ icon: Icon, sigla, title, description, subsections }) => (
							<div key={sigla} className="border border-border bg-card flex flex-col p-6 gap-4">
								<div className="flex items-center gap-3">
									<div className="size-9 border border-border bg-muted flex items-center justify-center shrink-0">
										<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
									</div>
									<Badge variant="secondary" className="font-mono text-xs">
										{sigla}
									</Badge>
								</div>
								<h3 className="font-semibold text-base leading-snug">{title}</h3>
								<p className="text-xs text-muted-foreground text-pretty leading-relaxed flex-1">{description}</p>
								<ul className="flex flex-col gap-1.5 pt-4 border-t border-border">
									{subsections.map((s) => (
										<li key={s} className="text-xs text-muted-foreground flex items-start gap-2">
											<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
											{s}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</section>

				{/* ── Links Úteis ─────────────────────────────────────────────────── */}
				<section aria-labelledby="links-heading">
					<h2 id="links-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-8">
						Links úteis
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{EXTERNAL_LINKS.map(({ label, description, href }) => (
							<a
								key={label}
								href={href}
								target="_blank"
								rel="noreferrer noopener"
								className="group flex flex-col gap-1 border border-border bg-card p-5
                  transition-colors hover:bg-accent hover:border-foreground/20
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
								aria-label={`Abrir ${label} em nova aba`}
							>
								<div className="flex items-center justify-between">
									<span className="font-semibold text-sm">{label}</span>
									<OpenNewWindow
										className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
										aria-hidden="true"
									/>
								</div>
								<span className="text-xs text-muted-foreground">{description}</span>
							</a>
						))}
					</div>
				</section>

				{/* ── Fontes ──────────────────────────────────────────────────────── */}
				<footer className="border-t pt-8 pb-4">
					<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
						Informações baseadas nos documentos oficiais: <strong>ROCA 21-120</strong> — Regulamento do IEFA (Portaria GABAER/GC3 nº 978, 14/05/2025) e{" "}
						<strong>RICA 21-355</strong> — Regimento Interno do IEFA (Portaria SEFA/AJUR nº 1250, 07/05/2025). Ministério da Defesa · Comando da Aeronáutica.
					</p>
				</footer>
			</div>
		</div>
	)
}
