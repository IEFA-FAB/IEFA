import {
	Activity,
	Banknote,
	Bell,
	BookOpen,
	Brain,
	Calculator,
	Calendar,
	ChevronRight,
	ClipboardList,
	Cloud,
	Cpu,
	Database,
	Edit2,
	FileBarChart,
	FileText,
	Globe,
	Layout,
	LayoutGrid,
	Mail,
	MessageSquare,
	Monitor,
	Plane,
	Plus,
	Search,
	ShieldCheck,
	Sparkles,
	StickyNote,
	Terminal,
	Ticket,
	Trash2,
	Users,
	X,
	Zap,
} from "lucide-react"
import { motion } from "motion/react"
import React from "react"

const IconRenderer = ({ iconKey, className }: { iconKey: string; className?: string }) => {
	switch (iconKey) {
		case "ShieldCheck":
			return <ShieldCheck className={className} />
		case "Activity":
			return <Activity className={className} />
		case "MessageSquare":
			return <MessageSquare className={className} />
		case "FileText":
			return <FileText className={className} />
		case "BookOpen":
			return <BookOpen className={className} />
		case "Cpu":
			return <Cpu className={className} />
		case "Terminal":
			return <Terminal className={className} />
		case "Zap":
			return <Zap className={className} />
		case "Database":
			return <Database className={className} />
		case "Banknote":
			return <Banknote className={className} />
		case "Monitor":
			return <Monitor className={className} />
		case "Calendar":
			return <Calendar className={className} />
		case "Calculator":
			return <Calculator className={className} />
		case "Plane":
			return <Plane className={className} />
		case "FileBarChart":
			return <FileBarChart className={className} />
		case "Search":
			return <Search className={className} />
		case "LayoutGrid":
			return <LayoutGrid className={className} />
		case "Ticket":
			return <Ticket className={className} />
		case "Globe":
			return <Globe className={className} />
		case "Mail":
			return <Mail className={className} />
		case "Brain":
			return <Brain className={className} />
		case "Sparkles":
			return <Sparkles className={className} />
		case "Cloud":
			return <Cloud className={className} />
		case "Users":
			return <Users className={className} />
		case "StickyNote":
			return <StickyNote className={className} />
		case "Bell":
			return <Bell className={className} />
		default:
			return <Layout className={className} />
	}
}

interface Tool {
	id: string
	title: string
	description: string
	url: string
	icon: React.ReactNode | string // Support both JSX and icon name
	category: string
	iconColor?: string
}

interface ChecklistItem {
	id: string
	task: string
	deadline: string // e.g., "2º dia útil do mês"
	description: string
	responsible: string
	path?: string
}

interface Notice {
	id: string
	content: string
	date: string
	type: "info" | "alert"
}

interface UnitResponsibility {
	code: string
	name: string
	operator: string
}

// Utility to calculate Nth business day of current month
const getNthBusinessDay = (n: string): string => {
	const match = n.match(/(\d+)/)
	if (!match) return n

	const targetDay = parseInt(match[1], 10)
	const now = new Date()
	const year = now.getFullYear()
	const month = now.getMonth()

	let count = 0
	let currentDay = 1

	while (count < targetDay && currentDay <= 31) {
		const date = new Date(year, month, currentDay)
		if (date.getMonth() !== month) break

		const dayOfWeek = date.getDay()
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			// Not Sat or Sun
			count++
		}

		if (count === targetDay) {
			return date.toLocaleDateString("pt-BR")
		}
		currentDay++
	}

	return n
}

const sucontTools: Tool[] = [
	{
		id: "auditor",
		title: "Auditor SUCONT-4",
		description: "Ferramenta principal de auditoria e análise de dados.",
		url: "https://auditorsucont4.new-emmanoel.workers.dev/",
		icon: <ShieldCheck className="w-6 h-6" />,
		category: "Auditoria",
		iconColor: "bg-tech-blue",
	},
	{
		id: "monitoramento",
		title: "Monitoramento Patrimonial",
		description: "Acompanhamento em tempo real de conformidade patrimonial.",
		url: "https://conformidadecontabil.new-emmanoel.workers.dev/",
		icon: <Activity className="w-6 h-6" />,
		category: "Monitoramento",
		iconColor: "bg-tech-cyan",
	},
	{
		id: "plataforma-doc",
		title: "Plataforma de Automação de Documentação",
		description: "Sistema centralizado para geração e gestão automatizada de documentos.",
		url: "https://plataformadedocumentacao.new-emmanoel.workers.dev/",
		icon: <Zap className="w-6 h-6" />,
		category: "Automação",
		iconColor: "bg-emerald-600",
	},
	{
		id: "sau-chatbot",
		title: "Chatbot SAU",
		description: "Assistente inteligente para suporte administrativo unificado.",
		url: "https://notebooklm.google.com/notebook/69f8cb5d-7656-42b2-91f1-36d998b02a37?authuser=1",
		icon: <MessageSquare className="w-6 h-6" />,
		category: "IA / Chatbot",
		iconColor: "bg-teal-600",
	},
	{
		id: "siafi-automate",
		title: "MSG SIAFI Automate",
		description: "Automação de mensagens e processos do sistema SIAFI.",
		url: "https://notebooklm.google.com/notebook/f3995b07-12af-45bf-89b6-451723cfefb4?authuser=1",
		icon: <Terminal className="w-6 h-6" />,
		category: "Automação",
		iconColor: "bg-tech-blue",
	},
	{
		id: "oficios-automate",
		title: "Automação de Ofícios",
		description: "Sistema de auxílio na geração e padronização de ofícios.",
		url: "https://notebooklm.google.com/notebook/2f39d31e-a0c6-435c-9c6f-00ae19039138?authuser=1",
		icon: <FileText className="w-6 h-6" />,
		category: "Automação",
		iconColor: "bg-emerald-600",
	},
	{
		id: "manual-interno",
		title: "Manual Interno SUCONT-4",
		description: "Diretrizes e procedimentos internos da seção.",
		url: "https://docs.google.com/document/d/1E0rUh29RAmq7mEbJl50xKfA63szBv7kDwXLmTfocOWg/edit?tab=t.n2lgxw4p7bn1#heading=h.vlw5v11g3kkn",
		icon: <FileText className="w-6 h-6" />,
		category: "Documentação",
		iconColor: "bg-slate-500",
	},
	{
		id: "radae-manuais",
		title: "Manuais Eletrônicos do RADA-e",
		description: "Repositório oficial de manuais eletrônicos da DIREF.",
		url: "http://www.diref.intraer/index.php/servicos/manuais/manuais",
		icon: <BookOpen className="w-6 h-6" />,
		category: "Documentação",
		iconColor: "bg-tech-blue",
	},
	{
		id: "chatbot-oficio-cabw",
		title: "Chatbot Ofício CABW",
		description: "Assistente para elaboração de ofícios da CABW.",
		url: "https://notebooklm.google.com/notebook/23333c8a-aa7a-4405-8156-fb893398a1da",
		icon: <MessageSquare className="w-6 h-6" />,
		category: "IA / Chatbot",
		iconColor: "bg-teal-600",
	},
	{
		id: "chatbot-aut-oficios",
		title: "Chatbot Automação de Ofícios",
		description: "IA para auxílio na gestão e criação de ofícios.",
		url: "https://notebooklm.google.com/notebook/2f39d31e-a0c6-435c-9c6f-00ae19039138",
		icon: <Cpu className="w-6 h-6" />,
		category: "IA / Chatbot",
		iconColor: "bg-emerald-600",
	},
	{
		id: "chatbot-tcu",
		title: "Chatbot Auditoria TCU",
		description: "Assistente especializado em normas e auditorias do TCU.",
		url: "https://notebooklm.google.com/notebook/e3ad873a-f9fd-44e0-8f50-1d7f39c06c46",
		icon: <ShieldCheck className="w-6 h-6" />,
		category: "IA / Chatbot",
		iconColor: "bg-tech-blue",
	},
	{
		id: "fab-sucont-chatbot",
		title: "Chatbot FAB/SUCONT-4",
		description: "Assistente especializado em normas da FAB e SUCONT-4.",
		url: "https://notebooklm.google.com/notebook/2ea19b26-e16b-45b8-9aad-22f58d3b457a?authuser=1",
		icon: <Cpu className="w-6 h-6" />,
		category: "IA / Chatbot",
		iconColor: "bg-tech-cyan",
	},
]

