"use client"

import { Link, useLocation } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { GroupColor } from "./NavItems"

/**
 * Cor da aba ativa — sinaliza em qual tela o usuário está, na cor do módulo.
 * `!` vence o `data-active:text-sidebar-accent-foreground` (azul fixo) do botão;
 * ícone e label herdam a cor via `currentColor`.
 */
const MODULE_ACTIVE_CLASSES: Record<GroupColor, string> = {
	success: "!text-success hover:!text-success",
	primary: "!text-primary hover:!text-primary",
	warning: "!text-warning hover:!text-warning",
	governance: "!text-governance hover:!text-governance",
}

/** Normaliza pathname removendo barras finais para comparação de rotas. */
function normalizePath(path: string): string {
	return path.replace(/\/+$/, "") || "/"
}

export function NavMain({
	items,
}: {
	items: {
		title: string
		icon?: LucideIcon
		color?: GroupColor
		isActive?: boolean
		items?: {
			title: string
			url: string
			icon: LucideIcon
		}[]
	}[]
}) {
	const { pathname } = useLocation()
	const currentPath = normalizePath(pathname)

	return (
		<>
			{items.map((group) => {
				const activeClass = group.color ? MODULE_ACTIVE_CLASSES[group.color] : undefined
				return (
					<SidebarGroup key={group.title}>
						<SidebarGroupLabel>{group.title}</SidebarGroupLabel>
						<SidebarMenu>
							{group.items?.map((item) => {
								const target = normalizePath(item.url)
								const isActive = currentPath === target || currentPath.startsWith(`${target}/`)
								return (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton
											tooltip={item.title}
											isActive={isActive}
											className={cn(isActive && activeClass)}
											render={
												<Link to={item.url}>
													{item.icon && <item.icon />}
													<span>{item.title}</span>
												</Link>
											}
										/>
									</SidebarMenuItem>
								)
							})}
						</SidebarMenu>
					</SidebarGroup>
				)
			})}
		</>
	)
}
