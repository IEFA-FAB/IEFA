import { createFileRoute } from "@tanstack/react-router"
import { Brain, Code, Flask, LightBulb, NavArrowDown, OpenNewWindow } from "iconoir-react"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/_public/research")({
	staticData: {
		nav: {
			title: "Pesquisa & Inovação",
			section: "Portal",
			subtitle: "Linhas de pesquisa, áreas temáticas e banco de temas do IEFA",
			keywords: ["pesquisa", "inovação", "linhas", "ict", "sefa", "dfp"],
			order: 30,
		},
	},
	component: Research,
	head: () => ({
		meta: [
			{ title: "Pesquisa & Inovação | Portal IEFA" },
			{
				name: "description",
				content:
					"Conheça as linhas de pesquisa, áreas temáticas e projetos de pesquisa fomentados pelo Instituto de Economia, Finanças e Administração da Aeronáutica (IEFA).",
			},
		],
	}),
})

/* ─── Dados estáticos ─────────────────────────────────────────────────────── */

const STATS = [
	{ value: "5", label: "Áreas Temáticas" },
	{ value: "18", label: "Linhas de Pesquisa" },
	{ value: "4", label: "Áreas Tecnológicas" },
	{ value: "9", label: "Temas no Banco" },
]

const SUBTEMAS = [
	{ area: "Apoio Administrativo", subtema: "Pagamento de Pessoal" },
	{ area: "Apoio Administrativo", subtema: "Subsistência" },
	{ area: "Apoio Administrativo", subtema: "Transporte" },
	{ area: "Apoio Administrativo", subtema: "Imobiliário Funcional" },
	{ area: "Apoio Administrativo", subtema: "Contratações e Parcerias" },
	{ area: "Apoio Administrativo", subtema: "Suprimento" },
	{ area: "Apoio Administrativo", subtema: "Provisão e Material de Intendência" },
	{ area: "Apoio Administrativo", subtema: "Logística de Campanha" },
	{ area: "Apoio Administrativo", subtema: "Encargos Assistenciais" },
	{ area: "Execução Orçamentária, Financeira, Patrimonial e Contábil", subtema: "Orçamento" },
	{ area: "Execução Orçamentária, Financeira, Patrimonial e Contábil", subtema: "Finanças" },
	{ area: "Execução Orçamentária, Financeira, Patrimonial e Contábil", subtema: "Patrimônio" },
	{ area: "Execução Orçamentária, Financeira, Patrimonial e Contábil", subtema: "Contabilidade" },
	{ area: "Execução Orçamentária, Financeira, Patrimonial e Contábil", subtema: "Aquisição e Custos" },
]

const AREAS_TEMATICAS = [
	"Execução Orçamentária, Financeira, Patrimonial e Contábil (Orçamento, Finanças, Patrimônio, Contabilidade e Custos)",
	"Logística Pública e Militar (Logística de Campanha, Suprimento, Provisão, Material de Intendência, Contratações, Parcerias e Aquisições)",
	"Administração Pública e Apoio Administrativo (Pagamento de Pessoal, Subsistência, Transporte, Imobiliário Funcional, e Encargos Assistenciais)",
	"Gestão da Inovação",
	"Outras áreas aprovadas pelo Secretário de Economia, Finanças e Administração da Aeronáutica",
]

const LINHAS_PESQUISA = [
	"A modernização dos sistemas da SEFA",
	"Automação de Processos Administrativos e Financeiros",
	"O aprimoramento da governança e eficiência administrativa",
	"O desenvolvimento de soluções tecnológicas e digitais aplicadas à gestão pública",
	"Gestão de Riscos e Previsão Orçamentária com uso de IA",
	"Estratégias de Contratação Pública com Apoio Tecnológico",
	"O uso de dados, IA e automação para apoio à decisão",
	"Ciência de Dados aplicada à gestão",
	"Inteligência Artificial aplicada à gestão",
	"Tecnologia da Informação aplicada à Gestão Pública",
	"A sustentabilidade logística e econômica das operações",
	"Planejamento, Execução e Controle da Logística Militar",
	"Logística Reversa e Sustentabilidade Logística",
	"Automação Logística e Otimização de Cadeias de Suprimento",
	"Inovação em governança, contratações, parcerias e processos orçamentários",
	"Inovação na Administração Pública e Modelos de Gestão Pública Inovadora",
	"Gestão e/ou inovação do desenvolvimento, produção ou padronização de uniformes e equipamentos",
	"Outras atividades aprovadas pelo Secretário de Economia, Finanças e Administração da Aeronáutica",
]

