import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/diner/")({
	beforeLoad: () => {
		throw redirect({ to: "/diner/arranchamento", replace: true })
	},
})
