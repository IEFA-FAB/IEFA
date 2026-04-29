import { createFileRoute } from "@tanstack/react-router"
import { NavArrowDown, OpenNewWindow } from "iconoir-react"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/_public/innovation-policy")({
	staticData: {
		nav: {
			title: "Política de Inovação",
			section: "Portal",
			subtitle: "Política de Inovação do IEFA — ICT do Comando da Aeronáutica",
			keywords: ["política", "inovação", "ict", "iefa", "portaria", "dfp", "propriedade intelectual"],
			order: 35,
		},
	},
	component: InnovationPolicy,
	head: () => ({
		meta: [
			{ title: "Política de Inovação | Portal IEFA" },
			{
				name: "description",
				content:
					"Política de Inovação do IEFA — diretrizes, objetivos, propriedade intelectual, parcerias e estímulo ao empreendedorismo no âmbito da ICT do Comando da Aeronáutica.",
			},
		],
	}),
})

/* ─── Dados estáticos ─────────────────────────────────────────────────────── */

const SISTEMAS_SEFA = [
	{ sigla: "SISFINAER", nome: "Sistema de Administração Financeira" },
	{ sigla: "SISCONTAER", nome: "Sistema de Contabilidade da Aeronáutica" },
	{ sigla: "SISCOMAER", nome: "Sistema de Comércio Exterior" },
	{ sigla: "SISPAGAER", nome: "Sistema de Pagamento de Pessoal" },
	{ sigla: "SISUB", nome: "Sistema de Subsistência" },
	{ sigla: "SISPROV", nome: "Sistema de Provisões" },
	{ sigla: "SIFARE", nome: "Sistema de Fardamento Reembolsável" },
	{ sigla: "SISICAMP", nome: "Sistema de Intendência em Campanha" },
	{ sigla: "SISTRAN", nome: "Sistema de Transporte de Superfície" },
	{ sigla: "SISHT", nome: "Sistema de Hotéis de Trânsito" },
	{ sigla: "SISPNR", nome: "Sistema de Próprios Nacionais Residenciais" },
	{ sigla: "SISADM", nome: "Sistema de Administração" },
]

const DIRETRIZES = [
	"Inserção do IEFA em ações que promovam a inovação científica e tecnológica em âmbitos regional, nacional e internacional.",
	"Atuação para identificar, avaliar e selecionar entidades públicas e privadas com atividades de CT&I nas áreas de concentração de interesse dos sistemas da SEFA.",
	"Contribuição para o avanço da ciência, tecnologia e inovação nas áreas de interesse dos sistemas da SEFA e nos produtos e serviços de interesse de Defesa.",
	"Aprimoramento dos mecanismos de coordenação, monitoramento, avaliação e divulgação das atividades institucionais de CT&I e dos seus resultados.",
	"Otimização das competências instaladas, infraestrutura necessária, plataformas tecnológicas, serviços e expertises institucionais para soluções inovadoras.",
	"Ampliação da capacidade institucional científica, tecnológica, de prospecção e de gestão visando à inovação.",
	"Estímulo à inovação por parte do pesquisador público.",
	"Atendimento ao inventor independente.",
	"Transferência de conhecimento e tecnologia gerados no IEFA.",
	"Gestão estratégica de parcerias com instituições públicas e privadas, empresas nacionais e estrangeiras, incentivando a inovação aberta.",
	"Fortalecimento do desenvolvimento tecnológico para fomentar a indústria nacional e contribuir para o desenvolvimento sustentável.",
	"Contribuição junto aos demais institutos do SINAER e outras ICT para o avanço da CT&I nas áreas de interesse de Defesa.",
]

const OBJETIVOS = [
	"Fortalecer a capacidade do IEFA em apoiar a geração de inovação nas áreas de interesse dos sistemas da SEFA.",
	"Promover articulação científica, tecnológica e produtiva com outras instituições públicas e/ou privadas, nacionais e internacionais.",
	"Promover projetos de CT&I de interesse das áreas afetas aos sistemas da SEFA.",
	"Prestar serviços técnicos especializados compatíveis com a missão institucional do IEFA.",
	"Compartilhar ou permitir a utilização de laboratórios, equipamentos, instrumentos, materiais e demais instalações para atividades de CT&I.",
	"Contribuir com a modernização e a manutenção de laboratórios de pesquisa e infraestrutura de apoio à inovação.",
	"Identificar e cadastrar potenciais parceiros para celebração de acordos de cooperação e de fomento.",
	"Estabelecer parcerias para projetos de CT&I.",
	"Orientar ações de formação e capacitação de recursos humanos em gestão da inovação, transferência de tecnologia e propriedade intelectual.",
	"Disseminar a cultura da inovação, incluindo a valorização dos inventores.",
	"Estabelecer critérios para participação, remuneração, afastamento e licença de servidor em atividades de inovação e empreendedorismo.",
	"Apoiar inventores independentes que apresentem patentes viáveis e compatíveis com os interesses dos sistemas da SEFA.",
	"Simplificar processos administrativos, visando racionalização e agilidade.",
	"Definir modalidades de oferta, critérios e condições para contratos de transferência de tecnologia e licenciamento.",
	"Implementar gestão integrada para coordenação eficiente, monitoramento contínuo, avaliação sistemática e aperfeiçoamento dos processos de inovação.",
]

