import { createFileRoute } from "@tanstack/react-router"
import { redirectToContrate } from "@/lib/contrate-redirect"

/** Direto ao destino final, sem passar pelo 301 de `/facilities/pregoeiro`. */
export const Route = createFileRoute("/_public/_pt/instalacoes/pregoeiro")({
	beforeLoad: () => redirectToContrate("/pregoeiro"),
})
