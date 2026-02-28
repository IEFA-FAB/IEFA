import type { LucideIcon } from "lucide-react"

export type Team = {
	name: string
	logo: LucideIcon
	plan: string
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
	teams: Team[]
	navMain: NavItemSection[]
}