const ALINHAMENTO_FEDERAL = [
	"Política Nacional de Defesa (PND)",
	"Política Nacional de Inovação (PNI)",
	"Política Nacional da Base Industrial de Defesa (PNBDI)",
	"Estratégia Nacional de Defesa (END)",
	"Estratégia Nacional de Ciência, Tecnologia e Inovação (ENCTI)",
	"Estratégia Nacional de Propriedade Intelectual (ENPI)",
	"Estratégia Nacional de Inovação (ENI)",
	"Estratégia Federal de Desenvolvimento (EFD)",
]

const ALINHAMENTO_MD = ["Política de Propriedade Intelectual (Portaria GM-MD nº 3.439/2021)", "Política de CT&I da Defesa (Portaria GM-MD nº 3.063/2021)"]

const ALINHAMENTO_COMAER = [
	'Concepção Estratégica "Força Aérea 100" (DCA 11-45)',
	"Plano Estratégico Militar da Aeronáutica (PCA 11-47)",
	"Plano de Ciência, Tecnologia e Inovação da Aeronáutica (PCA 11-217)",
	"Normas sistêmicas do SINAER",
]

const PROPRIEDADE_INTELECTUAL = [
	"Consulta preliminar ao NIT sobre a patenteabilidade.",
	"Análise dos aspectos legais, tecnológicos, mercadológicos e institucionais.",
	"Custo de proteção.",
	"Juízo de conveniência e oportunidade dos gestores públicos.",
]

const MODALIDADES_TRANSFERENCIA = [
	{ titulo: "Know-how", descricao: "Transferência de conhecimento e técnicas não amparadas por direito de propriedade intelectual." },
	{
		titulo: "Licenciamento",
		descricao: "Licenciamento para exploração de produtos ou serviços protegidos por propriedade intelectual.",
	},
	{
		titulo: "Cessão",
		descricao: "Cessão de tecnologia ou transferência de titularidade do titular de propriedade intelectual.",
	},
]

/* ─── Componente ──────────────────────────────────────────────────────────── */

