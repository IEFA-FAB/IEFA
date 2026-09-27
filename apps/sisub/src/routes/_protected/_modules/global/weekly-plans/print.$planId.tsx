import { createFileRoute, redirect } from "@tanstack/react-router"
import { z } from "zod"

// Rota antiga da impressão do cardápio semanal modelo (glossário: `weekly-menus`). Fica um ciclo de
// deploy só com o redirect, com a semana (`week`) encaminhada; sai no PR seguinte.
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/print/$planId")({
	validateSearch: z.object({
		week: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
	}),
	beforeLoad: ({ params, search }) => {
		throw redirect({ to: "/global/weekly-menus/print/$weeklyMenuId", params: { weeklyMenuId: params.planId }, search, replace: true })
	},
})
