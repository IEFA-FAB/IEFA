import { createFileRoute } from "@tanstack/react-router"
import {
	Book,
	Box,
	Calendar,
	Check,
	ClipboardCheck,
	Clock,
	Code,
	Cpu,
	GitBranch,
	Globe,
	Group,
	HistoricShield,
	Map as MapIcon,
	NavArrowDown,
	OpenNewWindow,
	Server,
	StatsReport,
} from "iconoir-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export const Route = createFileRoute("/_public/_en/roadmap")({
	component: Roadmap,
	head: () => ({
		meta: [
			{ title: "Roadmap | Portal IEFA" },
			{
				name: "description",
				content: `${STATS.done} passos concluídos, ${STATS.future} entregas planejadas e ${STATS.appsActive} apps em produção — histórico, estado atual e planos futuros do ecossistema de software do IEFA.`,
			},
		],
	}),
})

// ─── Tipos ──────────────────────────────────────────────────────────────────

type StepStatus = "done" | "in-progress" | "planned" | "vision"
type PhaseStatus = "done" | "active" | "planned" | "vision"

interface RoadmapStep {
	number: string
	label: string
	description: string
	status: StepStatus
	date?: string
}

interface RoadmapPhase {
	number: string
	title: string
	subtitle: string
	phaseStatus: PhaseStatus
	steps: RoadmapStep[]
}

interface AppRoadmap {
	icon: React.ElementType
	slug: string
	title: string
	status: "stable" | "active" | "planned"
	phases: RoadmapPhase[]
}

interface AppEntry {
	icon: React.ElementType
	slug: string
	title: string
	description: string
	stack: string[]
	status: "stable" | "active" | "planned"
	url?: string
}

interface Principle {
	index: string
	title: string
	description: string
}

// ─── Dados ──────────────────────────────────────────────────────────────────

