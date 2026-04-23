// ~/components/sidebar/nav-items.ts

import {
	BarChart3,
	BookOpen,
	Building2,
	Calendar,
	CalendarDays,
	CalendarRange,
	ChefHat,
	ClipboardCheck,
	ClipboardList,
	FileText,
	FlameKindling,
	KeyRound,
	LayoutDashboard,
	type LucideIcon,
	MapPin,
	MessageSquare,
	QrCode,
	RefreshCw,
	Settings,
	ShieldCheck,
	ShoppingCart,
	Star,
	User,
	UtensilsCrossed,
	Wheat,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"
import { hasPermission } from "@/auth/pbac"
import type { UserPermission } from "@/types/domain/permissions"

export type IconType = ComponentType<SVGProps<SVGSVGElement>>

export type ModuleId = "diner" | "messhall" | "unit" | "kitchen" | "kitchen-production" | "global" | "analytics" | "local-analytics"

export type ModuleDef = {
	id: ModuleId
	name: string
	icon: LucideIcon
	/**
	 * Para módulos com escopo (messhall, unit, kitchen, kitchen-production, local-analytics),
	 * aponta para o hub de seleção de escopo.
	 * O TeamSwitcher e o Hub page usam essa URL ao invés de items[0].url.
	 */
	hubUrl?: string
	items: { title: string; url: string; icon: LucideIcon }[]
}

/** Catálogo completo de módulos e suas páginas. */
export const ALL_MODULES: ModuleDef[] = [
	{
		id: "diner",
		name: "Comensal",
		icon: UtensilsCrossed,
		items: [
			{ title: "Previsão", url: "/diner/forecast", icon: Calendar },
			{ title: "Cardápio", url: "/diner/menu", icon: BookOpen },
			{ title: "Meu QR Code", url: "/diner/qr-code", icon: QrCode },
			{ title: "Perfil", url: "/diner/profile", icon: User },
			{ title: "Auto Check-in", url: "/diner/self-check-in", icon: ClipboardCheck },
			{ title: "Chaves MCP", url: "/diner/mcp-keys", icon: KeyRound },
		],
	},
	{
		id: "messhall",
		name: "Fiscal",
		icon: ShieldCheck,
		hubUrl: "/messhall",
		// URLs base — AppShell substitui por /messhall/{id}/... quando dentro de um escopo
		// "/messhall/" → após substituição vira "/messhall/{id}/" (rota index)
		items: [{ title: "Presenças", url: "/messhall/", icon: ClipboardCheck }],
	},
	{
		id: "unit",
		name: "Gestão Unidade",
		icon: Building2,
		hubUrl: "/unit",
		items: [
			{ title: "Painel", url: "/unit/dashboard", icon: LayoutDashboard },
			{ title: "Atas", url: "/unit/procurement", icon: FileText },
			{ title: "Assistente IA", url: "/unit/chat", icon: MessageSquare },
			{ title: "Configurações", url: "/unit/settings", icon: Settings },
		],
	},
	{
		id: "kitchen",
		name: "Gestão Cozinha",
		icon: ChefHat,
		hubUrl: "/kitchen",
		// URLs base — AppShell substitui por /kitchen/{id}/... quando dentro de um escopo
		items: [
			{ title: "Cardápios Semanais", url: "/kitchen/weekly-menus", icon: CalendarDays },
			{ title: "Eventos", url: "/kitchen/events", icon: CalendarRange },
			{ title: "Planejamento", url: "/kitchen/planning", icon: Calendar },
			{ title: "Preparações", url: "/kitchen/recipes", icon: UtensilsCrossed },
			{ title: "Suprimentos", url: "/kitchen/suprimentos", icon: ShoppingCart },
			{ title: "QR Check-in", url: "/kitchen/qr-code", icon: QrCode },
			{ title: "Assistente IA", url: "/kitchen/chat", icon: MessageSquare },
			{ title: "Configurações", url: "/kitchen/settings", icon: Settings },
		],
	},
	{
		id: "kitchen-production",
		name: "Produção Cozinha",
		icon: FlameKindling,
		hubUrl: "/kitchen-production",
		items: [{ title: "Painel", url: "/kitchen-production/dashboard", icon: LayoutDashboard }],
	},
	{
		id: "global",
		name: "SDAB",
		icon: Settings,
		items: [
			{ title: "Insumos", url: "/global/ingredients", icon: Wheat },
			{ title: "Preparações", url: "/global/recipes", icon: UtensilsCrossed },
			{ title: "Planos Semanais", url: "/global/weekly-plans", icon: CalendarDays },
			{ title: "Locais", url: "/global/places-manager", icon: MapPin },
			{ title: "Permissões", url: "/global/permissions", icon: ShieldCheck },
			{ title: "Avaliação", url: "/global/evaluation", icon: Star },
			{ title: "Sync Compras", url: "/global/compras-sync", icon: RefreshCw },
			{ title: "Política de Revisão", url: "/global/policy", icon: ClipboardList },

			{ title: "Assistente IA", url: "/global/chat", icon: MessageSquare },
		],
	},
	{
		id: "analytics",
		name: "Análises Globais",
		icon: BarChart3,
		items: [
			{ title: "Visão Global", url: "/analytics/global", icon: BarChart3 },
			{ title: "Assistente IA", url: "/analytics/chat", icon: MessageSquare },
		],
	},
	{
		id: "local-analytics",
		name: "Análises da Unidade",
		icon: LayoutDashboard,
		hubUrl: "/local-analytics",
		items: [
			{ title: "Dashboard", url: "/local-analytics/dashboard", icon: LayoutDashboard },
			{ title: "Indicadores", url: "/local-analytics/indicators", icon: BarChart3 },
		],
	},
]

/** Retorna apenas os módulos acessíveis para o conjunto de permissões PBAC do usuário. */
export function getModulesForPermissions(permissions: UserPermission[]): ModuleDef[] {
	return ALL_MODULES.filter((m) => hasPermission(permissions, m.id))
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
