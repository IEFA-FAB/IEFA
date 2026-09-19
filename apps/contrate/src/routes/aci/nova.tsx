import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * URL antiga do envio. O envio mudou para o módulo Requisitante — é lá que qualquer pessoa
 * envia e acompanha o próprio documento, escolhendo a OM. Fica o redirecionamento para os
 * links antigos seguirem abrindo.
 */
export const Route = createFileRoute("/aci/nova")({
	beforeLoad: () => {
		throw redirect({ to: "/requisitante", replace: true })
	},
})