const APP_ROADMAPS: AppRoadmap[] = [
	{
		icon: Box,
		slug: "sisub",
		title: "Sisub — ERP de Subsistência",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Previsão & Cardápios",
				subtitle: "Primeiro produto público do IEFA — previsão de consumo, gestão de cardápios e arquitetura multi-OM fundacional.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "Lançamento do Sisub",
						description:
							"Publicação do app.previsaosisub.com.br — primeira versão do Sistema de Subsistência, permitindo previsão de consumo e gestão de cardápios.",
						status: "done",
						date: "Jul 2025",
					},
					{
						number: "1.2",
						label: "Arquitetura Multi-OM",
						description:
							"Requisito original do sistema — o Sisub foi projetado desde o início para operar com múltiplas Organizações Militares. Isolamento de dados por OM, escopos de permissão organizacional e consolidação no nível SEFA.",
						status: "done",
						date: "Jul 2025",
					},
				],
			},
			{
				number: "2",
				title: "ERP de Subsistência",
				subtitle: "Evolução de sistema de previsão para ERP completo da FAB — módulos de gestão, receitas, planejamento mensal e analytics de consumo.",
				phaseStatus: "done",
				steps: [
					{
						number: "2.1",
						label: "Módulos de gestão",
						description:
							"Expansão com módulos completos: gestão de cardápios semanais, base de receitas, planejamento mensal com calendário, analytics de consumo e painel de KPIs de subsistência.",
						status: "done",
						date: "Jan 2026",
					},
					{
						number: "2.2",
						label: "Sisub → ERP completo",
						description:
							"Evolução do Sisub de sistema de previsão para ERP completo da Subsistência da Força Aérea Brasileira — unificando planejamento, execução, controle e relatórios gerenciais das OMs.",
						status: "done",
						date: "Fev 2026",
					},
				],
			},
			{
				number: "3",
				title: "Produção & Demanda",
				subtitle: "A cozinha como cidadã de primeira classe — fluxo de preparo, demanda unificada template → produção e flexibilidade operacional.",
				phaseStatus: "done",
				steps: [
					{
						number: "3.1",
						label: "Fluxo de Produção (DAG)",
						description:
							"Receitas modeladas como grafo de preparo (xyflow) — etapas, dependências e insumos por etapa, com visualização interativa do fluxo de produção da cozinha.",
						status: "done",
						date: "Jun 2026",
					},
					{
						number: "3.2",
						label: "Composição avançada de cardápios",
						description:
							"Grupos de preparações com ordem e proporção recomendada (drag-and-drop), preparações congeladas por cozinha e substituição direcional de insumos.",
						status: "done",
						date: "Jul 2026",
					},
					{
						number: "3.3",
						label: "Demanda unificada template → produção",
						description:
							"Efetivo base por refeição no template de cardápio e escala de ingredientes compartilhada — planejamento e produção calculam demanda com a mesma matemática.",
						status: "done",
						date: "Jul 2026",
					},
					{
						number: "3.4",
						label: "Flexibilidade da produção",
						description:
							"Eventos e exceções aplicados ao calendário de produção de forma idempotente, registro de produzido e sobras por refeição e permissões de cozinha escopadas por OM.",
						status: "done",
						date: "Jul 2026",
					},
				],
			},
			{
				number: "4",
				title: "Gestão de Estoque",
				subtitle: "Controle completo de materiais, movimentações e reposição nas Organizações Militares.",
				phaseStatus: "active",
				steps: [
					{
						number: "4.1",
						label: "Cadastro de materiais",
						description:
							"Insumos, unidades de medida, categorias e estoque mínimo por OM. Vínculo automático entre materiais cadastrados e ingredientes das receitas — a separação item de compra × ingrediente já está modelada e em uso.",
						status: "in-progress",
					},
					{
						number: "4.2",
						label: "Entradas",
						description:
							"Recebimento de nota fiscal com registro de lote e validade, doações e transferências recebidas. Conferência de quantidade recebida vs. NF.",
						status: "planned",
					},
					{
						number: "4.3",
						label: "Saídas",
						description: "Baixa manual, baixa por descarte ou avaria com justificativa registrada, e transferência de material entre OMs.",
						status: "planned",
					},
					{
						number: "4.4",
						label: "Posição em tempo real",
						description:
							"Dashboard de saldo por material e OM. Alertas de estoque mínimo atingido e alertas de validade próxima com antecedência configurável.",
						status: "planned",
					},
					{
						number: "4.5",
						label: "Inventário periódico",
						description: "Fluxo de contagem física, conciliação sistema × físico, relatório de divergências e ajustes com rastreabilidade de responsável.",
						status: "planned",
					},
					{
						number: "4.6",
						label: "Integração cardápios ↔ estoque",
						description:
							"Ao confirmar cardápio: verificação de disponibilidade de insumos. Ao executar: baixa automática proporcional ao número de refeições. Alertas de falta antes do início do preparo.",
						status: "planned",
					},
					{
						number: "4.7",
						label: "Pedido de empenho inteligente",
						description:
							"Sugestão de pedido calculada com base no saldo atual + planejamento mensal de cardápios. Geração automática de processo de empenho para compras.gov — a integração com atas, licitações e auditoria de preços já está em operação.",
						status: "in-progress",
					},
				],
			},
			{
				number: "5",
				title: "Escala",
				subtitle: "Dashboard executivo consolidado para a SEFA — visão agregada de todas as OMs vinculadas.",
				phaseStatus: "vision",
				steps: [
					{
						number: "5.1",
						label: "Dashboard executivo SEFA",
						description:
							"Painel gerencial consolidado para a Seção de Alimentação — visão agregada de consumo, custos, alertas e KPIs de todas as OMs vinculadas.",
						status: "vision",
					},
				],
			},
		],
	},
	{
		icon: Globe,
		slug: "portal",
		title: "Portal IEFA",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Lançamento & Plataforma",
				subtitle: "Portal institucional público e consolidação de todo o ecossistema em monorepo open-source.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "Portal IEFA",
						description:
							"Criação do portal.iefa.com.br, centralizando o acesso às soluções do Instituto: CMS (Sanity), blog, painel de aplicativos e autenticação Supabase.",
						status: "done",
						date: "Out 2025",
					},
					{
						number: "1.2",
						label: "Monorepo open-source",
						description:
							"Consolidação de todas as soluções do IEFA em um único repositório Bun + Turborepo, publicado como projeto open-source. Padronização de tooling: Biome, Conventional Commits, Supabase multi-schema.",
						status: "done",
						date: "Out 2025",
					},
				],
			},
			{
				number: "2",
				title: "Publicações & Governança",
				subtitle: "Sistema editorial completo para a Revista Seiva e compromisso público de transparência do ecossistema.",
				phaseStatus: "done",
				steps: [
					{
						number: "2.1",
						label: "Revista Seiva — módulo editorial",
						description:
							"Sistema de submissão, revisão por pares e publicação da Revista Seiva com fluxo editorial completo (Kanban, painel de revisores, metadados CrossRef).",
						status: "done",
						date: "Dez 2025",
					},
					{
						number: "2.2",
						label: "Página de Roadmap",
						description:
							"Publicação desta página — registro público do histórico, estado atual e planejamento do ecossistema de software IEFA, como compromisso de transparência e rastreabilidade institucional.",
						status: "done",
						date: "Abr 2026",
					},
				],
			},
			{
				number: "3",
				title: "Plataforma & Infraestrutura",
				subtitle: "Suíte de aplicativos dirigida por banco e migração de toda a infraestrutura do ecossistema para AWS.",
				phaseStatus: "done",
				steps: [
					{
						number: "3.1",
						label: "Migração Fly.io → AWS ECS",
						description:
							"Toda a infraestrutura migrada para AWS ECS Fargate com Terraform — deploys por app via OIDC, ALB único compartilhado e otimização de custo (~43% de redução mensal).",
						status: "done",
						date: "Jul 2026",
					},
					{
						number: "3.2",
						label: "Suíte de apps + favoritos",
						description:
							"Painel de aplicativos dirigido por banco com favoritos por usuário — sincronizados entre dispositivos quando logado, localStorage quando anônimo.",
						status: "done",
						date: "Jul 2026",
					},
				],
			},
		],
	},
	{
		icon: Server,
		slug: "api",
		title: "API Pública",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Integrações Governamentais",
				subtitle: "Primeiras conexões com portais do governo federal — importação de preços e licitações.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "compras.gov — preços e licitações",
						description:
							"Primeiras integrações com o Portal de Compras do Governo Federal, automatizando importação de preços de referência e licitações vinculadas à subsistência.",
						status: "done",
						date: "Mar 2026",
					},
				],
			},
			{
				number: "2",
				title: "API Pública",
				subtitle: "Abertura da API com documentação OpenAPI, endpoints de alimentos e preços de referência.",
				phaseStatus: "done",
				steps: [
					{
						number: "2.1",
						label: "Endpoints públicos documentados",
						description:
							"Abertura da API (Bun + Hono + OpenAPI) em api.iefa.com.br com endpoints documentados via Scalar para consulta de tabelas de alimentos, preços de referência e histórico de variação de custos.",
						status: "done",
						date: "Jul 2026",
					},
					{
						number: "2.2",
						label: "Base nutricional de referência",
						description:
							"Importadores das tabelas TACO, IBGE e USDA — 10.830 alimentos de referência consolidados, com importação idempotente e re-executável.",
						status: "done",
						date: "Jul 2026",
					},
				],
			},
			{
				number: "3",
				title: "Integrações Avançadas",
				subtitle: "Automação do ciclo completo de aquisição — integração com SIAFI e demais sistemas do governo federal.",
				phaseStatus: "vision",
				steps: [
					{
						number: "3.1",
						label: "SIAFI e sistemas federais",
						description:
							"Integração com SIAFI (execução orçamentária) e outros sistemas do governo federal — automação do ciclo completo de aquisição e controle financeiro.",
						status: "vision",
					},
				],
			},
		],
	},
	{
		icon: Book,
		slug: "docs",
		title: "Documentação Técnica",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Documentação Interna",
				subtitle: "Guias de uso, referência de APIs, ADRs e manuais de onboarding para colaboradores e parceiros.",
				phaseStatus: "active",
				steps: [
					{
						number: "1.1",
						label: "Base de documentação",
						description:
							"App de documentação (TanStack Start + Fumadocs) publicado em docs.iefa.com.br como build estático (S3 + CloudFront) — guias de uso, referência de APIs e manuais de onboarding.",
						status: "done",
						date: "Jul 2026",
					},
					{
						number: "1.2",
						label: "Expansão de conteúdo",
						description: "Cobertura de guias por app, ADRs e manuais de onboarding para colaboradores e parceiros técnicos.",
						status: "in-progress",
					},
				],
			},
		],
	},
	{
		icon: Code,
		slug: "sisub-mcp",
		title: "Sisub MCP Server",
		status: "stable",
		phases: [
			{
				number: "1",
				title: "Lançamento",
				subtitle: "Servidor MCP expondo os dados do Sisub a agentes de IA via stdio/HTTP.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "MCP Server — stdio/HTTP",
						description:
							"Publicação do sisub-mcp — servidor MCP (Model Context Protocol) que expõe os dados do Sisub a agentes de IA via stdio/HTTP, permitindo consultas em linguagem natural ao sistema de subsistência.",
						status: "done",
						date: "Abr 2026",
					},
				],
			},
		],
	},
	{
		icon: StatsReport,
		slug: "sucont",
		title: "SUCONT — Análise Contábil",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Hub de Análise",
				subtitle: "Ferramentas de análise contábil da SUCONT — monitoramento, cruzamento de contas e auditoria assistida por IA.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "SUCONT-4 Hub",
						description:
							"Lançamento do sucont.iefa.com.br — hub com módulos de monitoramento, cruzamento de contas, análise de compatibilidade, saldo alongado e contas genéricas, com controle de acesso PBAC.",
						status: "done",
						date: "Abr 2026",
					},
					{
						number: "1.2",
						label: "Análise assistida por IA",
						description:
							"Análises contábeis assistidas por IA via AWS Bedrock — acesso keyless (IAM) pelo adaptador compartilhado do ecossistema (@iefa/ai-provider).",
						status: "done",
						date: "Jul 2026",
					},
				],
			},
		],
	},
	{
		icon: HistoricShield,
		slug: "rumaer",
		title: "RUMAER — Uniformes da Aeronáutica",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Consulta de Uniformes",
				subtitle: "O RUMAER navegável — busca tolerante, composições por uniforme e recomendação conforme o perfil do militar.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "Lançamento do RUMAER",
						description:
							"Publicação do rumaer.iefa.com.br — consulta aos uniformes da FAB com busca tolerante (sem acento, por extenso, apelidos), detalhe de composições e perfil por posto e quadro.",
						status: "done",
						date: "Jun 2026",
					},
					{
						number: "1.2",
						label: "Gestão colaborativa",
						description:
							"Módulo de controle de acesso compartilhado — editores mantêm o catálogo de uniformes e variações diretamente no app, com permissões por nível.",
						status: "done",
						date: "Jul 2026",
					},
				],
			},
		],
	},
	{
		icon: ClipboardCheck,
		slug: "forms",
		title: "Formulários IEFA",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Questionários Internos",
				subtitle: "Criação, coleta e análise de questionários para usuários @fab.mil.br — com suporte a múltiplos tenants.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "Lançamento do Forms",
						description:
							"Publicação do forms.iefa.com.br — questionários estruturados com múltiplos tipos de pergunta, coleta com salvamento automático e relatórios de respostas.",
						status: "done",
						date: "Mai 2026",
					},
					{
						number: "1.2",
						label: "Tenant VETOR 5S",
						description:
							"A mesma base de código serve o Programa VETOR 5S da SEFA em 5s.iefa.com.br — tenant dedicado com landing e formulários próprios de melhoria contínua.",
						status: "done",
						date: "Mai 2026",
					},
				],
			},
		],
	},
	{
		icon: Group,
		slug: "assignment-selection",
		title: "Escolha de Vagas — CPAINT",
		status: "stable",
		phases: [
			{
				number: "1",
				title: "Lançamento",
				subtitle: "Telão público e mesa de controle para as sessões de escolha de vagas da CPAINT.",
				phaseStatus: "done",
				steps: [
					{
						number: "1.1",
						label: "Telão e controlador",
						description:
							"Publicação do escolha.iefa.com.br — telão em tempo real para acompanhamento das sessões e interface de controle para condução da escolha de vagas.",
						status: "done",
						date: "Jul 2026",
					},
				],
			},
		],
	},
	{
		icon: Cpu,
		slug: "alpha",
		title: "Projeto α",
		status: "active",
		phases: [
			{
				number: "1",
				title: "Módulo ACI",
				subtitle:
					"Validação do núcleo jurídico — RAG sobre legislação, extração estruturada de documentos, verificação de conformidade e plataforma integrada para o ACI.",
				phaseStatus: "active",
				steps: [
					{
						number: "1.1",
						label: "ChatRADA",
						description:
							"RAG híbrido (semântico + BM25) sobre o Regulamento de Administração da Aeronáutica — busca em linguagem natural e consultas exatas a artigos e incisos. No ar em alpha.iefa.com.br, integrado ao portal.",
						status: "done",
						date: "Mai 2026",
					},
					{
						number: "1.2",
						label: "ChatSistemasSEFA",
						description: "RAG com memória em grafo sobre sistemas internos da SEFA — relações entre sistemas e contexto persistente por sessão.",
						status: "planned",
					},
					{
						number: "1.3",
						label: "ChatLicitaçõesSEFA",
						description: "RAG com busca em acórdãos TCU, pareceres CJU e Web — citação de fontes com links para documentos originais.",
						status: "planned",
					},
					{
						number: "1.3½",
						label: "Fontes normativas federais",
						description:
							"Ingestão versionada dos modelos oficiais da AGU (43 modelos vigentes) e da legislação federal — Lei 14.133, decretos e INs SEGES. Versão nova nunca sobrescreve a anterior, e a atualização semanal marca para revisão toda regra que cita dispositivo alterado.",
						status: "in-progress",
						date: "Jul 2026",
					},
					{
						number: "1.4",
						label: "AppAnalista",
						description:
							"Extrator que transforma ETP/TR em JSON estruturado com todos os atributos da contratação. Cada campo carrega o trecho literal do documento que o originou — sem origem rastreável, o campo é descartado.",
						status: "in-progress",
						date: "Jul 2026",
					},
					{
						number: "1.5",
						label: "ComparadorEstrutural",
						description:
							"Compara a estrutura do documento com o modelo oficial da AGU vigente — casamento exato, léxico e semântico, detecção de seções ausentes, extras, renomeadas e fora de ordem. Determinístico, sem LLM.",
						status: "in-progress",
						date: "Jul 2026",
					},
					{
						number: "1.6",
						label: "AppVerificadorRestrito",
						description:
							"Verifica inconformidades item a item contra a legislação vigente, com guard de citação: achado que cita dispositivo inexistente é descartado antes de chegar ao relatório.",
						status: "in-progress",
						date: "Jul 2026",
					},
					{
						number: "1.7",
						label: "VerificadorAmplo",
						description:
							"Integra 1.4–1.6 e acrescenta checagens cruzadas entre campos. Relatório unificado por severidade, com erro, referência normativa, sugestão e declaração de cobertura da análise.",
						status: "in-progress",
						date: "Jul 2026",
					},
					{
						number: "1.8",
						label: "Plataforma ACI",
						description:
							"Interface completa com persona ACI, integrando etapas 1–7: dashboard do analista, acesso a todos os chats e fluxo de verificação com relatório final de conformidade.",
						status: "planned",
					},
				],
			},
			{
				number: "2",
				title: "Módulo Requisitante",
				subtitle: "Guia o requisitante desde a estruturação da necessidade até a geração de documentos conformes — montagem, análise e refinamento iterativo.",
				phaseStatus: "planned",
				steps: [
					{
						number: "2.1",
						label: "AppMontaDoc",
						description: "Monta documentos no formato CJU a partir do JSON estruturado + dados do requisitante — geração de ETP, TR e Edital em formato final.",
						status: "planned",
					},
					{
						number: "2.2",
						label: "ChatAnaliseProblema",
						description:
							"Guia o requisitante na estruturação da necessidade via Value Focused Thinking — interface híbrida (formulário + conversa) para qualificar a demanda.",
						status: "planned",
					},
					{
						number: "2.3",
						label: "AppRefinador",
						description:
							"Ciclo de aprimoramento da solução com boas práticas da FAB — análise contra histórico de contratações, retorna JSON refinado para o MontaDoc.",
						status: "planned",
					},
					{
						number: "2.4",
						label: "Plataforma Requisitante",
						description: "Interface integrada das etapas 9–11: dashboard do requisitante com fluxo guiado de análise de problema, montagem e refinamento.",
						status: "planned",
					},
				],
			},
			{
				number: "3",
				title: "Copiloto Integrado",
				subtitle: "Agente unificado que conduz o fluxo completo de planejamento de contratações — acesso a todos os módulos sob demanda.",
				phaseStatus: "vision",
				steps: [
					{
						number: "3.1",
						label: "Copiloto α",
						description:
							"Agente com acesso a todos os módulos ACI e Requisitante, ativa ferramentas sob demanda e conduz o fluxo completo de planejamento de contratações com memória de longo prazo por OM e processo.",
						status: "vision",
					},
				],
			},
		],
	},
]

