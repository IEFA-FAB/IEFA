"use client"

import { getHotkeyManager } from "@tanstack/hotkeys"
import { ChevronsUpDown } from "lucide-react"
import * as React from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import type { GroupColor } from "./NavItems"
import type { Module } from "./SidebarTypes"

const MODULE_LOGO_CLASSES: Record<GroupColor, string> = {
	success: "bg-success/15 text-success",
	primary: "bg-primary/15 text-primary",
	warning: "bg-warning/15 text-warning",
	governance: "bg-governance/15 text-governance",
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform)

function altLabel(index: number) {
	// ⌥ is the standard macOS Option/Alt symbol
	return isMac ? `⌥${index}` : `Alt+${index}`
}

export function ModuleSwitcher({
	modules,
	value,
	onChange,
}: {
	modules: Module[]
	/** Name of the currently active module (controlled mode) */
	value?: string
	onChange?: (module: Module) => void
}) {
	const { isMobile } = useSidebar()
	const [internalActive, setInternalActive] = React.useState(modules[0])

	const activeModule = value ? (modules.find((m) => m.name === value) ?? internalActive) : internalActive

	const handleChange = React.useCallback(
		(module: Module) => {
			if (onChange) {
				onChange(module)
			} else {
				setInternalActive(module)
			}
		},
		[onChange]
	)

	// Keep a stable ref so hotkey callbacks always call the latest handleChange
	// without needing to re-register on every render.
	const handleChangeRef = React.useRef(handleChange)
	React.useEffect(() => {
		handleChangeRef.current = handleChange
	})

	// Alt+1…9 — no browser conflict (unlike Ctrl/Cmd+1–8 which switch tabs).
	// Registers once per modules change; callbacks stay fresh via the ref.
	React.useEffect(() => {
		const manager = getHotkeyManager()
		const handles = modules.slice(0, 9).map((module, i) => {
			const hotkey = (["Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9"] as const)[i]
			return manager.register(hotkey, () => handleChangeRef.current(module), {
				requireReset: true,
				conflictBehavior: "error",
			})
		})
		return () => {
			for (const h of handles) h.unregister()
		}
	}, [modules])

	if (!activeModule) {
		return null
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger
							render={
								<DropdownMenuTrigger
									className="cursor-pointer"
									render={
										<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
											<div className={cn("flex h-8 p-2 items-center justify-center rounded-lg", MODULE_LOGO_CLASSES[activeModule.color])}>
												<activeModule.logo className="size-4" />
											</div>

											<div className="grid flex-1 text-left text-sm leading-tight">
												<span className="truncate font-medium">{activeModule.name}</span>
											</div>
											<ChevronsUpDown className="ml-auto" />
										</SidebarMenuButton>
									}
								/>
							}
						/>
						<TooltipContent>Mudar de módulo</TooltipContent>
					</Tooltip>

					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 p-3"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-muted-foreground text-label">Módulos</DropdownMenuLabel>
							{modules.map((module, i) => (
								<DropdownMenuItem key={module.name} onClick={() => handleChange(module)} className="cursor-pointer gap-2 p-2">
									<div className={cn("flex size-6 items-center justify-center rounded-md", MODULE_LOGO_CLASSES[module.color])}>
										<module.logo className="size-3.5" />
									</div>
									<span className="flex-1">{module.name}</span>
									{i < 9 && <kbd className="pointer-events-none ml-auto font-mono text-hint text-muted-foreground">{altLabel(i + 1)}</kbd>}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