const externalSystems: Tool[] = [
	{
		id: "google-agenda",
		title: "Google Agenda",
		description: "Cronograma e compromissos.",
		url: "https://calendar.google.com/",
		icon: <Calendar className="w-4 h-4" />,
		category: "Organização",
	},
	{
		id: "sau-system",
		title: "SAU's",
		description: "Sistema de Atendimento Unificado.",
		url: "http://sau.servicos.ccarj.intraer/sau/consumer",
		icon: <Ticket className="w-4 h-4" />,
		category: "Sistemas",
	},
	{
		id: "sigadaer",
		title: "Sigadaer",
		description: "Informações Gerenciais.",
		url: "https://app.sigadaer.intraer/",
		icon: <Globe className="w-4 h-4" />,
		category: "Sistemas",
	},
	{
		id: "diref-manuais",
		title: "Manuais Eletrônicos do RADA-e",
		description: "Repositório oficial.",
		url: "http://www.diref.intraer/index.php/servicos/manuais/manuais",
		icon: <BookOpen className="w-4 h-4" />,
		category: "Documentação",
	},
	{
		id: "siafi-web",
		title: "Siafi Web",
		description: "Portal do Tesouro.",
		url: "https://siafi.tesouro.gov.br/senha/public/pages/security/login.jsf",
		icon: <Banknote className="w-4 h-4" />,
		category: "Sistemas",
	},
	{
		id: "siloms-contabil",
		title: "Siloms Contábil",
		description: "Prestação de contas.",
		url: "http://siloms.servicos.ccarj.intraer/siloms-prestacao/faces/index.xhtml",
		icon: <Calculator className="w-4 h-4" />,
		category: "Sistemas",
	},
	{
		id: "siloms-mac",
		title: "SILOMS MAC",
		description: "Sistema Integrado de Logística.",
		url: "https://mac1.siloms.intraer/siloms_mac/servlet/aqs01001w",
		icon: <Plane className="w-4 h-4" />,
		category: "Sistemas",
	},
	{
		id: "zimbra",
		title: "Zimbra",
		description: "Webmail Intraer.",
		url: "http://siloms.servicos.ccarj.intraer/siloms-prestacao/faces/index.xhtml",
		icon: <Mail className="w-4 h-4" />,
		category: "Comunicação",
	},
	{
		id: "tesouro-gerencial",
		title: "Tesouro Gerencial",
		description: "Relatórios gerenciais.",
		url: "https://tesourogerencial.tesouro.gov.br/tg/servlet/mstrWeb?pg=login&v=1772494208370",
		icon: <Monitor className="w-4 h-4" />,
		category: "Sistemas",
	},
]

const reportTools: Tool[] = [
	{
		id: "saldos-siloms",
		title: "Saldos Patrimoniais SILOMS",
		description: "Consulta de saldos executivos no SILOMS.",
		url: "http://siloms.servicos.ccarj.intraer/siloms-prestacao/faces/patSaldosComaerExec.xhtml",
		icon: <Database className="w-4 h-4" />,
		category: "Relatórios",
	},
	{
		id: "saldos-siafi",
		title: "Saldos Patrimoniais SIAFI",
		description: "Consulta de saldos no Tesouro Gerencial/SIAFI.",
		url: "https://tesourogerencial.tesouro.gov.br/tg/servlet/mstrWeb",
		icon: <FileBarChart className="w-4 h-4" />,
		category: "Relatórios",
	},
]

