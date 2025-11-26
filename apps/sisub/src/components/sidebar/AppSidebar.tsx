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
	...props
}: React.ComponentProps<typeof UISidebar> & { data: AppSidebarData }) {
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
