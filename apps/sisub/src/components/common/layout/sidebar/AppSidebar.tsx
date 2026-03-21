import type * as React from "react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"
import { ModuleSwitcher } from "./ModuleSwitcher"
import type { ModuleDef, ModuleId } from "./NavItems"
import { NavMain } from "./NavMain"
import { NavUser } from "./NavUser"
import type { Module } from "./SidebarTypes"

export function AppSidebar({
	modules,
	activeModuleId,
	onModuleChange,
	isLoading = false,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	modules?: ModuleDef[]
	activeModuleId?: ModuleId | null
	onModuleChange?: (moduleId: ModuleId) => void
	isLoading?: boolean
}) {
	if (isLoading) {
		return (
			<Sidebar collapsible="icon" variant="sidebar" {...props}>
				<SidebarHeader>
					<div className="flex items-center gap-2 p-2">
						<div className="h-8 w-8 rounded-lg bg-sidebar-accent/10 animate-pulse" />
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
	}))

	const navMain = activeModule
		? [
				{
					title: activeModule.name,
					icon: activeModule.icon,
					isActive: true,
					items: activeModule.items,
				},
			]
		: []

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
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={navMain} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	)
}
