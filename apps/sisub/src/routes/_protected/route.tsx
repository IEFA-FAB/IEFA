// UI Components (from @iefa/ui)
import { SidebarProvider } from "@iefa/ui";
// Routing
import { createFileRoute, redirect } from "@tanstack/react-router";
// Layout Components
import { AppShell } from "@/components/layout/AppShell";

/**
 * Layout para rotas protegidas (requer autenticação)
 * Envolve todo o conteúdo no SidebarProvider e renderiza o AppShell
 */
export const Route = createFileRoute("/_protected")({
	beforeLoad: ({ context, location }) => {
		if (!context.auth.isAuthenticated) {
			throw redirect({
				to: "/auth",
				search: {
					redirect: location.href,
				},
			});
		}
	},
	component: () => (
		<SidebarProvider>
			<AppShell />
		</SidebarProvider>
	),
});
