"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@iefa/ui";
import { ChevronsUpDown } from "lucide-react";
import * as React from "react";

export function TeamSwitcher({
	teams,
}: {
	teams: {
		name: string;
		logo: string;
		plan: string;
	}[];
}) {
	const { isMobile } = useSidebar();
	const [activeTeam, setActiveTeam] = React.useState(teams[0]);

	if (!activeTeam) {
		return null;
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src="/favicon.svg" alt={activeTeam.name} />
								<AvatarFallback className="rounded-lg">
									{activeTeam.name.slice(0, 2)}
								</AvatarFallback>
							</Avatar>

							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{activeTeam.name}</span>
								<span className="truncate text-xs">{activeTeam.plan}</span>
							</div>
							<ChevronsUpDown className="ml-auto" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 "
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							Sistemas
						</DropdownMenuLabel>
						{teams.map((team) => (
							<DropdownMenuItem
								key={team.name}
								onClick={() => setActiveTeam(team)}
								className="gap-2 p-2"
							>
								{
									/* team.logo ? (
                    <team.logo className="size-3.5 shrink-0" />
                  ) : ( */
									<Avatar className="h-6 w-6 rounded-md border">
										<AvatarImage src="/favicon.svg" alt={team.name} />
										<AvatarFallback className="rounded-md">
											{team.name.slice(0, 2)}
										</AvatarFallback>
									</Avatar>
									/* ) */
								}

								{team.name}
								{/* <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut> */}
							</DropdownMenuItem>
						))}
						{/* <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <Plus className="size-4" />
              </div>
              <div className="text-muted-foreground font-medium">Add team</div>
            </DropdownMenuItem> */}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
