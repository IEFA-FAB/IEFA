import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * A casa do módulo é a sua única tela. Um índice que listasse um card só seria um
 * clique a mais para chegar onde já se queria estar; quando o módulo ganhar a
 * segunda tela, é aqui que o painel nasce.
 */
export const Route = createFileRoute("/admin/")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/permissoes" })
	},
})
