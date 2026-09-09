import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { hasPermission, mySucontPermissionsQueryOptions } from "#/auth/pbac"

/**
 * Módulo `admin` — governança do próprio SUCONT.
 *
 * A raiz já exige sessão e grant `sucont` nível 1; aqui o piso sobe para 3, o mesmo
 * que `requireSucontAdmin` cobra em cada server function do módulo. Quem não tem
 * volta para o hub: mandar para `/auth` sugeriria que falta login, e não nível.
 */
export const Route = createFileRoute("/admin")({
	beforeLoad: async ({ context }) => {
		const permissions = await context.queryClient.query({ ...mySucontPermissionsQueryOptions(), staleTime: "static" })
		if (!hasPermission(permissions, "sucont", 3)) throw redirect({ to: "/" })
	},
	component: Outlet,
})