const APPS: AppEntry[] = [
	{
		icon: Globe,
		slug: "portal",
		title: "Portal IEFA",
		description:
			"Portal web institucional. Centraliza CMS (Sanity), blog, sistema de publicações científicas (Revista Seiva), painel de aplicativos e autenticação Supabase.",
		stack: ["React 19", "Vite", "TanStack Router", "Nitro SSR"],
		status: "active",
		url: "https://portal.iefa.com.br",
	},
	{
		icon: Box,
		slug: "sisub",
		title: "SISUB — Sistema de Subsistência",
		description:
			"Sistema de Subsistência da FAB. Cardápios, receitas, planejamento mensal, analytics de consumo, integrações com compras.gov e fluxo completo de gestão de OM.",
		stack: ["React 19", "TanStack Start", "Nitro SSR", "Supabase"],
		status: "active",
		url: "https://sisub.iefa.com.br",
	},
	{
		icon: Server,
		slug: "api",
		title: "API Pública",
		description:
			"API REST documentada via OpenAPI + Scalar. Endpoints de alimentos, preços de referência, sync workers e integrações governamentais (compras.gov).",
		stack: ["Bun", "Hono", "OpenAPI", "Scalar"],
		status: "active",
		url: "https://api.iefa.com.br",
	},
	{
		icon: Code,
		slug: "sisub-mcp",
		title: "Sisub MCP Server",
		description:
			"Servidor MCP (Model Context Protocol) que expõe dados do Sisub a agentes de IA via stdio/HTTP — consultas em linguagem natural ao sistema de subsistência.",
		stack: ["Bun", "MCP SDK"],
		status: "stable",
	},
	{
		icon: Cpu,
		slug: "alpha",
		title: "Projeto α",
		description:
			"Plataforma de IA aplicada ao ciclo de contratações públicas da FAB (Lei 14.133/21). Módulos de RAG jurídico, extração estruturada, verificação de conformidade e copiloto integrado.",
		stack: ["Bun", "Hono", "LangChain", "LangGraph"],
		status: "active",
		url: "https://alpha.iefa.com.br",
	},
	{
		icon: Book,
		slug: "docs",
		title: "Documentação Técnica",
		description: "Documentação interna do ecossistema. Guias, referência de APIs, ADRs e manuais de onboarding para colaboradores e parceiros.",
		stack: ["React 19", "TanStack Start", "Fumadocs"],
		status: "active",
		url: "https://docs.iefa.com.br",
	},
	{
		icon: StatsReport,
		slug: "sucont",
		title: "SUCONT — Análise Contábil",
		description:
			"Hub de análise contábil da SUCONT. Monitoramento, cruzamento de contas, análise de compatibilidade, saldo alongado e análises assistidas por IA (AWS Bedrock).",
		stack: ["React 19", "TanStack Start", "Supabase", "Bedrock"],
		status: "active",
		url: "https://sucont.iefa.com.br",
	},
	{
		icon: HistoricShield,
		slug: "rumaer",
		title: "RUMAER — Uniformes da Aeronáutica",
		description: "Consulta aos uniformes da FAB — busca tolerante, composições detalhadas, recomendação por posto e quadro e gestão colaborativa do catálogo.",
		stack: ["React 19", "Vite", "TanStack Router", "Supabase"],
		status: "active",
		url: "https://rumaer.iefa.com.br",
	},
	{
		icon: ClipboardCheck,
		slug: "forms",
		title: "Formulários IEFA",
		description:
			"Sistema de questionários internos para usuários @fab.mil.br — criação, coleta com salvamento automático e relatórios. Multi-tenant: serve também o Programa VETOR 5S (5s.iefa.com.br).",
		stack: ["React 19", "Vite", "TanStack Form", "Supabase"],
		status: "active",
		url: "https://forms.iefa.com.br",
	},
	{
		icon: Group,
		slug: "assignment-selection",
		title: "Escolha de Vagas — CPAINT",
		description: "Telão em tempo real e mesa de controle para as sessões de escolha de vagas da CPAINT — acompanhamento público e condução centralizada.",
		stack: ["React 19", "Vite", "TanStack Router", "Supabase"],
		status: "stable",
		url: "https://escolha.iefa.com.br",
	},
]

