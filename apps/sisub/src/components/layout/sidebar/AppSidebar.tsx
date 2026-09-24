import { Search } from "lucide-react"
import type * as React from "react"
import { Kbd } from "@/components/ui/kbd"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar"
import { commandPaletteShortcut, openCommandPalette } from "../CommandPalette"
import { ModuleSwitcher } from "./ModuleSwitcher"
import type { ModuleDef, ModuleId } from "./NavItems"
import { NavMain, type SidebarScope } from "./NavMain"
import { NavUser } from "./NavUser"
import { SidebarLegalLinks } from "./SidebarLegalLinks"
import type { Module } from "./SidebarTypes"

export function AppSidebar({
	modules,
	activeModuleId,
	onModuleChange,
	isLoading = false,
	scopeLocked = false,
	scope = null,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	modules?: ModuleDef[]
	activeModuleId?: ModuleId | null
	onModuleChange?: (moduleId: ModuleId) => void
	isLoading?: boolean
	scopeLocked?: boolean
	/** Escopo aberto (cozinha/unidade/refeitório) — mostrado no topo da navegação, com "trocar" */
	scope?: SidebarScope | null
}) {
	if (isLoading) {
		return (
			<Sidebar collapsible="icon" variant="sidebar" {...props}>
				<SidebarHeader>
					<div className="flex items-center gap-2 p-2">
						<div className="size-8 rounded-lg bg-sidebar-accent/10 animate-pulse" />
						<div className="flex flex-col gap-1 flex-1">
							<div className="h-4 w-24 rounded bg-sidebar-accent/10 animate-pulse" />
							<div className="h-3 w-16 rounded bg-sidebar-accent/10 animate-pulse" />
						</div>
					</div>
				</SidebarHeader>
				<SidebarContent>
					<div className="p-2 space-y-2">
						{Array.from({ length: 5 }).map((_, i) => (
							<div key={i} className="h-8 w-full rounded-md bg-sidebar-accent/5 animate-pulse" />
						))}
					</div>
				</SidebarContent>
				<SidebarFooter>
					<div className="h-12 w-full rounded-lg bg-sidebar-accent/10 animate-pulse" />
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>
		)
	}

	const availableModules = modules ?? []
	const activeModule = availableModules.find((m) => m.id === activeModuleId) ?? availableModules[0]

	const sidebarModules: Module[] = availableModules.map((m) => ({
		name: m.name,
		logo: m.icon,
		color: m.color,
	}))

	const handleModuleChange = (module: Module) => {
		const mod = availableModules.find((m) => m.name === module.name)
		if (mod && onModuleChange) {
			onModuleChange(mod.id)
		}
	}

	if (!activeModule) return null

	return (
		<Sidebar collapsible="icon" variant="sidebar" {...props}>
			<SidebarHeader>
				<ModuleSwitcher modules={sidebarModules} value={activeModule.name} onChange={handleModuleChange} />
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip={`Buscar página (${commandPaletteShortcut()})`} onClick={openCommandPalette} className="text-muted-foreground">
							<Search />
							<span className="flex-1">Buscar página</span>
							<Kbd suppressHydrationWarning>{commandPaletteShortcut()}</Kbd>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>{!scopeLocked && <NavMain items={activeModule.items} color={activeModule.color} scope={scope} />}</SidebarContent>
			<SidebarFooter>
				<NavUser />
				<SidebarLegalLinks />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	)
}
