import { createFileRoute, redirect } from "@tanstack/react-router"

/** A entrada da OM administrada é a tela de acessos — a única do módulo. */
export const Route = createFileRoute("/admin/$unitId/")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/admin/$unitId/acessos", params: { unitId: params.unitId }, replace: true })
	},
})
