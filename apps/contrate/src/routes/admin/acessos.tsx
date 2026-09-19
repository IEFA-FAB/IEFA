import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * URL antiga da tela de acessos, de antes da OM na URL. O hub (`/admin`) escolhe a OM — ou
 * leva direto a ela, para quem administra uma só.
 */
export const Route = createFileRoute("/admin/acessos")({
	beforeLoad: () => {
		throw redirect({ to: "/admin", replace: true })
	},
})
