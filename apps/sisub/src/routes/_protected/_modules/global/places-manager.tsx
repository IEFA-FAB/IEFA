import { createFileRoute } from "@tanstack/react-router"
// O CSS do React Flow é render-blocking — carregado SÓ nesta rota (única que usa
// @xyflow/react), não global no __root, para não pesar no paint das demais telas.
import XyflowStyles from "@xyflow/react/dist/style.css?url"
import { requirePermission } from "@/auth/pbac"
import { PlacesManagerPage } from "@/components/features/global/places-manager/PlacesManagerPage"

export const Route = createFileRoute("/_protected/_modules/global/places-manager")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: PlacesManagerPage,
	head: () => ({
		meta: [
			{ title: "Locais — SISUB" },
			{
				name: "description",
				content: "Visualize e edite as relações entre unidades, cozinhas e refeitórios.",
			},
		],
		links: [{ rel: "stylesheet", href: XyflowStyles }],
	}),
})