const AREAS_TECNOLOGICAS = [
	{
		icon: Brain,
		sigla: "IA",
		title: "Inteligência Artificial",
		description:
			"Inclui Aprendizado de Máquina (Machine Learning), Automação Robótica de Processos (RPA) e Processamento de Linguagem Natural (PLN), aplicados à modernização dos processos administrativos e financeiros do COMAER.",
		tags: ["Machine Learning", "RPA", "PLN / NLP"],
	},
	{
		icon: Code,
		sigla: "AD",
		title: "Análise Avançada de Dados",
		description:
			"Abrange análise em contexto de Big Data, análises preditivas e prescritivas, gestão de grandes volumes de dados e ciência de dados aplicadas à gestão pública e ao apoio à decisão.",
		tags: ["Big Data", "Análise Preditiva", "Ciência de Dados"],
	},
	{
		icon: Flask,
		sigla: "MA",
		title: "Manufatura Avançada",
		description:
			"Automação industrial voltada à automação logística e à otimização de cadeias de suprimento, contribuindo para maior eficiência nas operações de apoio logístico do Comando da Aeronáutica.",
		tags: ["Automação Industrial", "Logística", "Cadeias de Suprimento"],
	},
	{
		icon: LightBulb,
		sigla: "MTA",
		title: "Materiais Avançados",
		description:
			"Foco em camuflagem multiespectral, voltada à gestão e/ou inovação no desenvolvimento, produção ou padronização de uniformes e equipamentos de interesse da Defesa Nacional.",
		tags: ["Camuflagem Multiespectral", "Uniformes", "Equipamentos"],
	},
]

const BASE_FICHA = "https://www2.fab.mil.br/iefa/images/artigos/"

const BANCO_TEMAS = [
	{
		id: 1,
		title: "Copiloto baseado em Large Language Model (LLM) para Redação e Gestão de Documentos Licitatórios",
		href: `${BASE_FICHA}1-Banco_de_Temas_LLM_Processosdocx.pdf`,
		tags: ["LLM", "Contratações"],
	},
	{
		id: 2,
		title: "Otimização da Gestão de Níveis de Estoque com Modelos Preditivos de Machine Learning",
		href: `${BASE_FICHA}2-Banco_de_Temas_Niveis_de_estoque-MachineLearningdocx.pdf`,
		tags: ["Machine Learning", "Suprimento"],
	},
	{
		id: 3,
		title: "Otimização do Planejamento Orçamentário com uso de IA",
		href: `${BASE_FICHA}3-Banco_de_Temas_-_Planejamento_Oramentriodocx.pdf`,
		tags: ["IA", "Orçamento"],
	},
	{
		id: 4,
		title: "Automatização dos Lançamentos Contábeis no SIAFI com RPA",
		href: `${BASE_FICHA}4-Banco_de_Temas_-_automatizaao_de_lanamentos_contabeisdocx.pdf`,
		tags: ["RPA", "Contabilidade", "SIAFI"],
	},
	{
		id: 5,
		title: "Copiloto baseado em LLM para Gestão e Fiscalização de Contratos",
		href: `${BASE_FICHA}5-Banco_de_Temas_LLM_-_Gesto_e_Fiscalizao_de_contratosdocx.pdf`,
		tags: ["LLM", "Contratos"],
	},
	{
		id: 6,
		title: "Implementação de Chatbot para Atendimento aos Permissionários de PNR",
		href: `${BASE_FICHA}6-Banco_de_Temas_ChatBOT-AtendimentoPermissionariosPNRdocx.pdf`,
		tags: ["Chatbot", "PNR", "Atendimento"],
	},
	{
		id: 7,
		title: "Aplicação de RPA no Controle de Prestação de Contas de Diárias e Passagens",
		href: `${BASE_FICHA}7-Banco_de_Temas_RPA-PrestContas-Diarias_e_Passagensdocx.pdf`,
		tags: ["RPA", "Diárias", "Passagens"],
	},
	{
		id: 8,
		title: "Gestão de Riscos na Execução Orçamentária com Apoio de IA",
		href: `${BASE_FICHA}8-Banco_de_Temas_-_Gesto_de_Riscos_na_execuo_oramentariadocx.pdf`,
		tags: ["IA", "Gestão de Riscos", "Orçamento"],
	},
	{
		id: 9,
		title: "Sistema Inteligente de Apoio à Gestão da Frota Administrativa",
		href: `${BASE_FICHA}9-Banco_de_Temas_-_Gestao-Frotadocx.pdf`,
		tags: ["IA", "Frota", "Gestão"],
	},
]

