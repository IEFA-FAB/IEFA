import {
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
	Sidebar as UISidebar,
} from "@iefa/ui";
import { NavMain } from "./NavMain";
import { NavUser } from "./NavUser";
import type { AppSidebarData } from "./SidebarTypes";
import { TeamSwitcher } from "./TeamSwitcher";

export function AppSidebar({
	data,
	isLoading = false,
	...props
}: React.ComponentProps<typeof UISidebar> & {
	data?: AppSidebarData;
	isLoading?: boolean;
}) {
	if (isLoading) {
		return (
			<UISidebar collapsible="icon" variant="floating" {...props}>
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
							<div
								key={i}
								className="h-8 w-full rounded-md bg-sidebar-accent/5 animate-pulse"
							/>
						))}
					</div>
				</SidebarContent>
				<SidebarFooter>
					<div className="h-12 w-full rounded-lg bg-sidebar-accent/10 animate-pulse" />
				</SidebarFooter>
				<SidebarRail />
			</UISidebar>
		);
	}

	if (!data) return null;

	return (
		<UISidebar collapsible="icon" variant="floating" {...props}>
			<SidebarHeader>
				<TeamSwitcher teams={data.teams} />
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</UISidebar>
	);
}