interface PackageEntry {
	slug: string
	description: string
	stack: string[]
}

const PACKAGES: PackageEntry[] = [
	{
		slug: "database",
		description: "Tipos TypeScript + migrations Supabase — schemas sisub, iefa e journal — compartilhado por todos os apps.",
		stack: ["TypeScript", "Supabase", "Migrations"],
	},
	{
		slug: "sisub-domain",
		description: "Lógica de domínio do Sisub — operações, schemas Zod, guards e tipos. Integração com PBAC para controle de permissões.",
		stack: ["TypeScript", "Zod", "PBAC"],
	},
	{
		slug: "pbac",
		description:
			"Sistema de controle de acesso baseado em permissões (PBAC) via Supabase — verificação e resolução de permissões por usuário e escopo organizacional.",
		stack: ["TypeScript", "Supabase"],
	},
	{
		slug: "hono-client",
		description: "Factories de cliente HTTP tipado para a API e o Projeto α — exporta createApiClient e createAlphaClient sobre Hono.",
		stack: ["TypeScript", "Hono"],
	},
	{
		slug: "alpha-client",
		description: "Wrapper de integração com LLMs via LangChain + OpenAI — configuração do modelo de chat e rastreamento de execuções para o Projeto α.",
		stack: ["TypeScript", "LangChain", "OpenAI"],
	},
	{
		slug: "ai-provider",
		description:
			"Camada unificada de provedores de IA — Bedrock, Anthropic, Gemini, Groq, OpenRouter, NVIDIA e Ollama — com compatibilidade LangChain e acesso keyless via IAM.",
		stack: ["TypeScript", "LLM", "Bedrock"],
	},
	{
		slug: "compras-api",
		description: "Cliente HTTP tipado do Portal de Compras do Governo Federal — tipos gerados do OpenAPI oficial sobre openapi-fetch.",
		stack: ["TypeScript", "OpenAPI"],
	},
]

