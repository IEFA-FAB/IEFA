import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/politica-de-inovacao")({
	beforeLoad: () => {
		throw redirect({ to: "/innovation-policy", statusCode: 301 })
	},
})
