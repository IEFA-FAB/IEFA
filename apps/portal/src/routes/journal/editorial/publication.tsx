import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/journal/editorial/publication")({
	staticData: {
		nav: {
			title: "Publicação",
			section: "Editorial",
			subtitle: "Fluxo de publicação e fechamento editorial",
			keywords: ["publicacao", "edicao", "fechamento", "editorial"],
			access: "editor",
			order: 140,
		},
	},
	component: RouteComponent,
})

function RouteComponent() {
	return <div>Hello "/journal/editorial/publication"!</div>
}
