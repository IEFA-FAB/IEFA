// ~/components/sidebar/nav-items.ts

import {
	ArrowUpDown,
	Banknote,
	BarChart3,
	Barcode,
	BookOpen,
	Building2,
	Calendar,
	CalendarClock,
	CalendarDays,
	CalendarRange,
	ChartPie,
	ChefHat,
	ClipboardCheck,
	ClipboardList,
	CookingPot,
	FileSignature,
	FileSpreadsheet,
	FileText,
	FlameKindling,
	GraduationCap,
	KeyRound,
	Landmark,
	LayoutDashboard,
	Library,
	ListChecks,
	ListTodo,
	LockKeyhole,
	type LucideIcon,
	MapPin,
	MessageSquare,
	Package,
	PackageCheck,
	PackageMinus,
	PackagePlus,
	PlaneTakeoff,
	QrCode,
	Receipt,
	RefreshCw,
	Sandwich,
	Scale,
	ScanQrCode,
	ScrollText,
	Settings,
	ShieldAlert,
	ShieldCheck,
	ShoppingBasket,
	ShoppingCart,
	SlidersHorizontal,
	Snowflake,
	Star,
	Truck,
	User,
	UserCog,
	Users,
	UtensilsCrossed,
	Wheat,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"
import { hasPermission } from "@/auth/pbac"
import { MFA_AVAILABLE } from "@/lib/assurance/mfa-availability"
import type { ScopeType } from "@/lib/command-palette"
import type { UserPermission } from "@/types/domain/permissions"

export type IconType = ComponentType<SVGProps<SVGSVGElement>>

export type ModuleId = "diner" | "messhall" | "unit" | "kitchen" | "kitchen-production" | "storage" | "global" | "admin" | "analytics" | "local-analytics"

export type GroupColor = "success" | "primary" | "warning" | "governance" | "admin"

export type NavItemDef = {
	title: string
	url: string
	icon: LucideIcon
	/**
	 * `minLevel` — nível PBAC mínimo exigido pela rota do item (default: 1).
	 * Usado para esconder do menu/hub os itens que o usuário não pode abrir,
	 * evitando o "bounce mudo" para o /hub ao clicar num item de nível superior.
	 */
	minLevel?: number
	/**
	 * Etapa do fluxo a que o item pertence — vira subtítulo na sidebar. Itens seguidos com o
	 * mesmo grupo formam uma seção; item sem grupo fica numa seção sem título.
	 */
	group?: string
	/** Sinônimos para a busca (Ctrl+K): o nome que o usuário fala, não o da tela. */
	keywords?: readonly string[]
}

/**
 * Módulo com escopo (messhall, unit, kitchen, kitchen-production, storage, local-analytics)
 * declara as três coisas juntas — o tipo impede um módulo novo com hub e sem `scopeType`,
 * que faria a busca (Ctrl+K) nunca achar o escopo dele.
 */
type ModuleScope =
	| { hubUrl?: undefined; scopeNoun?: undefined; scopeType?: undefined }
	| {
			/** Hub de seleção de escopo. O ModuleSwitcher e o Hub usam essa URL ao invés de items[0].url. */
			hubUrl: string
			/** O que o escopo é, para "trocar cozinha" / "trocar unidade" */
			scopeNoun: string
			/** Tipo de escopo PBAC — o mesmo `{ type }` do `requirePermission` da rota `$id` do módulo */
			scopeType: ScopeType
	  }

export type ModuleDef = {
	id: ModuleId
	name: string
	icon: LucideIcon
	color: GroupColor
	items: NavItemDef[]
} & ModuleScope

const CHAT_KEYWORDS = ["chat", "ia", "assistente", "perguntar"] as const

/** Catálogo completo de módulos e suas páginas, na ordem do fluxo de trabalho. */
export const ALL_MODULES: ModuleDef[] = [
	{
		id: "diner",
		name: "Comensal",
		icon: UtensilsCrossed,
		color: "success",
		items: [
			{ title: "Previsão", url: "/diner/forecast", icon: Calendar, keywords: ["arranchamento", "marcar refeição", "rancho"] },
			{ title: "Cardápio", url: "/diner/menu", icon: BookOpen, keywords: ["menu", "refeição do dia"] },
			{ title: "Pedidos de Lanche", url: "/diner/snack-requests", icon: PlaneTakeoff, keywords: ["lanche de bordo", "lanche de apoio", "missão"] },
			{ title: "Meu QR Code", url: "/diner/qr-code", icon: QrCode, keywords: ["qr", "identificação"] },
			{ title: "Auto Check-in", url: "/diner/self-check-in", icon: ScanQrCode, keywords: ["check-in", "ler qr"] },
			// Conta do usuário — separada do uso diário do rancho
			{ title: "Perfil", url: "/diner/profile", icon: User, group: "Minha conta", keywords: ["dados militares", "conta"] },
			// Some junto com a verificação em duas etapas (`MFA_AVAILABLE`).
			...(MFA_AVAILABLE
				? [
						{
							title: "Segurança",
							url: "/diner/security",
							icon: LockKeyhole,
							group: "Minha conta",
							keywords: ["2fa", "mfa", "verificação em duas etapas", "sessões", "dispositivos"],
						},
					]
				: []),
			{ title: "Chaves MCP", url: "/diner/mcp-keys", icon: KeyRound, group: "Minha conta", keywords: ["api", "token", "integração"] },
		],
	},
	{
		id: "messhall",
		name: "Fiscal",
		icon: ShieldCheck,
		color: "primary",
		hubUrl: "/messhall",
		scopeNoun: "refeitório",
		scopeType: "mess_hall",
		// URLs base — AppShell substitui por /messhall/{id}/... quando dentro de um escopo
		// "/messhall/" → após substituição vira "/messhall/{id}/" (rota index)
		items: [{ title: "Presenças", url: "/messhall/", icon: ClipboardCheck, keywords: ["fiscalização", "scanner", "leitor", "presença"] }],
	},
	{
		id: "unit",
		name: "Gestão Unidade",
		icon: Building2,
		color: "warning",
		hubUrl: "/unit",
		scopeNoun: "unidade",
		scopeType: "unit",
		items: [
			{ title: "Painel", url: "/unit/dashboard", icon: LayoutDashboard, keywords: ["visão geral", "alertas"] },
			{
				title: "Anexos Quantitativos",
				url: "/unit/procurement",
				icon: FileText,
				group: "Contratação",
				keywords: ["anexo", "quantitativo", "tr", "termo de referência", "licitação", "arp", "registro de preços", "pesquisa de preços"],
			},
			{ title: "Crédito Disponível", url: "/unit/credit", icon: Landmark, group: "Execução orçamentária", keywords: ["saldo", "orçamento", "nc"] },
			{ title: "Empenhos", url: "/unit/empenhos", icon: FileSignature, group: "Execução orçamentária", keywords: ["ne", "nota de empenho"] },
			{ title: "Liquidações", url: "/unit/liquidations", icon: Receipt, minLevel: 2, group: "Execução orçamentária", keywords: ["ns", "liquidar"] },
			{ title: "Pagamentos", url: "/unit/payments", icon: Banknote, minLevel: 2, group: "Execução orçamentária", keywords: ["ob", "ordem bancária", "pagar"] },
			{ title: "SIAFI", url: "/unit/siafi", icon: RefreshCw, minLevel: 2, group: "Integração", keywords: ["importar", "tesouro gerencial"] },
			{ title: "Conciliação", url: "/unit/reconciliation", icon: Scale, minLevel: 2, group: "Integração", keywords: ["conferir siafi", "divergência"] },
			{ title: "Assistente IA", url: "/unit/chat", icon: MessageSquare, keywords: CHAT_KEYWORDS },
			{ title: "Configurações", url: "/unit/settings", icon: Settings, keywords: ["uasg", "ajustes da unidade"] },
		],
	},
	{
		id: "kitchen",
		name: "Gestão Cozinha",
		icon: ChefHat,
		color: "warning",
		hubUrl: "/kitchen",
		scopeNoun: "cozinha",
		scopeType: "kitchen",
		// URLs base — AppShell substitui por /kitchen/{id}/... quando dentro de um escopo
		items: [
			// Ordem de leitura do planejamento: o que se repete (semanal), o que é pontual (evento,
			// apoio) e, por último, onde tudo isso vira o que a cozinha produz em cada dia.
			{
				title: "Cardápios Semanais",
				url: "/kitchen/weekly-menus",
				icon: CalendarDays,
				group: "Planejamento da Produção",
				keywords: ["cardápio", "semana"],
			},
			{
				title: "Eventos",
				url: "/kitchen/events",
				icon: CalendarRange,
				group: "Planejamento da Produção",
				keywords: ["evento especial", "festa", "solenidade"],
			},
			{
				title: "Apoios",
				url: "/kitchen/exceptions",
				icon: Sandwich,
				group: "Planejamento da Produção",
				keywords: ["coffee break", "café de reunião", "exceção"],
			},
			{
				title: "Agendamento da Produção",
				url: "/kitchen/planning",
				icon: Calendar,
				group: "Planejamento da Produção",
				keywords: ["calendário", "planejamento", "agenda", "dia", "o que produzir"],
			},
			{ title: "Preparações", url: "/kitchen/recipes", icon: UtensilsCrossed, group: "Operação", keywords: ["receita", "ficha técnica"] },
			{
				title: "Pedidos de Lanche",
				url: "/kitchen/snack-requests",
				icon: PlaneTakeoff,
				group: "Operação",
				keywords: ["lanche de bordo", "lanche de apoio", "missão", "requisição"],
			},
			{
				title: "Previsão de demanda",
				url: "/kitchen/suprimentos",
				icon: ShoppingCart,
				group: "Planejamento da Produção",
				keywords: ["suprimentos", "compras", "solicitação de compra", "pedido de compra", "enviar à unidade", "anexo quantitativo"],
			},
			{ title: "Equipamentos", url: "/kitchen/equipment", icon: CookingPot, group: "Operação", keywords: ["forno", "manutenção", "pane"] },
			{ title: "QR Check-in", url: "/kitchen/qr-code", icon: QrCode, minLevel: 2, group: "Operação", keywords: ["qr code", "check-in"] },
			{ title: "Assistente IA", url: "/kitchen/chat", icon: MessageSquare, keywords: CHAT_KEYWORDS },
			{ title: "Configurações", url: "/kitchen/settings", icon: Settings, keywords: ["ajustes da cozinha"] },
		],
	},
	{
		id: "kitchen-production",
		name: "Produção Cozinha",
		icon: FlameKindling,
		color: "primary",
		hubUrl: "/kitchen-production",
		scopeNoun: "cozinha",
		scopeType: "kitchen",
		items: [
			{ title: "Painel", url: "/kitchen-production/", icon: LayoutDashboard, keywords: ["produção do dia", "tarefas", "preparo"] },
			{ title: "Equipamentos", url: "/kitchen-production/equipment", icon: CookingPot, keywords: ["pane", "manutenção"] },
		],
	},
	{
		id: "storage",
		name: "Estoque",
		icon: Package,
		color: "primary",
		hubUrl: "/storage",
		scopeNoun: "cozinha",
		scopeType: "kitchen",
		// URLs base — AppShell substitui por /storage/{id}/... quando dentro de um escopo
		items: [
			{ title: "Painel", url: "/storage/dashboard", icon: LayoutDashboard, keywords: ["saldo", "estoque atual", "fefo"] },
			{
				title: "Ordens de Fornecimento",
				url: "/storage/supply-orders",
				icon: ShoppingCart,
				minLevel: 2,
				group: "Entrada",
				keywords: ["of", "pedido ao fornecedor"],
			},
			{ title: "A caminho", url: "/storage/incoming", icon: Truck, group: "Entrada", keywords: ["entregas", "chegando"] },
			{ title: "Notas Fiscais (NF-e)", url: "/storage/nfe", icon: FileText, group: "Entrada", keywords: ["nota fiscal", "nfe", "xml"] },
			{ title: "Recebimentos", url: "/storage/receiving", icon: PackageCheck, group: "Entrada", keywords: ["receber", "conferência", "entrada"] },
			{
				title: "Carga inicial",
				url: "/storage/opening",
				icon: PackagePlus,
				minLevel: 2,
				group: "Entrada",
				keywords: ["abertura", "saldo inicial", "planilha"],
			},
			{ title: "Saída do dia", url: "/storage/issue", icon: PackageMinus, minLevel: 2, group: "Saída", keywords: ["retirada", "requisição"] },
			{ title: "Baixa por Produção", url: "/storage/production-issue", icon: FlameKindling, minLevel: 2, group: "Saída", keywords: ["consumo"] },
			{ title: "Ajustes", url: "/storage/adjustments", icon: ArrowUpDown, minLevel: 2, group: "Saída", keywords: ["perda", "quebra", "sobra", "descarte"] },
			{ title: "Contagem Física", url: "/storage/counts", icon: ListChecks, minLevel: 3, group: "Controle", keywords: ["inventário", "balanço"] },
			{ title: "Vencimentos", url: "/storage/expiry", icon: CalendarClock, group: "Controle", keywords: ["validade", "lote", "vencido"] },
			{ title: "Sugestões de Reposição", url: "/storage/replenishment", icon: ShoppingBasket, group: "Controle", keywords: ["mrp", "reposição", "comprar"] },
			{ title: "Relatórios MCASP", url: "/storage/reports", icon: FileSpreadsheet, group: "Controle", keywords: ["relatório", "contábil", "rmb"] },
			{ title: "Testar leitor", url: "/storage/scanner", icon: Barcode, keywords: ["scanner", "código de barras", "leitor"] },
			{ title: "Configurações", url: "/storage/settings", icon: SlidersHorizontal, minLevel: 3, keywords: ["ajustes do estoque"] },
		],
	},
	{
		// Governança de CONTEÚDO: o catálogo canônico da FAB e o fluxo de curadoria.
		// A administração de plataforma (permissões, avaliação, sincronização, treino) saiu
		// daqui para o módulo `admin` — trabalho diário e reversível separado do raro e perigoso.
		id: "global",
		name: "Catálogo Global",
		icon: Library,
		color: "governance",
		items: [
			{ title: "Insumos", url: "/global/ingredients", icon: Wheat, group: "Catálogo", keywords: ["ingrediente", "catmat", "gênero"] },
			{ title: "Preparações", url: "/global/recipes", icon: UtensilsCrossed, group: "Catálogo", keywords: ["receita", "ficha técnica"] },
			{
				title: "Preparações Congeladas",
				url: "/global/frozen-preparations",
				icon: Snowflake,
				group: "Catálogo",
				keywords: ["congelado", "semiacabado", "regeneração"],
			},
			{ title: "Equipamentos", url: "/global/equipment", icon: CookingPot, minLevel: 2, group: "Catálogo", keywords: ["tipo de equipamento", "modelo"] },
			{ title: "Locais", url: "/global/places-manager", icon: MapPin, minLevel: 2, group: "Catálogo", keywords: ["rancho", "refeitório", "cozinha", "om"] },
			{ title: "Planos Semanais", url: "/global/weekly-plans", icon: CalendarDays, group: "Modelos de cardápio", keywords: ["cardápio modelo", "template"] },
			{ title: "Eventos", url: "/global/events", icon: CalendarRange, group: "Modelos de cardápio", keywords: ["evento modelo"] },
			{
				title: "Apoios",
				url: "/global/exceptions",
				icon: Sandwich,
				group: "Modelos de cardápio",
				keywords: ["apoio modelo", "coffee break", "café de reunião", "exceção modelo"],
			},
			{ title: "Filas de Revisão", url: "/global/review-queues", icon: ListTodo, group: "Curadoria", keywords: ["pendência", "revisar", "unidade de medida"] },
			{ title: "Política de Revisão", url: "/global/policy", icon: ClipboardList, minLevel: 2, group: "Curadoria", keywords: ["regra", "revisão"] },
			{ title: "Assistente IA", url: "/global/chat", icon: MessageSquare, keywords: CHAT_KEYWORDS },
		],
	},
	{
		// Administração de PLATAFORMA — módulo PBAC `admin`, alto risco e baixa frequência.
		// Backfill inicial concede `admin` a quem já tinha `global`; grants futuros são separados.
		id: "admin",
		name: "Administração do Sistema",
		icon: Settings,
		color: "admin",
		items: [
			{ title: "Permissões", url: "/admin/permissions", icon: UserCog, minLevel: 2, keywords: ["acesso", "usuário", "pbac", "conceder"] },
			{ title: "Avaliação", url: "/admin/evaluation", icon: Star, minLevel: 2, keywords: ["pesquisa", "pergunta"] },
			{ title: "Sincronização", url: "/admin/sync-routines", icon: RefreshCw, minLevel: 2, keywords: ["compras.gov", "nutrição", "sync", "rotina"] },
			// Nível 1: o painel mostra o estado do ambiente; só o botão de reset exige nível 2.
			{ title: "Ambiente de Treino", url: "/admin/training", icon: GraduationCap, keywords: ["treino", "reset", "treinamento"] },
			// Nível 3: o registro reúne, num lugar só, quem mexeu em permissão e quem moveu
			// dinheiro público. Quem concede acesso (nível 2) não precisa ler o histórico de todos.
			{ title: "Operações Sensíveis", url: "/admin/audit-log", icon: ScrollText, minLevel: 3, keywords: ["auditoria", "log", "histórico"] },
			// Nível 3 pelo mesmo motivo do registro: a lista é nominal e diz de cada pessoa se a
			// conta dela está sem segundo fator — é inventário de fragilidade.
			...(MFA_AVAILABLE
				? [{ title: "Verificação em 2 Etapas", url: "/admin/mfa-adoption", icon: ShieldAlert, minLevel: 3, keywords: ["mfa", "2fa", "adoção"] }]
				: []),
		],
	},
	{
		id: "analytics",
		name: "Análises Globais",
		icon: BarChart3,
		color: "governance",
		items: [
			{ title: "Visão Global", url: "/analytics/global", icon: BarChart3, minLevel: 2, keywords: ["power bi", "relatório", "sistêmica"] },
			{ title: "Efetivo da Rede", url: "/analytics/workforce", icon: Users, minLevel: 2, keywords: ["efetivo", "militares"] },
			{ title: "Equipamentos", url: "/analytics/equipment", icon: CookingPot, minLevel: 2, keywords: ["frota", "parque"] },
			{ title: "Plano de Contratações", url: "/analytics/procurement-plan", icon: ClipboardList, minLevel: 2, keywords: ["pca", "plano anual"] },
			{ title: "Assistente IA", url: "/analytics/chat", icon: MessageSquare, keywords: CHAT_KEYWORDS },
		],
	},
	{
		id: "local-analytics",
		name: "Análises da Unidade",
		icon: ChartPie,
		color: "governance",
		hubUrl: "/local-analytics",
		scopeNoun: "unidade",
		scopeType: "unit",
		items: [
			{ title: "Painel", url: "/local-analytics/dashboard", icon: LayoutDashboard, keywords: ["previsões", "presença em tempo real"] },
			{ title: "Indicadores", url: "/local-analytics/indicators", icon: BarChart3, keywords: ["power bi", "relatório"] },
			{ title: "Efetivo dos Ranchos", url: "/local-analytics/workforce", icon: Users, keywords: ["efetivo"] },
			{ title: "Assistente IA", url: "/local-analytics/chat", icon: MessageSquare, keywords: CHAT_KEYWORDS },
		],
	},
]

/**
 * Retorna os módulos acessíveis para o conjunto de permissões PBAC do usuário,
 * já com os itens filtrados pelo nível mínimo de cada um.
 *
 * Filtra em duas camadas:
 *   1. Itens — esconde os que exigem nível acima do que o usuário possui no módulo
 *      (ex: `global:1` não vê "Permissões", que exige `global:2`).
 *   2. Módulos — mantém só os que têm permissão de leitura e ao menos um item visível
 *      (ou um hub de escopo).
 *
 * Sem isso, o menu mostraria itens que apenas redirecionam de volta ao /hub ao clicar.
 */
export function getModulesForPermissions(permissions: UserPermission[]): ModuleDef[] {
	return ALL_MODULES.map((m) => ({
		...m,
		items: m.items.filter((it) => hasPermission(permissions, m.id, it.minLevel ?? 1)),
	})).filter((m) => hasPermission(permissions, m.id) && (m.items.length > 0 || !!m.hubUrl))
}

export function getModuleFromPath(pathname: string): ModuleId | null {
	const segment = pathname.split("/").filter(Boolean)[0]
	const found = ALL_MODULES.find((m) => m.id === segment)
	return found?.id ?? null
}

// Flat list of nav items (for breadcrumbs)
export type NavItem = {
	to: string
	label: string
	icon?: IconType
}

export function getNavItemsForPermissions(permissions: UserPermission[]): NavItem[] {
	return getModulesForPermissions(permissions).flatMap((m) => m.items.map((it) => ({ to: it.url, label: it.title, icon: it.icon as IconType })))
}
