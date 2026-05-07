import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { ClipboardCheck, Home, List } from "iconoir-react"
import { AppSidebar } from "@/components/sidebar/AppSidebar"
import { MainSurface } from "@/components/sidebar/MainSurface"
import type { AppSidebarData } from "@/components/sidebar/SidebarTypes"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

const sidebarData: AppSidebarData = {
	teams: [
		{
			name: "Formulários IEFA",
			logo: "/favicon.svg",
			plan: "Questionários Internos",
		},
	],
	navMain: [
		{
			title: "Painel",
			url: "/dashboard",
			icon: Home,
		},
		{
			title: "Questionários",
			url: "/questionnaires/new",
			icon: ClipboardCheck,
		},
		{
			title: "Respostas",
			url: "/responses",
			icon: List,
		},
	],
}

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: ({ context }) => {
		if (!context.auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.pathname } })
		}
	},
	component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
	return (
		<SidebarProvider>
			<AppSidebar data={sidebarData} />
			<SidebarInset>
				<MainSurface showInitialError={false} showInitialLoading={false} onRetry={() => {}}>
					<Outlet />
				</MainSurface>
			</SidebarInset>
		</SidebarProvider>
	)
}
