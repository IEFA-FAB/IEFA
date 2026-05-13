import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/pesquisa")({
	beforeLoad: () => {
		throw redirect({ to: "/research", statusCode: 301 })
	},
})
