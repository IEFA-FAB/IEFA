import { createFileRoute } from "@tanstack/react-router"
import { redirectToContrate } from "@/lib/contrate-redirect"

/** Mudou para o contrate — ver `lib/contrate-redirect.ts`. O `$` filho só existe para os caminhos fundos casarem aqui. */
export const Route = createFileRoute("/alpha")({
	beforeLoad: ({ location }) => redirectToContrate(location.pathname, location.searchStr),
})