const iaTools: Tool[] = [
	{
		id: "gemini",
		title: "Gemini",
		description: "Google AI.",
		url: "https://gemini.google.com/",
		icon: (
			<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
				<path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
			</svg>
		),
		category: "IA",
		iconColor: "bg-tech-blue",
	},
	{
		id: "chatgpt",
		title: "ChatGPT",
		description: "OpenAI.",
		url: "https://chatgpt.com/",
		icon: (
			<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
				<path d="M22.28 7.53c-.52-3.67-3.28-6.44-6.96-6.96C13.42.28 10.58.28 8.68.57 5 1.09 2.24 3.85 1.72 7.53c-.29 1.9-.29 4.74 0 6.64.52 3.67 3.28 6.44 6.96 6.96 1.9.29 4.74.29 6.64 0 3.67-.52 6.44-3.28 6.96-6.96.29-1.9.29-4.74 0-6.64zm-10.28 10.47c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
			</svg>
		),
		category: "IA",
		iconColor: "bg-emerald-600",
	},
	{
		id: "claude",
		title: "Claude",
		description: "Anthropic.",
		url: "https://claude.ai/",
		icon: (
			<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
				<path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
			</svg>
		),
		category: "IA",
		iconColor: "bg-orange-600",
	},
	{
		id: "manus",
		title: "Manus IA",
		description: "Assistente Digital.",
		url: "https://manus.ai/",
		icon: <Brain className="w-5 h-5" />,
		category: "IA",
		iconColor: "bg-purple-600",
	},
	{
		id: "grok",
		title: "Grok",
		description: "xAI.",
		url: "https://x.com/i/grok",
		icon: <Zap className="w-5 h-5" />,
		category: "IA",
		iconColor: "bg-black",
	},
	{
		id: "notebooklm",
		title: "NotebookLM",
		description: "Google Research.",
		url: "https://notebooklm.google.com/",
		icon: <BookOpen className="w-5 h-5" />,
		category: "IA",
		iconColor: "bg-tech-cyan",
	},
]

const initialChecklist: ChecklistItem[] = [
	{
		id: "xml-deprec",
		task: "Verificação de Carga de XML de Depreciação",
		deadline: "2º dia útil do mês",
		description: "Confirmar se cada UG realizou a carga do arquivo XML de depreciação e baixa de bens. Cobrar as UGs que não cumpriram o prazo.",
		responsible: "Cada Responsável",
		path: "Tesouro Gerencial: Sucont-4.1 > Monitoramento das UG > Acomp. registro da depreciação e amortização mensal por UG",
	},
	{
		id: "relat-deprec",
		task: "Relatório Depreciação > Bem",
		deadline: "4° dia útil do mês",
		description:
			"Comparar o saldo de depreciação acumulada com o saldo do bem no SIAFI. Identificar e reportar UGs com saldo de depreciação superior ao valor contábil do bem.",
		responsible: "Cada Responsável",
		path: "Tesouro Gerencial: Sucont-4.1 > Monitoramento das UG > CONSOLIDADA - COMP BENS MÓVEIS E DEP ACUM",
	},
	{
		id: "prest-contas",
		task: "Prestação de Contas",
		deadline: "4° dia útil do mês",
		description: "Acompanhamento do fechamento SIAFI.",
		responsible: "Vanessa",
	},
	{
		id: "restr-contabil",
		task: "Relatório Restrição Contábil",
		deadline: "4° dia útil do mês",
		description: "Pós fechamento SIAFI e Relatório de Depreciação.",
		responsible: "Klebson",
	},
	{
		id: "conc-transito",
		task: "Conciliação Mensal de Contas de Trânsito",
		deadline: "Mensal",
		description: "Verificar discrepâncias entre Conta de trânsito (1.2.3.1.1.99.05) e Conta de controle (899920202).",
		responsible: "Cada Responsável",
		path: "Tesouro Gerencial: Sucont-4 > Relatórios para Consultas por UG EXEC Parciais > Auditor de documento - compatibilidade controle x transito de BMP",
	},
	{
		id: "pos-prest",
		task: "Acompanhamento Pós-Prestação de Contas",
		deadline: "1x por semana",
		description: "Priorizar análise das UGs com maiores diferenças contábeis e solicitar ajustes formais.",
		responsible: "Cada Responsável",
	},
	{
		id: "contas-conc",
		task: "Monitoramento de Contas Conciliadas (TCU)",
		deadline: "1x por semana",
		description: "Verificar mensalmente as contas 1.2.3.1.1.01.15, 1.2.3.1.1.02.01, 1.2.3.1.1.05.03, 1.2.3.1.1.05.05, 1.2.3.1.1.05.06.",
		responsible: "SGT KLEBSON, 3S VANESSA, SGT IARA",
	},
]

const initialNotices: Notice[] = [
	{
		id: "notice-1",
		content: "Reunião de alinhamento mensal agendada para o 1º dia útil.",
		date: "01/03/2026",
		type: "info",
	},
	{
		id: "notice-2",
		content: "Lembrete: Prazo final para carga de XML de depreciação se aproxima.",
		date: "02/03/2026",
		type: "alert",
	},
]

