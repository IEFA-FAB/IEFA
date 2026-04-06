import type { LucideIcon } from "lucide-react"

export type Module = {
	name: string
	logo: LucideIcon
}

export type NavItemLeaf = {
	title: string
	url: string
	icon: LucideIcon
}

export type NavItemSection = {
	title: string
	icon?: LucideIcon
	isActive?: boolean
	items?: NavItemLeaf[]
}

export type AppSidebarData = {
	modules: Module[]
	navMain: NavItemSection[]
}
