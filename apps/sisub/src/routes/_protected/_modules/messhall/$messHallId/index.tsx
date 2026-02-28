import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/messhall/$messHallId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/messhall/$messHallId/presence",
			params: { messHallId: params.messHallId },
			replace: true,
		})
	},
})