const unitResponsibilities: UnitResponsibility[] = [
	{ code: "120005", name: "PABR", operator: "3S VANESSA" },
	{ code: "120007", name: "PARF", operator: "3S VANESSA" },
	{ code: "120013", name: "CLA", operator: "3S VANESSA" },
	{ code: "120014", name: "BAFZ", operator: "3S VANESSA" },
	{ code: "120019", name: "HARF", operator: "3S VANESSA" },
	{ code: "120029", name: "BAAF", operator: "3S VANESSA" },
	{ code: "120030", name: "BAGL", operator: "3S VANESSA" },
	{ code: "120049", name: "PAMA GL", operator: "3S VANESSA" },
	{ code: "120062", name: "BASP", operator: "3S VANESSA" },
	{ code: "120065", name: "FAYS", operator: "3S VANESSA" },
	{ code: "120069", name: "CRCEA-SE", operator: "3S VANESSA" },
	{ code: "120071", name: "CELOG", operator: "3S VANESSA" },
	{ code: "120075", name: "BACO", operator: "3S VANESSA" },
	{ code: "120077", name: "HACO", operator: "3S VANESSA" },
	{ code: "120087", name: "BABE", operator: "3S VANESSA" },
	{ code: "120091", name: "CABE", operator: "3S VANESSA" },
	{ code: "120094", name: "CINDACTA IV", operator: "3S VANESSA" },
	{ code: "120096", name: "HFAB", operator: "3S VANESSA" },
	{ code: "120108", name: "COPAC", operator: "3S VANESSA" },
	{ code: "120195", name: "CAE", operator: "3S VANESSA" },
	{ code: "120260", name: "SERINFRA BR", operator: "3S VANESSA" },
	{ code: "120623", name: "GAP AF", operator: "3S VANESSA" },
	{ code: "120624", name: "BAAN", operator: "3S VANESSA" },
	{ code: "120630", name: "GAP MN", operator: "3S VANESSA" },
	{ code: "120636", name: "GAP LS", operator: "3S VANESSA" },
	{ code: "120637", name: "BABV", operator: "3S VANESSA" },
	{ code: "120641", name: "BAPV", operator: "3S VANESSA" },
	{ code: "120645", name: "GAP GL", operator: "3S VANESSA" },
	{ code: "120001", name: "GABAER", operator: "SGT KLEBSON" },
	{ code: "120006", name: "GAP BR", operator: "SGT KLEBSON" },
	{ code: "120008", name: "CINDACTA I", operator: "SGT KLEBSON" },
	{ code: "120015", name: "CLBI", operator: "SGT KLEBSON" },
	{ code: "120039", name: "GAP RJ", operator: "SGT KLEBSON" },
	{ code: "120040", name: "HCA", operator: "SGT KLEBSON" },
	{ code: "120045", name: "PAGL", operator: "SGT KLEBSON" },
	{ code: "120047", name: "PAMB RJ", operator: "SGT KLEBSON" },
	{ code: "120048", name: "PAME RJ", operator: "SGT KLEBSON" },
	{ code: "120066", name: "HFASP", operator: "SGT KLEBSON" },
	{ code: "120068", name: "PAMA SP", operator: "SGT KLEBSON" },
	{ code: "120072", name: "CINDACTA II", operator: "SGT KLEBSON" },
	{ code: "120073", name: "BAFL", operator: "SGT KLEBSON" },
	{ code: "120082", name: "BAMN", operator: "SGT KLEBSON" },
	{ code: "120154", name: "HAMN", operator: "SGT KLEBSON" },
	{ code: "120225", name: "SERINFRA SJ", operator: "SGT KLEBSON" },
	{ code: "120255", name: "SERINFRA BE", operator: "SGT KLEBSON" },
	{ code: "120259", name: "SERINFRA CO", operator: "SGT KLEBSON" },
	{ code: "120261", name: "SERINFRA MN", operator: "SGT KLEBSON" },
	{ code: "120512", name: "PASJ", operator: "SGT KLEBSON" },
	{ code: "120628", name: "GAP BE", operator: "SGT KLEBSON" },
	{ code: "120631", name: "BANT", operator: "SGT KLEBSON" },
	{ code: "120638", name: "BACG", operator: "SGT KLEBSON" },
	{ code: "120643", name: "BASM", operator: "SGT KLEBSON" },
	{ code: "120004", name: "BABR", operator: "3S TALITA" },
	{ code: "120016", name: "GAP SJ", operator: "3S TALITA" },
	{ code: "120021", name: "CINDACTA III", operator: "3S TALITA" },
	{ code: "120023", name: "BASV", operator: "3S TALITA" },
	{ code: "120025", name: "EPCAR", operator: "3S TALITA" },
	{ code: "120026", name: "PAMA LS", operator: "3S TALITA" },
	{ code: "120041", name: "HAAF", operator: "3S TALITA" },
	{ code: "120042", name: "HFAG", operator: "3S TALITA" },
	{ code: "120053", name: "PAAF", operator: "3S TALITA" },
	{ code: "120060", name: "AFA", operator: "3S TALITA" },
	{ code: "120061", name: "BAST", operator: "3S TALITA" },
	{ code: "120064", name: "EEAR", operator: "3S TALITA" },
	{ code: "120088", name: "COMARA", operator: "3S TALITA" },
	{ code: "120089", name: "HABE", operator: "3S TALITA" },
	{ code: "120090", name: "CABW", operator: "3S TALITA" },
	{ code: "120097", name: "PASP", operator: "3S TALITA" },
	{ code: "120099", name: "DIRINFRA", operator: "3S TALITA" },
	{ code: "120100", name: "SDAB", operator: "3S TALITA" },
	{ code: "120127", name: "CISCEA", operator: "3S TALITA" },
	{ code: "120152", name: "CPBV", operator: "3S TALITA" },
	{ code: "120257", name: "SERINFRA RJ", operator: "3S TALITA" },
	{ code: "120265", name: "SERINFRA NT", operator: "3S TALITA" },
	{ code: "120625", name: "GAP DF", operator: "3S TALITA" },
	{ code: "120629", name: "GAP CO", operator: "3S TALITA" },
	{ code: "120632", name: "GAP RF", operator: "3S TALITA" },
	{ code: "120633", name: "GAP SP", operator: "3S TALITA" },
	{ code: "120669", name: "BASC", operator: "3S TALITA" },
]