function InnovationPolicy() {
	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero ──────────────────────────────────────────────────────────── */}
			<section
				aria-label="Política de Inovação do IEFA"
				className="relative w-full min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-2.5rem)] flex flex-col"
			>
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-6 px-4 py-12">
					<div className="flex flex-wrap gap-2 justify-center">
						<Badge variant="outline">Portaria IEFA nº 17/DFP</Badge>
						<Badge variant="outline">ICT</Badge>
						<Badge variant="outline">MLCTI</Badge>
					</div>

					<h1 className="text-hero text-balance">Política de Inovação</h1>

					<p className="text-label text-muted-foreground tracking-[0.2em]">Instituto de Economia, Finanças e Administração da Aeronáutica</p>

					<p className="max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed text-pretty">
						Aprovada pela Portaria IEFA nº 17/DFP, de 28 de maio de 2025, em conformidade com a Lei nº 10.973/2004 e o Decreto nº 9.283/2018, que estabelece que
						cada ICT instituirá a sua política de inovação.
					</p>
				</div>

				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Seções de conteúdo ────────────────────────────────────────────── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28">
				{/* ── Apresentação ──────────────────────────────────────────────────── */}
				<section aria-labelledby="apresentacao-heading">
					<div className="mb-8">
						<h2 id="apresentacao-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							O IEFA como ICT
						</h2>
						<p className="text-sm text-muted-foreground">
							Conforme Art. 1º da <strong>Portaria IEFA nº 17/DFP, de 28 de maio de 2025</strong>.
						</p>
					</div>

					<blockquote className="border-l-2 border-foreground pl-6 py-1 text-base sm:text-lg text-muted-foreground italic text-pretty leading-relaxed mb-8">
						"O IEFA, ICT do Comando da Aeronáutica, criado pela Portaria GABAER nº 592/GC3, de 16 de outubro de 2023 e estabelecida como ICT pela Portaria DCTA
						nº 543/CGI, de 05 de dezembro de 2024, tem por finalidade capacitar gestores e agentes da administração do COMAER e fomentar pesquisas na área de
						Economia, Finanças e Administração da Aeronáutica."
					</blockquote>

					<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">
						A governança e coordenação da Política de Inovação está a cargo da <strong>Divisão de Fomento à Pesquisa (DFP)</strong>, cabendo ao Diretor do IEFA
						a função de autoridade máxima da ICT. O <strong>Núcleo de Inovação Tecnológica (NIT)</strong> constituído para apoiar o IEFA é a{" "}
						<strong>Coordenadoria de Gestão da Inovação (CGI)</strong> do DCTA, órgão central do Sistema de Inovação da Aeronáutica (SINAER).
					</p>
				</section>

				{/* ── Os 12 Sistemas ────────────────────────────────────────────────── */}
				<section aria-labelledby="sistemas-heading">
					<div className="mb-8">
						<h2 id="sistemas-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Os 12 Sistemas da SEFA
						</h2>
						<p className="text-sm text-muted-foreground">Sistemas sob gestão da SEFA abrangidos pela Política de Inovação do IEFA.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
						{SISTEMAS_SEFA.map(({ sigla, nome }) => (
							<div key={sigla} className="bg-card px-5 py-4 flex items-center gap-4">
								<Badge variant="secondary" className="shrink-0 font-mono text-xs">
									{sigla}
								</Badge>
								<span className="text-xs text-muted-foreground leading-snug">{nome}</span>
							</div>
						))}
					</div>
				</section>

				{/* ── Alinhamento Normativo ─────────────────────────────────────────── */}
				<section aria-labelledby="alinhamento-heading">
					<div className="mb-8">
						<h2 id="alinhamento-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Alinhamento Normativo
						</h2>
						<p className="text-sm text-muted-foreground">Documentos que regem a Política de Inovação, conforme Art. 5º.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{/* Federal */}
						<div className="border border-border bg-card p-6 flex flex-col gap-4">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Federal
							</Badge>
							<ul className="flex flex-col gap-2">
								{ALINHAMENTO_FEDERAL.map((item) => (
									<li key={item} className="text-xs text-muted-foreground flex items-start gap-2">
										<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
										{item}
									</li>
								))}
							</ul>
						</div>

						{/* MD */}
						<div className="border border-border bg-card p-6 flex flex-col gap-4">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Ministério da Defesa
							</Badge>
							<ul className="flex flex-col gap-2">
								{ALINHAMENTO_MD.map((item) => (
									<li key={item} className="text-xs text-muted-foreground flex items-start gap-2">
										<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
										{item}
									</li>
								))}
							</ul>
						</div>

						{/* COMAER */}
						<div className="border border-border bg-card p-6 flex flex-col gap-4">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								COMAER
							</Badge>
							<ul className="flex flex-col gap-2">
								{ALINHAMENTO_COMAER.map((item) => (
									<li key={item} className="text-xs text-muted-foreground flex items-start gap-2">
										<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
										{item}
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				{/* ── Diretrizes ────────────────────────────────────────────────────── */}
				<section aria-labelledby="diretrizes-heading">
					<div className="mb-8">
						<h2 id="diretrizes-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Diretrizes
						</h2>
						<p className="text-sm text-muted-foreground">Art. 9º da Política de Inovação — 12 diretrizes norteadoras.</p>
					</div>

					<ol className="flex flex-col" aria-label="Diretrizes da Política de Inovação">
						{DIRETRIZES.map((text, idx) => (
							<li key={idx} className="flex items-start gap-8 border-t border-border py-6">
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{String(idx + 1).padStart(2, "0")}.</span>
								<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">{text}</p>
							</li>
						))}
					</ol>
				</section>

				{/* ── Objetivos ─────────────────────────────────────────────────────── */}
				<section aria-labelledby="objetivos-heading">
					<div className="mb-8">
						<h2 id="objetivos-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Objetivos
						</h2>
						<p className="text-sm text-muted-foreground">Art. 10 da Política de Inovação — 15 objetivos estratégicos.</p>
					</div>

					<ol className="flex flex-col" aria-label="Objetivos da Política de Inovação">
						{OBJETIVOS.map((text, idx) => (
							<li key={idx} className="flex items-start gap-8 border-t border-border py-6">
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{String(idx + 1).padStart(2, "0")}.</span>
								<p className="text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">{text}</p>
							</li>
						))}
					</ol>
				</section>

				{/* ── Propriedade Intelectual ───────────────────────────────────────── */}
				<section aria-labelledby="pi-heading">
					<div className="mb-8">
						<h2 id="pi-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Propriedade Intelectual
						</h2>
						<p className="text-sm text-muted-foreground text-pretty max-w-2xl">
							Conforme Capítulo V — critérios de proteção baseados na Lei nº 9.279/1996, avaliados anualmente quanto à relevância e viabilidade.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
						{/* Critérios de proteção */}
						<div className="border border-border bg-card p-6 flex flex-col gap-4">
							<h3 className="font-semibold text-base">Critérios de Proteção</h3>
							<p className="text-xs text-muted-foreground mb-2">Art. 12 — requisitos para proteção de PI.</p>
							<ol className="flex flex-col gap-2">
								{PROPRIEDADE_INTELECTUAL.map((item, idx) => (
									<li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
										<span className="text-label shrink-0 tabular-nums w-4">{idx + 1}.</span>
										{item}
									</li>
								))}
							</ol>
						</div>

						{/* Decisão e governança */}
						<div className="border border-border bg-card p-6 flex flex-col gap-4">
							<h3 className="font-semibold text-base">Decisão e Governança</h3>
							<ul className="flex flex-col gap-3 text-xs text-muted-foreground leading-relaxed">
								<li className="flex items-start gap-2">
									<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />A decisão sobre proteção cabe ao <strong>Diretor do IEFA</strong>,
									assessorado pelo OCS.
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
									PI de ativos de <strong>interesse da Defesa Nacional</strong> não são passíveis de proteção no exterior — conduzidos por sigilo industrial.
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
									Resultados de projetos são registrados em nome do IEFA. Ganhos econômicos são partilhados com os autores.
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1 h-px w-3 bg-border shrink-0" aria-hidden="true" />
									Continuidade da proteção <strong>reavaliada anualmente</strong>.
								</li>
							</ul>
						</div>
					</div>

					{/* Modalidades de transferência */}
					<div className="mb-4">
						<h3 className="text-base font-semibold tracking-tight mb-1">Modalidades de Transferência de Tecnologia</h3>
						<p className="text-xs text-muted-foreground mb-6">Art. 23 — formas admitidas para contratos de transferência.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
						{MODALIDADES_TRANSFERENCIA.map(({ titulo, descricao }) => (
							<div key={titulo} className="border border-border bg-card p-6 flex flex-col gap-3">
								<h4 className="font-semibold text-sm">{titulo}</h4>
								<p className="text-xs text-muted-foreground text-pretty leading-relaxed">{descricao}</p>
							</div>
						))}
					</div>
				</section>

				{/* ── Parcerias ─────────────────────────────────────────────────────── */}
				<section aria-labelledby="parcerias-heading">
					<div className="mb-8">
						<h2 id="parcerias-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Parcerias e Atuação Institucional
						</h2>
						<p className="text-sm text-muted-foreground">Capítulos IV e VI — atuação no ambiente produtivo e diretrizes para parcerias.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								DFP
							</Badge>
							<h3 className="font-semibold text-base">Captação de Parcerias</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
								A DFP é responsável pela captação de parcerias para projetos de CT&I e pela interlocução com o NIT em todos os assuntos de gestão da inovação no
								IEFA. Projetos devem ser executados prioritariamente via parcerias.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Art. 46–47
							</Badge>
							<h3 className="font-semibold text-base">Compartilhamento de Infraestrutura</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
								O IEFA pode compartilhar laboratórios, equipamentos e instalações para atividades de CT&I mediante contrapartida financeira ou não financeira.
								Órgãos do COMAER são isentos de contrapartida financeira.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Art. 11
							</Badge>
							<h3 className="font-semibold text-base">Atuação Local, Regional e Internacional</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
								Promover articulação científica e produtiva com instituições públicas e privadas, nacionais e internacionais, com tratamento preferencial a
								empresas que investem em P&D no Brasil e à Base Industrial de Defesa.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								Art. 44
							</Badge>
							<h3 className="font-semibold text-base">Fundação de Apoio</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
								Receitas captadas no âmbito do MLCTI são geridas por Fundação de Apoio conveniada, destinadas exclusivamente a projetos de CT&I, transferência
								de tecnologia e capacitação de pessoal.
							</p>
						</div>
					</div>
				</section>

				{/* ── Empreendedorismo ──────────────────────────────────────────────── */}
				<section aria-labelledby="empreendedorismo-heading">
					<div className="mb-8">
						<h2 id="empreendedorismo-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Estímulo ao Empreendedorismo
						</h2>
						<p className="text-sm text-muted-foreground">Capítulo VII — apoio a inventores independentes e ao ambiente de inovação.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<h3 className="font-semibold text-base">Inventores Independentes</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
								O IEFA pode apoiar inventores independentes que comprovem depósito de pedido de patentes, quando viáveis e compatíveis com os interesses dos
								sistemas da SEFA, por meio de análise de viabilidade técnica/econômica e orientação para transferência de tecnologia.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<h3 className="font-semibold text-base">Ambiente de Inovação</h3>
							<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
								O IEFA incentiva a divulgação de projetos, artigos e pesquisas científicas e tecnológicas realizadas no âmbito da ICT, e apoia indiretamente
								ações de empreendedorismo em assuntos de interesse dos sistemas da SEFA, assessorando interessados quanto a parcerias e financiamento.
							</p>
						</div>
					</div>
				</section>

				{/* ── Governança ────────────────────────────────────────────────────── */}
				<section aria-labelledby="governanca-heading">
					<div className="mb-8">
						<h2 id="governanca-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Estrutura de Governança
						</h2>
						<p className="text-sm text-muted-foreground">Instâncias de decisão no âmbito da Política de Inovação do IEFA.</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								DIR
							</Badge>
							<h3 className="font-semibold text-sm">Diretor do IEFA</h3>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Autoridade máxima da ICT, com delegação de competência nos termos do Decreto nº 9.283/2018.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								DFP
							</Badge>
							<h3 className="font-semibold text-sm">Divisão de Fomento à Pesquisa</h3>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Coordenação da Política de Inovação, captação de parcerias e interlocução com o NIT.
							</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								OCS
							</Badge>
							<h3 className="font-semibold text-sm">Órgão Colegiado Superior</h3>
							<p className="text-xs text-muted-foreground leading-relaxed">Assessora o Diretor nos assuntos de CT&I, ativado conforme a NSCA 80-2.</p>
						</div>

						<div className="border border-border bg-card p-6 flex flex-col gap-3">
							<Badge variant="secondary" className="w-fit font-mono text-xs">
								NIT / CGI
							</Badge>
							<h3 className="font-semibold text-sm">Núcleo de Inovação Tecnológica</h3>
							<p className="text-xs text-muted-foreground leading-relaxed">
								CGI do DCTA — órgão central do SINAER, apoio em gestão da inovação e propriedade intelectual.
							</p>
						</div>
					</div>

					{/* Comissão de Análise */}
					<div className="mt-5 border border-border bg-card px-5 py-4 flex items-center gap-4">
						<Badge variant="secondary" className="shrink-0 font-mono text-xs">
							Art. 35
						</Badge>
						<div>
							<p className="font-semibold text-sm">Comissão de Análise</p>
							<p className="text-xs text-muted-foreground">
								Agente de Controle Interno + Chefe da DFP + Chefe da Seção de Pesquisa e Inovação — avalia propostas de transferência de tecnologia, cessão e
								inventores independentes.
							</p>
						</div>
					</div>
				</section>

				{/* ── Documento oficial ─────────────────────────────────────────────── */}
				<section aria-labelledby="documento-heading">
					<h2 id="documento-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-8">
						Documento Oficial
					</h2>

					<a
						href="/docs/Política_Inovação_IEFA.pdf"
						target="_blank"
						rel="noreferrer noopener"
						className="group flex items-center gap-4 border border-border bg-card p-5 transition-colors hover:bg-accent hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						<div className="flex-1">
							<p className="font-semibold text-sm">Portaria IEFA nº 17/DFP, de 28 de maio de 2025</p>
							<p className="text-xs text-muted-foreground mt-1">Política de Inovação do IEFA — documento completo com 61 artigos, 8 capítulos.</p>
						</div>
						<OpenNewWindow
							className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
							aria-hidden="true"
						/>
					</a>
				</section>

				{/* ── Rodapé / Fontes ───────────────────────────────────────────────── */}
				<footer className="border-t pt-8 pb-4">
					<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
						Informações extraídas da <strong>Portaria IEFA nº 17/DFP, de 28 de maio de 2025</strong> — Política de Inovação do IEFA. Fundamentação legal:
						Constituição Federal (Arts. 218, 219, 219-A, 219-B); <strong>Lei nº 10.973/2004</strong> (Lei de Inovação); <strong>Decreto nº 9.283/2018</strong>;{" "}
						<strong>ROCA 21-120/2025</strong> (Regulamento do IEFA). Ministério da Defesa · Comando da Aeronáutica · SEFA · IEFA.
					</p>
				</footer>
			</div>
		</div>
	)
}
