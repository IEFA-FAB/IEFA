// ~/components/sidebar/nav-items.ts

import {
	BarChart3,
	BookOpen,
	Building2,
	Calendar,
	CalendarDays,
	ChefHat,
	ClipboardCheck,
	FlameKindling,
	LayoutDashboard,
	type LucideIcon,
	QrCode,
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

export type ModuleId =
	| "diner"
	| "messhall"
	| "unit"
	| "kitchen"
	| "kitchen-production"
	| "global"
	| "analytics"

export type ModuleDef = {
	id: ModuleId
	name: string
	icon: LucideIcon
	/**
	 * Para módulos com escopo (messhall, unit, kitchen, kitchen-production),
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
			{ title: "Cardápio", url: "/diner/menu", icon: BookOpen },
			{ title: "Previsão", url: "/diner/forecast", icon: Calendar },
			{ title: "Meu QR Code", url: "/diner/qr-code", icon: QrCode },
			{ title: "Perfil", url: "/diner/profile", icon: User },
			{ title: "Auto Check-in", url: "/diner/self-check-in", icon: ClipboardCheck },
		],
	},
	{
		id: "messhall",
		name: "Fiscal",
		icon: ShieldCheck,
		hubUrl: "/messhall",
		// URLs base — AppShell substitui por /messhall/{id}/... quando dentro de um escopo
		items: [{ title: "Presenças", url: "/messhall/presence", icon: ClipboardCheck }],
	},
	{
		id: "unit",
		name: "Gestão Unidade",
		icon: Building2,
		hubUrl: "/unit",
		items: [{ title: "Painel", url: "/unit/dashboard", icon: LayoutDashboard }],
	},
	{
		id: "kitchen",
		name: "Gestão Cozinha",
		icon: ChefHat,
		hubUrl: "/kitchen",
		// URLs base — AppShell substitui por /kitchen/{id}/... quando dentro de um escopo
		items: [
			{ title: "Cardápios Semanais", url: "/kitchen/weekly-menus", icon: CalendarDays },
			{ title: "Planejamento", url: "/kitchen/planning", icon: Calendar },
			{ title: "Preparações", url: "/kitchen/recipes", icon: UtensilsCrossed },
			{ title: "Suprimentos", url: "/kitchen/procurement", icon: ShoppingCart },
			{ title: "QR Check-in", url: "/kitchen/qr-code", icon: QrCode },
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
			{ title: "Permissões", url: "/global/permissions", icon: ShieldCheck },
			{ title: "Avaliação", url: "/global/evaluation", icon: Star },
		],
	},
	{
		id: "analytics",
		name: "Análises",
		icon: BarChart3,
		items: [
			{ title: "Visão Global", url: "/analytics/global", icon: BarChart3 },
			{ title: "Análise Local", url: "/analytics/local", icon: LayoutDashboard },
			{ title: "Indicadores da Unidade", url: "/analytics/local-indicators", icon: BarChart3 },
		],
	},
]

/**
 * Retorna apenas os módulos acessíveis para o conjunto de permissões PBAC do usuário.
 */
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
	return getModulesForPermissions(permissions).flatMap((m) =>
		m.items.map((it) => ({ to: it.url, label: it.title, icon: it.icon as IconType }))
	)
}
