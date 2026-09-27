import { createFileRoute, redirect } from "@tanstack/react-router"

// Rota antiga das liquidações (glossário: `liquidacoes`; `liquidation` é falso cognato). Fica um
// ciclo de deploy só com o redirect, para não quebrar favorito nem link salvo; sai no PR seguinte.
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/liquidations")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/unit/$unitId/liquidacoes", params: { unitId: params.unitId }, replace: true })
	},
})
