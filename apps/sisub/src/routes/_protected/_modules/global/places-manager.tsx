import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { PlacesManagerPage } from "@/components/features/global/places-manager/PlacesManagerPage"

export const Route = createFileRoute("/_protected/_modules/global/places-manager")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	component: PlacesManagerPage,
	head: () => ({
		meta: [
			{ title: "Locais — SISUB" },
			{
				name: "description",
				content: "Visualize e edite as relações entre unidades, cozinhas e refeitórios.",
			},
		],
	}),
})
