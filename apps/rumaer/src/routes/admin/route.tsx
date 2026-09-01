import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { hasPermission, myRumaerPermissionsQueryOptions } from "@/auth/pbac"
import { authQueryOptions } from "@/auth/service"
import { AppLayout } from "@/components/AppLayout"

export const Route = createFileRoute("/admin")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		// Não basta estar logado: editar o regulamento exige grant `rumaer` nível 2.
		// Usuário autenticado sem acesso volta para a navegação pública.
		const permissions = await context.queryClient.query({ ...myRumaerPermissionsQueryOptions(), staleTime: "static" })
		if (!hasPermission(permissions, "rumaer", 2)) {
			throw redirect({ to: "/uniformes" })
		}
		return { auth }
	},
	component: () => (
		<AppLayout>
			<Outlet />
		</AppLayout>
	),
})
