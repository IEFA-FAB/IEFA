import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { ModuleShell } from "@/components/layout/ModuleShell"

/**
 * Módulo de administração de acessos do Projeto α.
 *
 * Aqui mora só o guard de SESSÃO, o mesmo da ACI e do console. O de PERMISSÃO
 * (`alpha-admin`) fica em cada tela, porque é ela que sabe o que exige — e quem
 * decide de verdade é `requireAlphaAdmin`, no servidor.
 */
export const Route = createFileRoute("/admin")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: () => (
		<ModuleShell moduleId="admin">
			<Outlet />
		</ModuleShell>
	),
})
