import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { ClipboardCheck, Home, List } from "iconoir-react"
import { AppSidebar } from "@/components/sidebar/AppSidebar"
import { MainSurface } from "@/components/sidebar/MainSurface"
import type { AppSidebarData } from "@/components/sidebar/SidebarTypes"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { env } from "@/env"

const isCincoS = env.VITE_APP_TENANT === "cinco-s"

const sidebarData: AppSidebarData = {
	teams: [
		{
			name: isCincoS ? "Programa VETOR 5S" : "Formulários IEFA",
			logo: isCincoS ? "/5s/favicon.svg" : "/favicon.svg",
			plan: isCincoS ? "SEFA · Melhoria Contínua" : "Questionários Internos",
		},
	],
	navMain: [
		{
			title: "Painel",
			url: "/dashboard",
			icon: Home,
		},
		{
			title: isCincoS ? "Checklists" : "Questionários",
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
	beforeLoad: ({ context, location }) => {
		if (!context.auth.isAuthenticated) {
			const redirectTarget = `${location.pathname}${location.search}${location.hash}`
			throw redirect({ to: "/auth", search: { redirect: redirectTarget } })
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
