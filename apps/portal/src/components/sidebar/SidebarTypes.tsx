import type React from "react"

export type Team = {
	id?: string
	name: string
	logo: string
	plan: string
}

export type NavItem = {
	title: string
	url: string
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
	isActive?: boolean
}

export type AppSidebarData = {
	teams: Team[]
	navMain: NavItem[]
}
