import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/global/")({
	beforeLoad: () => {
		throw redirect({ to: "/global/ingredients", replace: true })
	},
})
