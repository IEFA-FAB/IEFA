import { createFileRoute } from "@tanstack/react-router"
import { redirectToContrate } from "@/lib/contrate-redirect"

/** Mudou para o contrate — ver `lib/contrate-redirect.ts`. */
export const Route = createFileRoute("/_public/_en/facilities/pregoeiro")({
	beforeLoad: () => redirectToContrate("/pregoeiro"),
})
