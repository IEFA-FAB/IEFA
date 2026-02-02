import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@iefa/ui"
import { ChevronsUpDown } from "lucide-react"
import * as React from "react"
import type { Team } from "./SidebarTypes"

export function TeamSwitcher({ teams }: { teams: Team[] }) {
	const { isMobile } = useSidebar()
	const [activeTeam, setActiveTeam] = React.useState(teams[0])

	if (!activeTeam || teams.length === 0) return null

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
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									{/* Using team logo with fallback */}
									<img
										src={activeTeam.logo}
										alt={activeTeam.name}
										className="size-6"
										onError={(e) => {
											e.currentTarget.src = "/LogoPredator.svg"
										}}
									/>
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">{activeTeam.name}</span>
									<span className="truncate text-xs">{activeTeam.plan}</span>
								</div>
								<ChevronsUpDown className="ml-auto" />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="text-xs text-muted-foreground">Times</DropdownMenuLabel>
							{teams.map((team, index) => (
								<DropdownMenuItem
									key={team.id}
									onClick={() => setActiveTeam(team)}
									className="gap-2 p-2"
								>
									<div className="flex size-6 items-center justify-center rounded-sm border">
										<img src={team.logo} alt={team.name} className="size-4 shrink-0" />
									</div>
									{team.name}
									<DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
