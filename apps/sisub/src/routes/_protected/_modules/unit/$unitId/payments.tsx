import { createFileRoute, redirect } from "@tanstack/react-router"

// Rota antiga dos pagamentos (glossário: `pagamentos`, com `empenho` e `liquidacao`). Fica um
// ciclo de deploy só com o redirect, para não quebrar favorito nem link salvo; sai no PR seguinte.
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/payments")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/unit/$unitId/pagamentos", params: { unitId: params.unitId }, replace: true })
	},
})
