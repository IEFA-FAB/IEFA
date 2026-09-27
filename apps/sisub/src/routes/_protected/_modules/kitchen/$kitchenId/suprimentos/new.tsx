import { createFileRoute, redirect } from "@tanstack/react-router"

// Rota antiga da previsão de demanda (glossário: `demand-forecasts`). Fica um ciclo de deploy
// só com o redirect, para não quebrar favorito nem link salvo; sai no PR seguinte.
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/suprimentos/new")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/kitchen/$kitchenId/demand-forecasts/new", params: { kitchenId: params.kitchenId }, replace: true })
	},
})
