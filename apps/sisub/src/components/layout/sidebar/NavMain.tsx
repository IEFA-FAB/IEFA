"use client"

import { Link, useLocation } from "@tanstack/react-router"
import { ArrowLeftRight, type LucideIcon, MapPin } from "lucide-react"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { cn } from "@/lib/cn"
import { normalizePath } from "@/lib/nav-paths"
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
	admin: "!text-destructive hover:!text-destructive",
}

type NavLeaf = { title: string; url: string; icon: LucideIcon; group?: string }

/** Escopo aberto no módulo — a cozinha/unidade/refeitório em que a sidebar está operando. */
export type SidebarScope = { name: string; hubUrl: string; noun: string }

/** Agrupa itens CONSECUTIVOS com o mesmo `group` — a ordem do catálogo é a ordem do fluxo. */
function toSections(items: NavLeaf[]): { title?: string; items: NavLeaf[] }[] {
	const sections: { title?: string; items: NavLeaf[] }[] = []
	for (const item of items) {
		const last = sections.at(-1)
		if (last && last.title === item.group) last.items.push(item)
		else sections.push({ title: item.group, items: [item] })
	}
	return sections
}

export function NavMain({ items, color, scope }: { items: NavLeaf[]; color?: GroupColor; scope?: SidebarScope | null }) {
	const { pathname } = useLocation()
	const currentPath = normalizePath(pathname)
	const activeClass = color ? MODULE_ACTIVE_CLASSES[color] : undefined

	return (
		<>
			{scope && (
				<SidebarGroup className="pb-0">
					<SidebarMenu>
						<SidebarMenuItem>
							{/* O escopo só aparecia no breadcrumb; aqui ele fica à vista e troca em um clique */}
							<SidebarMenuButton
								tooltip={`${scope.name} · trocar ${scope.noun}`}
								className="border border-sidebar-border"
								render={
									<Link to={scope.hubUrl} preload={false} aria-label={`${scope.name} — trocar ${scope.noun}`}>
										<MapPin />
										<span className="flex-1 truncate">{scope.name}</span>
										<span className="text-caption text-muted-foreground inline-flex items-center gap-1">
											<ArrowLeftRight className="size-3" />
											Trocar
										</span>
									</Link>
								}
							/>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			)}
			{toSections(items).map((section, i) => (
				<SidebarGroup key={section.title ?? `section-${i}`} className={cn(i > 0 && "pt-0")}>
					{section.title && <SidebarGroupLabel>{section.title}</SidebarGroupLabel>}
					<SidebarMenu>
						{section.items.map((item) => {
							const target = normalizePath(item.url)
							// Item da rota index do escopo (URL terminada em "/", ex. "/kitchen-production/7/")
							// casa só com ela mesma: por prefixo, ficava ativo em todas as páginas irmãs.
							const isIndexItem = item.url.endsWith("/")
							const isActive = currentPath === target || (!isIndexItem && currentPath.startsWith(`${target}/`))
							return (
								<SidebarMenuItem key={item.url}>
									<SidebarMenuButton
										tooltip={item.title}
										isActive={isActive}
										className={cn(isActive && activeClass)}
										render={
											<Link to={item.url} preload={false}>
												<item.icon />
												<span>{item.title}</span>
											</Link>
										}
									/>
								</SidebarMenuItem>
							)
						})}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	)
}
