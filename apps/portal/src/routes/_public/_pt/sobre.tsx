import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/sobre")({
	beforeLoad: () => {
		throw redirect({ to: "/about", statusCode: 301 })
	},
})