const ToolCard: React.FC<{ tool: Tool; index: number }> = ({ tool, index }) => {
	const renderIcon = () => {
		if (typeof tool.icon === "string") {
			return <IconRenderer iconKey={tool.icon} className="w-6 h-6" />
		}
		// If it's objects (from localStorage serializing JSX)
		if (tool.icon && typeof tool.icon === "object" && !React.isValidElement(tool.icon)) {
			return <FileBarChart className="w-6 h-6" />
		}
		return tool.icon as React.ReactNode
	}

	return (
		<motion.a
			href={tool.url}
			target="_blank"
			rel="noopener noreferrer"
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.1 }}
			whileHover={{ y: -8, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}
			className="group relative bg-white rounded-2xl p-8 flex flex-col h-full transition-all duration-300 border border-slate-100 shadow-sm"
		>
			<div className="flex justify-between items-start mb-6">
				<div className={`p-4 ${tool.iconColor || "bg-tech-cyan"} rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
					{renderIcon()}
				</div>
				<span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
					{tool.category}
				</span>
			</div>

			<h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-tech-cyan transition-colors">{tool.title}</h3>

			<p className="text-slate-500 text-sm leading-relaxed mb-8 flex-grow">{tool.description}</p>

			<div className="flex items-center text-tech-cyan text-sm font-bold uppercase tracking-tight">
				Acessar Analistas <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
			</div>
		</motion.a>
	)
}

const SidebarRailItem: React.FC<{ tool: Tool; index: number; side: "left" | "right" }> = ({ tool, index, side }) => {
	const renderIcon = () => {
		if (typeof tool.icon === "string") {
			return <IconRenderer iconKey={tool.icon} className="w-4 h-4" />
		}
		if (tool.icon && typeof tool.icon === "object" && !React.isValidElement(tool.icon)) {
			return <Layout className="w-4 h-4" />
		}
		return tool.icon
	}

	return (
		<motion.a
			href={tool.url}
			target="_blank"
			rel="noopener noreferrer"
			initial={{ opacity: 0, scale: 0.8 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ delay: index * 0.05 }}
			whileHover={{ scale: 1.1 }}
			className="relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-slate-100"
		>
			<div className={`transition-colors ${tool.iconColor ? "text-slate-400 group-hover:text-tech-cyan" : "text-slate-400 group-hover:text-tech-cyan"}`}>
				{renderIcon()}
			</div>
			<div className={side === "left" ? "tooltip" : "right-tooltip"}>{tool.title}</div>
		</motion.a>
	)
}

export default function App() {
	const [activeTab, setActiveTab] = React.useState<"dashboard" | "workspace" | "reports">("dashboard")
	const [checklist, setChecklist] = React.useState<ChecklistItem[]>(() => {
		const saved = localStorage.getItem("sucont_checklist")
		return saved ? JSON.parse(saved) : initialChecklist
	})
	const [notices, setNotices] = React.useState<Notice[]>(() => {
		const saved = localStorage.getItem("sucont_notices")
		return saved ? JSON.parse(saved) : initialNotices
	})
	const [reports, setReports] = React.useState<Tool[]>(() => {
		const saved = localStorage.getItem("sucont_reports")
		return saved ? JSON.parse(saved) : reportTools
	})
	const [notes, setNotes] = React.useState(() => localStorage.getItem("sucont_notes") || "")
	const [editingId, setEditingId] = React.useState<string | null>(null)
	const [isAddingTask, setIsAddingTask] = React.useState(false)
	const [isAddingNotice, setIsAddingNotice] = React.useState(false)
	const [isAddingReport, setIsAddingReport] = React.useState(false)
	const [searchQuery, setSearchQuery] = React.useState("")

	React.useEffect(() => {
		localStorage.setItem("sucont_checklist", JSON.stringify(checklist))
	}, [checklist])

	React.useEffect(() => {
		localStorage.setItem("sucont_notices", JSON.stringify(notices))
	}, [notices])

	React.useEffect(() => {
		localStorage.setItem("sucont_reports", JSON.stringify(reports))
	}, [reports])

	React.useEffect(() => {
		localStorage.setItem("sucont_notes", notes)
	}, [notes])

	const updateResponsible = (id: string, newResponsible: string) => {
		setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, responsible: newResponsible } : item)))
		setEditingId(null)
	}

	const addTask = (task: Partial<ChecklistItem>) => {
		const newItem: ChecklistItem = {
			id: `task-${Date.now()}`,
			task: task.task || "Nova Tarefa",
			deadline: task.deadline || "Mensal",
			description: task.description || "",
			responsible: task.responsible || "Pendente",
			path: task.path,
		}
		setChecklist((prev) => [...prev, newItem])
		setIsAddingTask(false)
	}

	const deleteTask = (id: string) => {
		setChecklist((prev) => prev.filter((item) => item.id !== id))
	}

	const addNotice = (content: string, type: "info" | "alert") => {
		const newNotice: Notice = {
			id: `notice-${Date.now()}`,
			content,
			type,
			date: new Date().toLocaleDateString("pt-BR"),
		}
		setNotices((prev) => [newNotice, ...prev])
		setIsAddingNotice(false)
	}

	const deleteNotice = (id: string) => {
		setNotices((prev) => prev.filter((n) => n.id !== id))
	}

	const addReport = (report: Partial<Tool>) => {
		const newReport: Tool = {
			id: `report-${Date.now()}`,
			title: report.title || "Novo Relatório",
			description: report.description || "",
			url: report.url || "#",
			icon: "FileBarChart",
			category: "Relatórios",
			iconColor: "bg-tech-blue",
		}
		setReports((prev) => [...(prev || []), newReport])
		setIsAddingReport(false)
	}

	const deleteReport = (id: string) => {
		setReports((prev) => prev.filter((r) => r.id !== id))
	}

	const [activeCategory, setActiveCategory] = React.useState<string>("Visão Geral")

	const filteredTools = (
		activeCategory === "Visão Geral" ? sucontTools : sucontTools.filter((t) => t.category.includes(activeCategory) || activeCategory.includes(t.category))
	).filter(
		(t) =>
			t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
			t.category.toLowerCase().includes(searchQuery.toLowerCase())
	)

	const filteredChecklist = checklist.filter(
		(item) =>
			item.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.responsible.toLowerCase().includes(searchQuery.toLowerCase())
	)

	const filteredReports = (reports || []).filter(
		(report) =>
			(report.title || "").toLowerCase().includes(searchQuery.toLowerCase()) || (report.description || "").toLowerCase().includes(searchQuery.toLowerCase())
	)

	return (
		<div className="min-h-screen bg-tech-bg selection:bg-tech-cyan/10 selection:text-tech-cyan flex">
			{/* Left Sidebar Rail */}
			<aside className="sidebar-rail w-64 hidden lg:flex flex-col p-6">
				<div className="flex items-center gap-3 mb-10">
					<div className="w-10 h-10 bg-tech-blue rounded-xl flex items-center justify-center text-white shadow-lg">
						<Monitor className="w-6 h-6" />
					</div>
					<div className="flex flex-col">
						<h2 className="text-sm font-bold text-slate-800 leading-tight">Centro de Monitoramento</h2>
						<span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">DIREF • COMAER</span>
					</div>
				</div>

				<nav className="flex flex-col gap-2">
					{[
						{ id: "Visão Geral", icon: <LayoutGrid className="w-4 h-4" /> },
						{ id: "Auditoria", icon: <ShieldCheck className="w-4 h-4" /> },
						{ id: "Monitoramento", icon: <Activity className="w-4 h-4" /> },
						{ id: "IA / Chatbot", icon: <MessageSquare className="w-4 h-4" /> },
						{ id: "Automação", icon: <Zap className="w-4 h-4" /> },
						{ id: "Documentação", icon: <FileText className="w-4 h-4" /> },
					].map((cat) => (
						<button
							key={cat.id}
							onClick={() => setActiveCategory(cat.id)}
							className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeCategory === cat.id ? "bg-tech-blue text-white shadow-md" : "text-slate-500 hover:bg-slate-50"}`}
						>
							{cat.icon}
							<span className="text-xs font-bold">{cat.id}</span>
						</button>
					))}
				</nav>

				<div className="mt-auto p-4 bg-slate-50 rounded-2xl border border-slate-100">
					<div className="flex items-center gap-2 mb-2">
						<ShieldCheck className="w-3 h-3 text-tech-blue" />
						<span className="text-[10px] font-bold text-slate-600 uppercase">Uso Institucional</span>
					</div>
					<p className="text-[9px] text-slate-400 leading-relaxed">Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF).</p>
				</div>
			</aside>

			{/* Main Content Area */}
			<div className="flex-grow relative z-10 lg:ml-64 lg:mr-16">
				<header className="pt-12 pb-10 px-8 max-w-6xl mx-auto">
					<div className="relative bg-slate-900 rounded-[2rem] p-12 overflow-hidden mb-12 shadow-2xl">
						<div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
							<svg viewBox="0 0 100 100" className="w-full h-full text-white fill-current">
								<path d="M50 10 L90 90 L50 70 L10 90 Z" />
							</svg>
						</div>

						<div className="relative z-10">
							<div className="flex gap-2 mb-6">
								<span className="text-[10px] font-bold text-white/60 bg-white/10 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
									Força Aérea Brasileira
								</span>
								<span className="text-[10px] font-bold text-white/60 bg-white/10 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
									DIREF • SUCONT
								</span>
							</div>

							<h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-4 leading-tight">
								SUCONT-4 <span className="text-tech-cyan">HUB</span>
							</h1>

							<p className="text-white/60 max-w-2xl text-sm leading-relaxed mb-10">
								Plataforma centralizada para ferramentas de análise contábil e suporte ao usuário. Promovendo excelência, padronização e apoio à tomada de
								decisão no Comando da Aeronáutica.
							</p>

							<div className="flex flex-wrap gap-4">
								<button
									onClick={() => setActiveTab("dashboard")}
									className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === "dashboard" ? "bg-tech-blue text-white shadow-lg" : "bg-white/5 text-white hover:bg-white/10"}`}
								>
									DASHBOARD
								</button>
								<button
									onClick={() => setActiveTab("workspace")}
									className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === "workspace" ? "bg-tech-blue text-white shadow-lg" : "bg-white/5 text-white hover:bg-white/10"}`}
								>
									ÁREA DE TRABALHO
								</button>
								<button
									onClick={() => setActiveTab("reports")}
									className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === "reports" ? "bg-tech-blue text-white shadow-lg" : "bg-white/5 text-white hover:bg-white/10"}`}
								>
									RELATÓRIOS
								</button>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
						<Search className="w-4 h-4 text-slate-400 ml-2" />
						<input
							type="text"
							placeholder="Buscar por módulo, assunto, Q35, SIAFI, Restos a Pagar..."
							className="bg-transparent border-none outline-none text-sm text-slate-600 w-full"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</header>

				<main className="px-8 pb-24 max-w-6xl mx-auto">
					{activeTab === "dashboard" ? (
						<>
							<div className="flex items-center gap-4 mb-8">
								<LayoutGrid className="text-tech-cyan w-5 h-5" />
								<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">{activeCategory}</h2>
								<div className="flex-grow h-[1px] bg-slate-200" />
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
								{filteredTools.map((tool, index) => (
									<ToolCard key={tool.id} tool={tool} index={index} />
								))}
							</div>
						</>
					) : activeTab === "workspace" ? (
						<div className="space-y-12">
							{/* Workspace Header */}
							<div className="flex items-center gap-4 mb-8">
								<ClipboardList className="text-tech-cyan w-5 h-5" />
								<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Cronograma & Atividades</h2>
								<div className="flex-grow h-[1px] bg-slate-200" />
							</div>

							{/* Checklist Section */}
							<div className="space-y-4">
								<div className="flex justify-end">
									<button
										onClick={() => setIsAddingTask(true)}
										className="flex items-center gap-2 bg-white border border-slate-200 text-tech-cyan px-4 py-2 rounded-md text-xs font-mono hover:bg-slate-50 transition-all shadow-sm"
									>
										<Plus className="w-4 h-4" /> ADICIONAR TAREFA
									</button>
								</div>

								{isAddingTask && (
									<motion.div
										initial={{ opacity: 0, scale: 0.95 }}
										animate={{ opacity: 1, scale: 1 }}
										className="bg-white border border-tech-cyan/30 p-6 rounded-lg mb-6 shadow-lg"
									>
										<h3 className="text-slate-800 font-bold mb-4 text-sm uppercase">Nova Atividade</h3>
										<form
											onSubmit={(e) => {
												e.preventDefault()
												const formData = new FormData(e.currentTarget)
												addTask({
													task: formData.get("task") as string,
													deadline: formData.get("deadline") as string,
													description: formData.get("description") as string,
													responsible: formData.get("responsible") as string,
													path: formData.get("path") as string,
												})
											}}
											className="grid grid-cols-1 md:grid-cols-2 gap-4"
										>
											<input
												name="task"
												placeholder="Título da Tarefa"
												required
												className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
											/>
											<input
												name="deadline"
												placeholder="Prazo (ex: 2º dia útil)"
												required
												className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
											/>
											<input
												name="responsible"
												placeholder="Responsável"
												required
												className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
											/>
											<input
												name="path"
												placeholder="Caminho/Sistema (Opcional)"
												className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
											/>
											<textarea
												name="description"
												placeholder="Descrição da atividade"
												className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 md:col-span-2 h-20 focus:border-tech-cyan outline-none"
											/>
											<div className="flex gap-2 md:col-span-2 justify-end">
												<button type="button" onClick={() => setIsAddingTask(false)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800">
													CANCELAR
												</button>
												<button type="submit" className="bg-tech-cyan text-white px-6 py-2 rounded font-bold text-xs shadow-md">
													SALVAR TAREFA
												</button>
											</div>
										</form>
									</motion.div>
								)}

								<div className="grid grid-cols-1 gap-4">
									{filteredChecklist.map((item, idx) => (
										<motion.div
											key={item.id}
											initial={{ opacity: 0, x: -20 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ delay: idx * 0.05 }}
											className="bg-white border border-slate-200 p-5 rounded-lg hover:border-tech-cyan/30 transition-all group shadow-sm"
										>
											<div className="flex flex-col md:flex-row justify-between gap-4">
												<div className="flex-grow">
													<div className="flex items-center gap-3 mb-2">
														<div className="flex flex-col">
															<span className="text-tech-cyan font-mono text-[10px] bg-tech-cyan/5 px-2 py-0.5 rounded border border-tech-cyan/10 uppercase w-fit">
																{item.deadline}
															</span>
															<span className="text-[9px] font-mono text-slate-400 mt-1">Data: {getNthBusinessDay(item.deadline)}</span>
														</div>
														<h4 className="text-slate-800 font-bold">{item.task}</h4>
													</div>
													<p className="text-slate-500 text-xs leading-relaxed mb-3">{item.description}</p>
													{item.path && (
														<div className="flex items-start gap-2 text-[10px] font-mono text-slate-400 bg-slate-50 p-2 rounded border border-slate-100">
															<Terminal className="w-3 h-3 mt-0.5 shrink-0" />
															<span>{item.path}</span>
														</div>
													)}
												</div>
												<div className="md:w-48 shrink-0 flex flex-col justify-center items-end border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
													<span className="text-[10px] font-mono uppercase text-slate-400 mb-1">Responsável</span>
													{editingId === item.id ? (
														<div className="flex gap-2 w-full">
															<input
																className="bg-slate-50 border border-tech-cyan/30 text-slate-800 text-xs p-1 rounded w-full focus:outline-none focus:border-tech-cyan"
																defaultValue={item.responsible}
																onKeyDown={(e) => {
																	if (e.key === "Enter") updateResponsible(item.id, e.currentTarget.value)
																	if (e.key === "Escape") setEditingId(null)
																}}
																onBlur={(e) => updateResponsible(item.id, e.target.value)}
															/>
														</div>
													) : (
														<div className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingId(item.id)}>
															<span className="text-xs font-bold text-tech-cyan">{item.responsible}</span>
															<Edit2 className="w-3 h-3 text-slate-300 group-hover:text-tech-cyan transition-colors" />
														</div>
													)}
													<button
														onClick={() => deleteTask(item.id)}
														className="mt-4 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 text-[9px] font-mono"
													>
														<Trash2 className="w-3 h-3" /> EXCLUIR
													</button>
												</div>
											</div>
										</motion.div>
									))}
								</div>
							</div>

							{/* Notes & Notices Section */}
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<section>
									<div className="flex items-center gap-3 mb-4">
										<StickyNote className="text-tech-cyan w-4 h-4" />
										<h3 className="text-slate-700 font-bold uppercase tracking-widest text-xs">Anotações da Seção</h3>
									</div>
									<textarea
										value={notes}
										onChange={(e) => setNotes(e.target.value)}
										placeholder="Digite aqui anotações importantes, pendências ou lembretes..."
										className="w-full h-64 bg-white border border-slate-200 rounded-lg p-4 text-slate-600 text-sm font-mono focus:outline-none focus:border-tech-cyan/40 transition-all resize-none shadow-sm"
									/>
									<div className="mt-2 flex justify-end">
										<span className="text-[9px] font-mono text-slate-400 uppercase">Auto-save ativo</span>
									</div>
								</section>

								<section>
									<div className="flex items-center justify-between mb-4">
										<div className="flex items-center gap-3">
											<Bell className="text-tech-blue w-4 h-4" />
											<h3 className="text-slate-700 font-bold uppercase tracking-widest text-xs">Avisos & Alertas</h3>
										</div>
										<button onClick={() => setIsAddingNotice(true)} className="text-tech-cyan hover:text-slate-800 transition-colors">
											<Plus className="w-4 h-4" />
										</button>
									</div>

									{isAddingNotice && (
										<motion.div
											initial={{ opacity: 0, y: -10 }}
											animate={{ opacity: 1, y: 0 }}
											className="bg-white border border-tech-cyan/30 p-4 rounded-lg mb-4 shadow-md"
										>
											<textarea
												id="notice-input"
												placeholder="Novo aviso..."
												className="w-full bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 mb-2 h-20 outline-none focus:border-tech-cyan"
											/>
											<div className="flex justify-between items-center">
												<select id="notice-type" className="bg-slate-50 border border-slate-200 text-[10px] text-slate-600 p-1 rounded outline-none">
													<option value="info">INFORMATIVO</option>
													<option value="alert">ALERTA</option>
												</select>
												<div className="flex gap-2">
													<button onClick={() => setIsAddingNotice(false)} className="text-[10px] text-slate-400 hover:text-slate-600">
														CANCELAR
													</button>
													<button
														onClick={() => {
															const input = document.getElementById("notice-input") as HTMLTextAreaElement
															const type = document.getElementById("notice-type") as HTMLSelectElement
															if (input.value) addNotice(input.value, type.value as "info" | "alert")
														}}
														className="bg-tech-cyan text-white px-3 py-1 rounded font-bold text-[10px] shadow-sm"
													>
														SALVAR
													</button>
												</div>
											</div>
										</motion.div>
									)}

									<div className="space-y-3">
										{notices.map((notice) => (
											<div
												key={notice.id}
												className={`group relative border-l-4 p-4 rounded-r-lg shadow-sm ${notice.type === "alert" ? "bg-orange-50 border-orange-400" : "bg-blue-50 border-blue-400"}`}
											>
												<button
													onClick={() => deleteNotice(notice.id)}
													className="absolute top-2 right-2 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
												>
													<X className="w-3 h-3" />
												</button>
												<p className="text-xs text-slate-700 font-medium">{notice.content}</p>
												<span className="text-[9px] font-mono text-slate-400 mt-2 block uppercase">Postado em: {notice.date}</span>
											</div>
										))}
									</div>
								</section>
							</div>

							{/* Units Division Section */}
							<section>
								<div className="flex items-center gap-4 mb-8">
									<Users className="text-tech-cyan w-5 h-5" />
									<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Divisão de Unidades (UGs)</h2>
									<div className="flex-grow h-[1px] bg-slate-200" />
								</div>

								<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
									{["3S VANESSA", "SGT KLEBSON", "3S TALITA"].map((operator) => (
										<div key={operator} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
											<div className="bg-slate-50 p-3 border-b border-slate-100">
												<h4 className="text-slate-700 font-bold text-center text-xs uppercase tracking-widest">{operator}</h4>
											</div>
											<div className="p-4 max-h-96 overflow-y-auto custom-scrollbar">
												<table className="w-full text-[10px] font-mono">
													<thead>
														<tr className="text-slate-400 border-b border-slate-100">
															<th className="text-left pb-2">UG</th>
															<th className="text-left pb-2">NOME</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-slate-50">
														{unitResponsibilities
															.filter((u) => u.operator === operator)
															.map((u) => (
																<tr key={u.code} className="hover:bg-slate-50 transition-colors">
																	<td className="py-2 text-tech-cyan font-bold">{u.code}</td>
																	<td className="py-2 text-slate-600">{u.name}</td>
																</tr>
															))}
													</tbody>
												</table>
											</div>
											<div className="bg-slate-50 p-2 text-center border-t border-slate-100">
												<span className="text-[9px] font-mono text-slate-400">
													Total: {unitResponsibilities.filter((u) => u.operator === operator).length} UGs
												</span>
											</div>
										</div>
									))}
								</div>
							</section>
						</div>
					) : (
						<div className="space-y-12">
							{/* Reports Header */}
							<div className="flex items-center gap-4 mb-8">
								<FileBarChart className="text-tech-cyan w-5 h-5" />
								<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Gestão de Relatórios</h2>
								<div className="flex-grow h-[1px] bg-slate-200" />
							</div>

							<div className="flex justify-end">
								<button
									onClick={() => setIsAddingReport(true)}
									className="flex items-center gap-2 bg-white border border-slate-200 text-tech-cyan px-4 py-2 rounded-md text-xs font-mono hover:bg-slate-50 transition-all shadow-sm"
								>
									<Plus className="w-4 h-4" /> ANEXAR RELATÓRIO
								</button>
							</div>

							{isAddingReport && (
								<motion.div
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									className="bg-white border border-tech-cyan/30 p-6 rounded-lg mb-6 shadow-lg"
								>
									<h3 className="text-slate-800 font-bold mb-4 text-sm uppercase">Novo Relatório</h3>
									<form
										onSubmit={(e) => {
											e.preventDefault()
											const formData = new FormData(e.currentTarget)
											addReport({
												title: formData.get("title") as string,
												url: formData.get("url") as string,
												description: formData.get("description") as string,
											})
										}}
										className="grid grid-cols-1 md:grid-cols-2 gap-4"
									>
										<input
											name="title"
											placeholder="Título do Relatório"
											required
											className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
										/>
										<input
											name="url"
											placeholder="URL do Relatório"
											required
											className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 focus:border-tech-cyan outline-none"
										/>
										<textarea
											name="description"
											placeholder="Descrição breve"
											className="bg-slate-50 border border-slate-200 p-2 rounded text-xs text-slate-800 md:col-span-2 h-20 focus:border-tech-cyan outline-none"
										/>
										<div className="flex gap-2 md:col-span-2 justify-end">
											<button type="button" onClick={() => setIsAddingReport(false)} className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800">
												CANCELAR
											</button>
											<button type="submit" className="bg-tech-cyan text-white px-6 py-2 rounded font-bold text-xs shadow-md">
												SALVAR RELATÓRIO
											</button>
										</div>
									</form>
								</motion.div>
							)}

							<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
								{filteredReports.map((report, index) => (
									<div key={report.id} className="relative group">
										<ToolCard tool={report} index={index} />
										<button
											onClick={() => deleteReport(report.id)}
											className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm z-20"
											title="Excluir Relatório"
										>
											<Trash2 className="w-4 h-4" />
										</button>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Footer Stats/Info */}
					<motion.footer
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 1 }}
						className="mt-20 pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6"
					>
						<div className="flex gap-8">
							<div className="flex flex-col">
								<span className="text-[10px] font-mono uppercase text-slate-400">Status do Sistema</span>
								<span className="text-xs font-mono text-emerald-600 flex items-center gap-2">
									<span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
									OPERACIONAL
								</span>
							</div>
							<div className="flex flex-col">
								<span className="text-[10px] font-mono uppercase text-slate-400">Versão Hub</span>
								<span className="text-xs font-mono text-slate-500">v3.0.0-LIGHT</span>
							</div>
						</div>

						<div className="text-[10px] font-mono text-slate-400 text-center md:text-right">
							© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB
							<br />
							ACESSO RESTRITO
						</div>
					</motion.footer>
				</main>
			</div>

			{/* Right Sidebar Rail */}
			<aside className="fixed right-0 top-0 h-screen w-16 bg-white border-l border-slate-200 z-30 flex flex-col items-center py-6 gap-4">
				<div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 mb-4">
					<LayoutGrid className="w-4 h-4" />
				</div>

				<div className="flex flex-col gap-4">
					{externalSystems.map((tool, index) => (
						<SidebarRailItem key={tool.id} tool={tool} index={index} side="right" />
					))}
				</div>

				<div className="w-8 h-[1px] bg-slate-100 my-2" />

				<div className="flex flex-col gap-4">
					{iaTools.map((tool, index) => (
						<SidebarRailItem key={tool.id} tool={tool} index={index} side="right" />
					))}
				</div>

				<div className="w-8 h-[1px] bg-slate-100 my-2" />

				<div className="flex flex-col gap-4">
					{reportTools.map((tool, index) => (
						<SidebarRailItem key={tool.id} tool={tool} index={index} side="right" />
					))}
				</div>
			</aside>
		</div>
	)
}
