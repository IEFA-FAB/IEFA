"use client"

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@iefa/ui"
import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

export function NavMain({
	items,
}: {
	items: {
		title: string
		icon?: LucideIcon
		isActive?: boolean
		items?: {
			title: string
			url: string
			icon: LucideIcon
		}[]
	}[]
}) {
	return (
		<>
			{items.map((group) => (
				<SidebarGroup key={group.title}>
					<SidebarGroupLabel>{group.title}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items?.map((item) => (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton
									tooltip={item.title}
									render={
										<Link to={item.url}>
											{item.icon && <item.icon />}
											<span>{item.title}</span>
										</Link>
									}
								/>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	)
}
