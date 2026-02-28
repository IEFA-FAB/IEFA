import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/kitchen/$kitchenId/weekly-menus",
			params: { kitchenId: params.kitchenId },
			replace: true,
		})
	},
})