const PRINCIPLES: Principle[] = [
	{
		index: "01",
		title: "Open-source por padrão",
		description:
			"Todo o código do ecossistema IEFA é público. Transparência não é exceção — é a estrutura. Contribuições externas são bem-vindas via pull requests no repositório oficial.",
	},
	{
		index: "02",
		title: "Monorepo como unidade de verdade",
		description:
			"Um único repositório Bun + Turborepo concentra todos os apps e packages. Nenhuma solução vive em silo: dependências compartilhadas, padrões unificados, CI único.",
	},
	{
		index: "03",
		title: "Rastreabilidade institucional",
		description:
			"Cada mudança relevante é registrada com Conventional Commits e escopo explícito (sisub, portal, api…). O histórico do repositório é o histórico do Instituto.",
	},
	{
		index: "04",
		title: "Qualidade como pré-condição",
		description:
			"Format check, lint e typecheck bloqueiam o commit via hook. Não existe código mal formatado em produção — e a convenção não depende de boa vontade individual.",
	},
	{
		index: "05",
		title: "Infraestrutura declarativa",
		description:
			"Migrações de banco (Supabase multi-schema), variáveis de ambiente tipadas e configuração de serviços são versionadas junto ao código — nunca gerenciadas manualmente.",
	},
]

// ─── Helpers ────────────────────────────────────────────────────────────────

