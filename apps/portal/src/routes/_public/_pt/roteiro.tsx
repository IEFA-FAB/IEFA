import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/roteiro")({
	beforeLoad: () => {
		throw redirect({ to: "/roadmap", statusCode: 301 })
	},
})
