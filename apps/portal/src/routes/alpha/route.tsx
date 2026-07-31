import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { AppLayout } from "@/components/AppLayout"

/**
 * Console interno do Projeto α.
 *
 * Ferramenta de operação e calibração das fontes normativas e da verificação de
 * conformidade — não é a Plataforma ACI. Fica fora da navegação pública do
 * portal de propósito: `staticData.nav` não é declarado em nenhuma rota filha.
 */
export const Route = createFileRoute("/alpha")({
	beforeLoad: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth" })
		}
		return { auth }
	},
	component: AlphaConsoleLayout,
})

function AlphaConsoleLayout() {
	return (
		<AppLayout>
			<Outlet />
		</AppLayout>
	)
}
