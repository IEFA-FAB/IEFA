import { createFileRoute, redirect } from "@tanstack/react-router"

// Rota antiga dos cardápios semanais modelo (glossário: "Cardápio semanal", `weekly-menus`). Fica
// um ciclo de deploy só com o redirect, para não quebrar favorito nem link salvo; sai no PR seguinte.
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/")({
	beforeLoad: () => {
		throw redirect({ to: "/global/weekly-menus", replace: true })
	},
})
