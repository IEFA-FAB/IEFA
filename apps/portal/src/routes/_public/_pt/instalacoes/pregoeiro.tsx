import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/instalacoes/pregoeiro")({
	beforeLoad: () => {
		throw redirect({ to: "/facilities/pregoeiro", statusCode: 301 })
	},
})
