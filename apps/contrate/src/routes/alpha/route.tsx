import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { AppLayout } from "@/components/AppLayout"

/**
 * Console interno do Projeto α.
 *
 * Ferramenta de operação e calibração das fontes normativas e da verificação de
 * conformidade — não é a Plataforma ACI. Fica fora da navegação principal de
 * propósito: só quem calibra (nível ACI) tem motivo para entrar.
 */
export const Route = createFileRoute("/alpha")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
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
