import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@iefa/ui"
import { Link, useLocation } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

export function NavMain({
	items,
}: {
	items: {
		title: string
		url: string
		icon: LucideIcon
	}[]
}) {
	const location = useLocation()

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Navegação</SidebarGroupLabel>
			<SidebarMenu>
				{items.map((item) => {
					// Verifica se a rota atual começa com a url do item (para active state)
					const isActive =
						location.pathname === item.url || location.pathname.startsWith(`${item.url}/`)

					return (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								render={
									<Link to={item.url}>
										{item.icon && <item.icon />}
										<span>{item.title}</span>
									</Link>
								}
								tooltip={item.title}
								isActive={isActive}
							/>
						</SidebarMenuItem>
					)
				})}
			</SidebarMenu>
		</SidebarGroup>
	)
}
