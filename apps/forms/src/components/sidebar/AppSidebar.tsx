import { Sidebar, SidebarContent, SidebarFooter, SidebarRail } from "../ui/sidebar"
import { NavMain } from "./NavMain"
import { NavUser } from "./NavUser"
import type { AppSidebarData } from "./SidebarTypes"

export function AppSidebar({ data, ...props }: React.ComponentProps<typeof Sidebar> & { data: AppSidebarData }) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarContent>
				<NavMain items={data.navMain} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	)
}
