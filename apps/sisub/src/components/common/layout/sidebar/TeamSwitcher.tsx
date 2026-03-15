"use client"

import { ChevronsUpDown } from "lucide-react"
import * as React from "react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar"
import type { Team } from "./SidebarTypes"

export function TeamSwitcher({
	teams,
	value,
	onChange,
}: {
	teams: Team[]
	/** Name of the currently active team (controlled mode) */
	value?: string
	onChange?: (team: Team) => void
}) {
	const { isMobile } = useSidebar()
	const [internalActive, setInternalActive] = React.useState(teams[0])

	const activeTeam = value
		? (teams.find((t) => t.name === value) ?? internalActive)
		: internalActive

	const handleChange = (team: Team) => {
		if (onChange) {
			onChange(team)
		} else {
			setInternalActive(team)
		}
	}

	if (!activeTeam) {
		return null
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<activeTeam.logo className="h-4 w-4" />
								</div>

								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{activeTeam.name}</span>
									<span className="truncate text-xs">{activeTeam.plan}</span>
								</div>
								<ChevronsUpDown className="ml-auto" />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 p-3"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-muted-foreground text-xs">
								Módulos
							</DropdownMenuLabel>
							{teams.map((team) => (
								<DropdownMenuItem
									key={team.name}
									onClick={() => handleChange(team)}
									className="gap-2 p-2"
								>
									<div className="flex h-6 w-6 items-center justify-center rounded-md border bg-sidebar-accent">
										<team.logo className="h-3.5 w-3.5" />
									</div>
									{team.name}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
