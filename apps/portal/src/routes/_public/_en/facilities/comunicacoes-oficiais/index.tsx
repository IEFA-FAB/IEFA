import { createFileRoute } from "@tanstack/react-router"
import { DocumentLibrary } from "@/components/comaer/DocumentLibrary"

export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais/")({
	component: DocumentLibrary,
	head: () => {
		const baseUrl = import.meta.env.VITE_PUBLIC_URL ?? ""
		const title = "Comunicações Oficiais — Portal IEFA"
		const description =
			"Seus documentos oficiais do COMAER conforme a NSCA 5-3/2026: ofício, despacho, parecer, requerimento, ata e demais espécies, com saída pronta para colar no SIGADAER."
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:url", content: `${baseUrl}/facilities/comunicacoes-oficiais` },
			],
		}
	},
})
