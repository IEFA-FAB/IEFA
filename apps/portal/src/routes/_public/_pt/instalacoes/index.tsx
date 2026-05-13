import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/instalacoes/")({
	beforeLoad: () => {
		throw redirect({ to: "/facilities", statusCode: 301 })
	},
})
