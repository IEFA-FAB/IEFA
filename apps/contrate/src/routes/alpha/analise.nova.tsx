import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * URL antiga do envio pelo console. O envio mudou para o módulo Requisitante, que pede a OM
 * do documento; o console ficou só com a calibração (fontes e bancada).
 */
export const Route = createFileRoute("/alpha/analise/nova")({
	beforeLoad: () => {
		throw redirect({ to: "/requisitante", replace: true })
	},
})