const STEP_STATUS_CONFIG: Record<StepStatus, { label: string; icon: React.ElementType; className: string }> = {
	done: {
		label: "Concluído",
		icon: Check,
		className: "text-foreground",
	},
	"in-progress": {
		label: "Em andamento",
		icon: Clock,
		className: "text-muted-foreground",
	},
	planned: {
		label: "Planejado",
		icon: GitBranch,
		className: "text-muted-foreground/50",
	},
	vision: {
		label: "Visão",
		icon: MapIcon,
		className: "text-muted-foreground/30",
	},
}

const PHASE_STATUS_CONFIG: Record<PhaseStatus, { label: string; icon: React.ElementType; className: string }> = {
	done: {
		label: "Concluída",
		icon: Check,
		className: "text-foreground",
	},
	active: {
		label: "Em andamento",
		icon: Clock,
		className: "text-muted-foreground",
	},
	planned: {
		label: "Planejada",
		icon: Calendar,
		className: "text-muted-foreground/50",
	},
	vision: {
		label: "Visão",
		icon: MapIcon,
		className: "text-muted-foreground/30",
	},
}

const APP_STATUS_LABEL: Record<AppEntry["status"], string> = {
	stable: "Estável",
	active: "Ativo",
	planned: "Planejado",
}

// ─── Stats (derivados dos dados — usados no head() e no componente) ──────────

const _allSteps = APP_ROADMAPS.flatMap((ar) => ar.phases.flatMap((p) => p.steps))
const STATS = {
	done: _allSteps.filter((s) => s.status === "done").length,
	future: _allSteps.filter((s) => s.status === "planned" || s.status === "vision").length,
	appsActive: APPS.filter((a) => a.status !== "planned").length,
}

// ─── Componente ──────────────────────────────────────────────────────────────

