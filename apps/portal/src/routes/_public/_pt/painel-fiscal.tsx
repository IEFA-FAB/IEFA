import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/painel-fiscal")({
	beforeLoad: () => {
		throw redirect({ to: "/overseerDashboard", statusCode: 301 })
	},
})
