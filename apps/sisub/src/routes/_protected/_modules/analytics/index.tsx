import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/analytics/")({
	beforeLoad: () => {
		throw redirect({ to: "/analytics/global", replace: true })
	},
})
