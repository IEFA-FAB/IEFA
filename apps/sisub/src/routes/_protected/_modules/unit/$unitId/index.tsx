import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/unit/$unitId/dashboard",
			params: { unitId: params.unitId },
			replace: true,
		})
	},
})