/* ─── Componente ──────────────────────────────────────────────────────────── */

function Research() {
	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero ──────────────────────────────────────────────────────────── */}
			<section
				aria-label="Pesquisa e Inovação no IEFA"
				className="relative w-full
          min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-2.5rem)]
          flex flex-col"
			>
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-6 px-4 py-12">
					<div className="flex flex-wrap gap-2 justify-center">
						<Badge variant="outline">IEFA</Badge>
						<Badge variant="outline">ICT</Badge>
						<Badge variant="outline">SEFA</Badge>
						<Badge variant="outline">DFP</Badge>
					</div>

					<h1 className="text-hero text-balance">Pesquisa & Inovação</h1>

					<p className="text-label text-muted-foreground tracking-[0.2em]">Divisão de Fomento à Pesquisa — IEFA</p>

					<p className="max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed text-pretty">
						Produção e disseminação de conhecimento técnico-científico voltado para a melhoria contínua dos sistemas sob a gestão da SEFA, em alinhamento com a
						Política Nacional de Ciência, Tecnologia e Inovação e o Marco Legal da Inovação.
					</p>
				</div>

				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Seções de conteúdo ────────────────────────────────────────────── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28">
				{/* ── Inovação na SEFA ──────────────────────────────────────────────── */}
				<section aria-labelledby="inovacao-heading">
					<div className="mb-8">
						<h2 id="inovacao-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Inovação na SEFA
						</h2>
						<p className="text-sm text-muted-foreground">
							Alinhada à <strong>Visão Estratégica de Futuro da SEFA</strong> e à <strong>Concepção Estratégica Força Aérea 100</strong>.
						</p>
					</div>

					<blockquote className="border-l-2 border-foreground pl-6 py-1 text-base sm:text-lg text-muted-foreground italic text-pretty leading-relaxed mb-8">
						"A inovação impulsiona a modernização administrativa e reforça a capacidade da SEFA de prover soluções eficientes e sustentáveis para a gestão dos
						recursos públicos da Aeronáutica."
					</blockquote>

					<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">
						A gestão da inovação na SEFA desempenha papel essencial no aprimoramento contínuo dos processos administrativos e financeiros do Comando da
						Aeronáutica. Focada em eficiência e excelência, a Secretaria promove a transformação digital, a otimização de recursos e o desenvolvimento de
						soluções inovadoras, alinhadas ao <strong>Plano Estratégico Militar da Aeronáutica (PEMAER)</strong>. O compromisso com a melhoria contínua
						reflete-se na integração de tecnologia, capacitação e otimização de processos — valorizando as iniciativas de gestores em seus diversos sistemas.
					</p>

					<p className="mt-5 text-xs text-muted-foreground">Fonte: Visão Estratégica de Futuro da SEFA · PEMAER · Concepção Estratégica Força Aérea 100.</p>
				</section>

				{/* ── Em Números ────────────────────────────────────────────────────── */}
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

				{/* ── Áreas Temáticas ───────────────────────────────────────────────── */}
				<section aria-labelledby="areas-heading">
					<div className="mb-8">
						<h2 id="areas-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Áreas Temáticas
						</h2>
						<p className="text-sm text-muted-foreground">
							Extraído do Anexo N, do <strong>PCA 30-116/2023</strong> — Trilha de Capacitação do COMAER para o quadriênio 2024/2027.
						</p>
					</div>

					{/* Áreas numeradas */}
					<ol className="flex flex-col mb-12" aria-label="Áreas Temáticas de interesse da SEFA">
						{AREAS_TEMATICAS.map((text, idx) => (
							<li key={idx} className="flex items-start gap-8 border-t border-border py-6">
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{String(idx + 1).padStart(2, "0")}.</span>
								<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">{text}</p>
							</li>
						))}
					</ol>

					{/* Tabela de subtemas */}
					<div className="mb-4">
						<h3 className="text-base font-semibold tracking-tight mb-1">Subtemas por Área</h3>
						<p className="text-xs text-muted-foreground mb-6">Detalhamento dos subtemas previstos no PCA 30-116/2023.</p>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full border border-border text-sm" aria-label="Tabela de áreas temáticas e subtemas">
							<thead>
								<tr className="border-b border-border bg-muted">
									<th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-1/2">Área Temática</th>
									<th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subtema</th>
								</tr>
							</thead>
							<tbody>
								{SUBTEMAS.map((row, idx) => (
									<tr key={idx} className="border-t border-border hover:bg-muted/40 transition-colors">
										<td className="px-5 py-3 text-muted-foreground text-xs leading-snug">{row.area}</td>
										<td className="px-5 py-3 font-medium text-xs">{row.subtema}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>

				{/* ── Linhas de Pesquisa ────────────────────────────────────────────── */}
				<section aria-labelledby="linhas-heading">
					<div className="mb-8">
						<h2 id="linhas-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Linhas de Pesquisa
						</h2>
						<p className="text-sm text-muted-foreground text-pretty max-w-2xl">
							As linhas de pesquisa definem os eixos temáticos estruturantes das investigações técnico-científicas fomentadas pelo IEFA. Orientam a formulação
							de projetos, articulações acadêmicas e estudos aplicados, com ênfase na gestão pública e defesa.
						</p>
					</div>

					<ol className="flex flex-col" aria-label="Linhas de pesquisa prioritárias da SEFA">
						{LINHAS_PESQUISA.map((text, idx) => (
							<li key={idx} className="flex items-start gap-8 border-t border-border py-7">
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{String(idx + 1).padStart(2, "0")}.</span>
								<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">{text}</p>
							</li>
						))}
					</ol>

					<p className="mt-8 text-xs text-muted-foreground border-t border-border pt-6">
						As linhas de pesquisa prioritárias são aquelas que contribuam com os objetivos estratégicos da SEFA. Outras linhas podem ser aprovadas pelo
						Secretário de Economia, Finanças e Administração da Aeronáutica.
					</p>
				</section>

				{/* ── Áreas Tecnológicas ────────────────────────────────────────────── */}
				<section aria-labelledby="tecno-heading">
					<div className="mb-8">
						<h2 id="tecno-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Áreas Tecnológicas de Interesse da Defesa
						</h2>
						<p className="text-sm text-muted-foreground text-pretty max-w-2xl">
							Áreas previstas na <strong>Portaria GM-MD nº 1.112, de 4 de março de 2024</strong>, que orientam as atividades dos projetos de pesquisa,
							desenvolvimento e inovação no âmbito da SEFA.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						{AREAS_TECNOLOGICAS.map(({ icon: Icon, sigla, title, description, tags }) => (
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
								<ul className="flex flex-wrap gap-2 pt-4 border-t border-border">
									{tags.map((tag) => (
										<li key={tag} className="text-xs text-muted-foreground border border-border bg-muted px-2 py-0.5">
											{tag}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</section>

				{/* ── Banco de Temas de Pesquisa ────────────────────────────────────── */}
				<section aria-labelledby="banco-heading">
					<div className="mb-8">
						<h2 id="banco-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Banco de Temas de Pesquisa
						</h2>
						<p className="text-sm text-muted-foreground text-pretty max-w-2xl">
							Sugestões de projetos e propostas específicas de interesse da SEFA, operando dentro das áreas temáticas, linhas de pesquisa e áreas tecnológicas
							definidas. Acesse a ficha de cada tema para detalhes sobre escopo, metodologia e critérios de avaliação.
						</p>
					</div>

					<ol className="flex flex-col" aria-label="Temas do banco de pesquisa do IEFA">
						{BANCO_TEMAS.map(({ id, title, href, tags }) => (
							<li key={id} className="flex items-start gap-6 md:gap-8 border-t border-border py-6 group">
								{/* Número */}
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{String(id).padStart(2, "0")}.</span>

								{/* Conteúdo */}
								<div className="flex-1 flex flex-col gap-3">
									<p className="text-sm sm:text-base font-medium text-pretty leading-snug">{title}</p>
									<div className="flex flex-wrap gap-2">
										{tags.map((tag) => (
											<span key={tag} className="text-xs text-muted-foreground border border-border bg-muted px-2 py-0.5">
												{tag}
											</span>
										))}
									</div>
								</div>

								{/* Link para ficha */}
								<a
									href={href}
									target="_blank"
									rel="noreferrer noopener"
									className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium border border-border bg-card px-3 py-2
                    transition-colors hover:bg-accent hover:border-foreground/20
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									aria-label={`Abrir ficha de consulta do tema ${id} em nova aba`}
								>
									Ficha
									<OpenNewWindow className="h-3 w-3" aria-hidden="true" />
								</a>
							</li>
						))}
					</ol>
				</section>

				{/* ── ICT e Marco Legal ─────────────────────────────────────────────── */}
				<section aria-labelledby="ict-heading">
					<div className="mb-8">
						<h2 id="ict-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							IEFA como ICT
						</h2>
						<p className="text-sm text-muted-foreground">Reconhecimento e base normativa da atuação em Ciência, Tecnologia e Inovação.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Lei nº 13.243/2016
							</Badge>
							<h3 className="font-semibold text-base">Marco Legal da Inovação</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed flex-1">
								O IEFA atua em conformidade com o Marco Legal da Inovação, que estimula o intercâmbio acadêmico com instituições de ensino e pesquisa, o
								desenvolvimento de soluções inovadoras e a transferência de tecnologia entre instituições públicas.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Portaria DCTA nº 543/CGI — Dez 2024
							</Badge>
							<h3 className="font-semibold text-base">Reconhecimento como ICT</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed flex-1">
								Estabelecido como ICT pela Portaria DCTA nº 543/CGI, de 05 de dezembro de 2024, o IEFA ampliou sua atuação como{" "}
								<strong>Instituição Científica, Tecnológica e de Inovação</strong>, contribuindo para o avanço da CT&I em defesa e gestão pública.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								PCA 11-217
							</Badge>
							<h3 className="font-semibold text-base">Plano de CT&I da Aeronáutica</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed flex-1">
								As atividades de pesquisa do IEFA estão alinhadas ao Plano de Ciência, Tecnologia e Inovação da Aeronáutica (PCA 11-217), que orienta a alocação
								estratégica de recursos, priorização de projetos por TRL e governança em quatro níveis: Estratégico, Operacional, Tático e Acadêmico.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								PNCT&I
							</Badge>
							<h3 className="font-semibold text-base">Política Nacional de CT&I</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed flex-1">
								Em alinhamento com a Política Nacional de Ciência, Tecnologia e Inovação, o IEFA busca promover o intercâmbio acadêmico com instituições
								internas e externas, fomentando metodologias inovadoras para aprimorar a gestão dos recursos públicos e a governança no COMAER.
							</p>
						</div>
					</div>
				</section>

				{/* ── Rodapé / Fontes ───────────────────────────────────────────────── */}
				<footer className="border-t pt-8 pb-4">
					<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
						Informações baseadas nos documentos oficiais: <strong>PCA 11-217</strong> — Plano de CT&I da Aeronáutica; <strong>PCA 30-116/2023</strong> — Trilha
						de Capacitação do COMAER 2024/2027; <strong>Lei nº 13.243/2016</strong> — Marco Legal da Inovação; <strong>Portaria GM-MD nº 1.112/2024</strong> —
						Áreas Tecnológicas de Interesse da Defesa. Ministério da Defesa · Comando da Aeronáutica · SEFA · IEFA.
					</p>
				</footer>
			</div>
		</div>
	)
}
