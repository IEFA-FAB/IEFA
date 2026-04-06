"use client"

import { getHotkeyManager } from "@tanstack/hotkeys"
import { ChevronsUpDown } from "lucide-react"
import * as React from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Module } from "./SidebarTypes"

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
											<div className="flex h-8 p-2 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
												<activeModule.logo className="h-4 w-4" />
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
							<DropdownMenuLabel className="text-muted-foreground text-xs">Módulos</DropdownMenuLabel>
							{modules.map((module, i) => (
								<DropdownMenuItem key={module.name} onClick={() => handleChange(module)} className="cursor-pointer gap-2 p-2">
									<div className="flex h-6 w-6 items-center justify-center rounded-md border bg-sidebar-accent">
										<module.logo className="h-3.5 w-3.5" />
									</div>
									<span className="flex-1">{module.name}</span>
									{i < 9 && <kbd className="pointer-events-none ml-auto font-mono text-[10px] text-muted-foreground opacity-60">{altLabel(i + 1)}</kbd>}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
