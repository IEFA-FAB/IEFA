import { createFileRoute } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { AppShell } from "@/components/layout/AppShell"
import { SidebarProvider } from "@/components/ui/sidebar"

const SIDEBAR_COOKIE_NAME = "sidebar_state"

function parseCookies(cookieStr: string): Record<string, string> {
	return Object.fromEntries(
		cookieStr.split(";").map((c) => {
			const [name, ...v] = c.trim().split("=")
			return [name.trim(), v.join("=")]
		})
	)
}

/**
 * Lê o cookie sidebar_state de forma isomórfica:
 * - Servidor: via getRequest() (importado dinamicamente para não vazar no bundle do cliente)
 * - Cliente: via document.cookie (evita RPC desnecessário em navegações client-side)
 * Elimina o layout shift de hidratação do SidebarProvider.
 */
const getSidebarState = createIsomorphicFn()
	.server(async () => {
		const { getRequest } = await import("@tanstack/react-start/server")
		const request = getRequest()
		const cookieHeader = request?.headers.get("cookie") ?? ""
		const cookies = parseCookies(cookieHeader)
		const raw = cookies[SIDEBAR_COOKIE_NAME]
		return raw === undefined ? true : raw === "true"
	})
	.client(() => {
		const cookies = parseCookies(document.cookie)
		const raw = cookies[SIDEBAR_COOKIE_NAME]
		return raw === undefined ? true : raw === "true"
	})

/**
 * Layout para rotas de módulos — sidebar com seletor de módulo via TeamSwitcher.
 * Renderiza dentro do gradiente de fundo do _protected/route.tsx.
 * Dialogs de onboarding (SaramDialog, EvaluationDialog) estão no layout pai.
 */
export const Route = createFileRoute("/_protected/_modules")({
	beforeLoad: async () => {
		const sidebarOpen = await getSidebarState()
		return { sidebarOpen }
	},
	component: ModulesLayout,
})

function ModulesLayout() {
	const { sidebarOpen } = Route.useRouteContext()

	return (
		<SidebarProvider defaultOpen={sidebarOpen} className="bg-transparent text-foreground h-full">
			<AppShell />
		</SidebarProvider>
	)
}
