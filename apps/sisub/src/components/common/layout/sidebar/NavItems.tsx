// ~/components/sidebar/nav-items.ts

import {
	BarChart3,
	Calendar,
	ClipboardCheck,
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
import type { UserLevelOrNull } from "@/types/domain/"

export type IconType = ComponentType<SVGProps<SVGSVGElement>>

// Níveis exibidos no menu (inclui nível 0 "comensal")
export type DisplayLevel = "comensal" | Exclude<UserLevelOrNull, null>

export type ModuleId = "diner" | "messhall" | "local" | "global" | "analytics"

export type ModuleDef = {
	id: ModuleId
	name: string
	icon: LucideIcon
	minLevel: DisplayLevel
	items: { title: string; url: string; icon: LucideIcon }[]
}

// Ordem hierárquica para acumular acesso
const LEVELS_ORDER: DisplayLevel[] = ["comensal", "user", "admin", "superadmin"]

export const ALL_MODULES: ModuleDef[] = [
	{
		id: "diner",
		name: "Comensal",
		icon: UtensilsCrossed,
		minLevel: "comensal",
		items: [
			{ title: "Previsão", url: "/diner/forecast", icon: Calendar },
			{ title: "Perfil", url: "/diner/profile", icon: User },
			{ title: "Auto Check-in", url: "/diner/selfCheckIn", icon: ClipboardCheck },
		],
	},
	{
		id: "messhall",
		name: "Fiscal",
		icon: ShieldCheck,
		minLevel: "user",
		items: [{ title: "Presenças", url: "/messhall/presence", icon: ClipboardCheck }],
	},
	{
		id: "local",
		name: "Gestão Local",
		icon: LayoutDashboard,
		minLevel: "admin",
		items: [
			{ title: "Painel", url: "/local/", icon: LayoutDashboard },
			{ title: "Planejamento", url: "/local/planning", icon: Calendar },
			{ title: "Receitas", url: "/local/recipes", icon: UtensilsCrossed },
			{ title: "Suprimentos", url: "/local/procurement", icon: ShoppingCart },
			{ title: "QR Check-in", url: "/local/qrCode", icon: QrCode },
		],
	},
	{
		id: "global",
		name: "SDAB",
		icon: Settings,
		minLevel: "superadmin",
		items: [
			{ title: "Insumos", url: "/global/ingredients", icon: Wheat },
			{ title: "Permissões", url: "/global/permissions", icon: ShieldCheck },
			{ title: "Avaliação", url: "/global/evaluation", icon: Star },
		],
	},
	{
		id: "analytics",
		name: "Análises",
		icon: BarChart3,
		minLevel: "admin",
		items: [
			{ title: "Visão Global", url: "/analytics/global", icon: BarChart3 },
			{ title: "Análise Local", url: "/analytics/local", icon: LayoutDashboard },
		],
	},
]

function getAccumulatedLevels(level: DisplayLevel): DisplayLevel[] {
	const idx = LEVELS_ORDER.indexOf(level)
	return idx >= 0 ? LEVELS_ORDER.slice(0, idx + 1) : ["comensal"]
}

export function getModulesForLevel(level: DisplayLevel): ModuleDef[] {
	const levels = getAccumulatedLevels(level)
	return ALL_MODULES.filter((m) => levels.includes(m.minLevel))
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

export function getNavItemsForLevel(level: DisplayLevel): NavItem[] {
	return getModulesForLevel(level).flatMap((m) =>
		m.items.map((it) => ({ to: it.url, label: it.title, icon: it.icon as IconType })),
	)
}