function Roadmap() {
	const { done: doneCount, future: futureCount, appsActive } = STATS

	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero ────────────────────────────────────────────────────────── */}
			<section
				aria-label="Roadmap do ecossistema IEFA"
				className="relative w-full
          min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-2.5rem)]
          flex flex-col"
			>
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-6 px-4 py-12">
					<div className="flex flex-wrap gap-2 justify-center">
						<Badge variant="outline">Open-source</Badge>
						<Badge variant="outline">Monorepo</Badge>
						<Badge variant="outline">Bun · Turborepo</Badge>
					</div>

					<h1 className="text-hero text-balance">Roadmap</h1>

					<p className="text-label text-muted-foreground tracking-[0.2em]">Ecossistema de software do IEFA — histórico, estado atual e visão de futuro</p>

					<div className="flex flex-wrap gap-5 justify-center text-sm text-muted-foreground">
						<span className="inline-flex items-center gap-1.5">
							<Check className="h-4 w-4 shrink-0" aria-hidden="true" />
							{doneCount} passos concluídos
						</span>
						<span className="inline-flex items-center gap-1.5">
							<GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />
							{futureCount} entregas planejadas
						</span>
						<span className="inline-flex items-center gap-1.5">
							<Code className="h-4 w-4 shrink-0" aria-hidden="true" />
							{appsActive} apps em produção
						</span>
					</div>
				</div>

				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Seções de conteúdo ─────────────────────────────────────────── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28">
				{/* ── Roadmap por App ─────────────────────────────────────────── */}
				<section aria-labelledby="roadmap-heading">
					<div className="mb-8">
						<h2 id="roadmap-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Roadmap
						</h2>
						<p className="text-sm text-muted-foreground">
							Cada app tem seu próprio fluxo de evolução — fases independentes e entregáveis concretos por projeto.
						</p>
					</div>

					{/* Legenda */}
					<div className="flex flex-wrap gap-6 mb-10 pb-6 border-b border-border">
						{(Object.entries(STEP_STATUS_CONFIG) as [StepStatus, (typeof STEP_STATUS_CONFIG)[StepStatus]][]).map(([key, { label, icon: Icon, className }]) => (
							<span key={key} className={`inline-flex items-center gap-2 text-xs ${className}`}>
								<Icon className="h-3.5 w-3.5" aria-hidden="true" />
								<span className="text-label">{label}</span>
							</span>
						))}
					</div>

					{/* Apps */}
					<div className="flex flex-col gap-20">
						{APP_ROADMAPS.map((appRoadmap) => {
							const AppIcon = appRoadmap.icon
							const isDimmedApp = appRoadmap.status === "planned"

							return (
								<div key={appRoadmap.slug} className={isDimmedApp ? "opacity-60" : ""}>
									{/* App header */}
									<div className="flex items-center gap-4 mb-8 border-b-2 border-border pb-5">
										<div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
											<AppIcon className="h-4 w-4 text-foreground" aria-hidden="true" />
										</div>
										<div className="flex items-center gap-3 flex-1 min-w-0">
											<Badge variant="secondary" className="font-mono text-[10px] shrink-0">
												{appRoadmap.slug}
											</Badge>
											<h3 className="font-bold text-lg tracking-tight truncate">{appRoadmap.title}</h3>
										</div>
										<span className="text-label text-muted-foreground shrink-0">{APP_STATUS_LABEL[appRoadmap.status]}</span>
									</div>

									{/* Phases */}
									<div className="flex flex-col gap-10">
										{appRoadmap.phases.map((phase) => {
											const { label: phaseLabel, icon: PhaseIcon, className: phaseClassName } = PHASE_STATUS_CONFIG[phase.phaseStatus]
											const isDimmedPhase = phase.phaseStatus === "planned" || phase.phaseStatus === "vision"

											return (
												<div key={phase.number} className={isDimmedPhase ? "opacity-70" : ""}>
													{/* Phase header */}
													<div className="flex flex-wrap items-start justify-between gap-4 border-t border-dashed border-border pt-5 mb-5">
														<div className="flex items-start gap-4">
															<span className="font-mono text-3xl font-bold text-muted-foreground/20 tabular-nums shrink-0 leading-none mt-0.5">
																{phase.number}
															</span>
															<div>
																<h4 className="text-base font-bold tracking-tight">{phase.title}</h4>
																<p className="text-xs text-muted-foreground mt-0.5 text-pretty max-w-lg">{phase.subtitle}</p>
															</div>
														</div>
														<span className={`inline-flex items-center gap-1.5 text-xs ${phaseClassName} shrink-0 mt-1`}>
															<PhaseIcon className="h-3.5 w-3.5" aria-hidden="true" />
															<span className="text-label">{phaseLabel}</span>
														</span>
													</div>

													{/* Steps */}
													<ol className="flex flex-col" aria-label={`Passos da fase ${phase.number}: ${phase.title}`}>
														{phase.steps.map((step) => {
															const { icon: StepIcon, className: stepClassName, label: stepLabel } = STEP_STATUS_CONFIG[step.status]

															return (
																<li key={step.number} className="flex gap-5 md:gap-6 border-t border-border py-5">
																	{/* Step number */}
																	<span className="font-mono text-[10px] text-muted-foreground/40 tabular-nums shrink-0 w-7 pt-1 leading-none">
																		{step.number}
																	</span>

																	{/* Status icon */}
																	<div className="shrink-0 pt-0.5">
																		<StepIcon className={`h-4 w-4 ${stepClassName}`} aria-hidden="true" />
																	</div>

																	{/* Date or status label */}
																	<div className="shrink-0 w-28 pt-0.5">
																		{step.date ? (
																			<time className="text-label text-muted-foreground">{step.date}</time>
																		) : (
																			<span className={`text-label ${stepClassName}`}>{stepLabel}</span>
																		)}
																	</div>

																	{/* Content */}
																	<div className="flex flex-col gap-1.5 flex-1 min-w-0">
																		<h5 className="font-semibold text-base">{step.label}</h5>
																		<p className="text-sm text-muted-foreground text-pretty leading-relaxed">{step.description}</p>
																	</div>
																</li>
															)
														})}
													</ol>
												</div>
											)
										})}
									</div>
								</div>
							)
						})}
					</div>
				</section>

				<Separator />

				{/* ── Ecossistema de Apps ─────────────────────────────────────── */}
				<section aria-labelledby="ecosystem-heading">
					<div className="mb-8">
						<h2 id="ecosystem-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Ecossistema
						</h2>
						<p className="text-sm text-muted-foreground">
							Dez apps e sete packages compartilhados — todos no mesmo monorepo, com tooling e convenções unificadas.
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
						{APPS.map(({ icon: Icon, slug, title, description, stack, status, url }) => (
							<div key={slug} className={`border border-border bg-card flex flex-col p-6 gap-4 ${status === "planned" ? "opacity-60" : ""}`}>
								{/* Header */}
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="size-9 border border-border bg-muted flex items-center justify-center shrink-0">
											<Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
										</div>
										<Badge variant="secondary" className="font-mono text-[10px]">
											{slug}
										</Badge>
									</div>
									<span className="text-label text-muted-foreground">{APP_STATUS_LABEL[status]}</span>
								</div>

								{/* Título e descrição */}
								<div className="flex flex-col gap-1.5 flex-1">
									<h3 className="font-semibold text-base leading-snug">{title}</h3>
									<p className="text-xs text-muted-foreground text-pretty leading-relaxed">{description}</p>
								</div>

								{/* Stack */}
								<div className="flex flex-wrap gap-1.5 pt-4 border-t border-border">
									{stack.map((tech) => (
										<span key={tech} className="text-[10px] text-muted-foreground border border-border px-2 py-0.5 font-mono">
											{tech}
										</span>
									))}
								</div>

								{/* Link externo */}
								{url && (
									<a
										href={url}
										target="_blank"
										rel="noreferrer noopener"
										className="inline-flex items-center gap-1.5 text-xs text-muted-foreground
                      hover:text-foreground transition-colors mt-1
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
										aria-label={`Abrir ${title} em nova aba`}
									>
										<OpenNewWindow className="h-3 w-3" aria-hidden="true" />
										{url.replace("https://", "")}
									</a>
								)}
							</div>
						))}
					</div>

					{/* Packages */}
					<div className="mt-5 flex flex-col">
						{PACKAGES.map((pkg) => (
							<div key={pkg.slug} className="border-t border-border py-4 flex flex-wrap items-center gap-4">
								<div className="flex items-center gap-3 shrink-0 w-48">
									<Badge variant="secondary" className="font-mono text-[10px]">
										{pkg.slug}
									</Badge>
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-xs text-muted-foreground text-pretty">{pkg.description}</p>
								</div>
								<div className="flex flex-wrap gap-1.5 shrink-0">
									{pkg.stack.map((t) => (
										<span key={t} className="text-[10px] text-muted-foreground border border-border px-2 py-0.5 font-mono">
											{t}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</section>

				<Separator />

				{/* ── Princípios de Governança ─────────────────────────────────── */}
				<section aria-labelledby="principles-heading">
					<div className="mb-8">
						<h2 id="principles-heading" className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
							Princípios
						</h2>
						<p className="text-sm text-muted-foreground">Os valores que guiam decisões técnicas e organizacionais no ecossistema.</p>
					</div>

					<ol className="flex flex-col" aria-label="Princípios">
						{PRINCIPLES.map(({ index, title, description }) => (
							<li key={index} className="flex items-start gap-8 border-t border-border py-7">
								<span className="text-label text-muted-foreground shrink-0 tabular-nums w-6 pt-0.5">{index}.</span>
								<div className="flex flex-col gap-1.5">
									<h3 className="font-semibold text-base">{title}</h3>
									<p className="text-sm text-muted-foreground text-pretty leading-relaxed">{description}</p>
								</div>
							</li>
						))}
					</ol>
				</section>

				{/* ── Footer ──────────────────────────────────────────────────── */}
				<footer className="border-t pt-8 pb-4">
					<p className="text-xs text-muted-foreground text-pretty leading-relaxed">
						Esta página é atualizada a cada ciclo relevante de desenvolvimento. Última atualização: <strong>Julho de 2026</strong>. Repositório:{" "}
						<a
							href="https://github.com/IEFA-FAB"
							target="_blank"
							rel="noreferrer noopener"
							className="underline underline-offset-2 hover:text-foreground transition-colors"
						>
							github.com/IEFA-FAB
						</a>
						.
					</p>
				</footer>
			</div>
		</div>
	)
}
