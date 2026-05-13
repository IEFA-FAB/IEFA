import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/publicacoes/")({
	beforeLoad: () => {
		throw redirect({ to: "/posts", statusCode: 301 })
	},
})
