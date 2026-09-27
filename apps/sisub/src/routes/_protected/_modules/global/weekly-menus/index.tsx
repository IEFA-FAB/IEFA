import { createFileRoute } from "@tanstack/react-router"
import { CalendarDays } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { GlobalTemplateCatalog } from "@/components/features/global/GlobalTemplateCatalog"

/**
 * GLOBAL-03 — Cardápios Semanais Modelo (SDAB)
 * URL: /global/weekly-menus
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-menus/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalWeeklyMenusPage,
	head: () => ({
		meta: [{ name: "description", content: "Templates de cardápio semanal para todas as unidades" }],
	}),
})

function GlobalWeeklyMenusPage() {
	return (
		<GlobalTemplateCatalog
			templateType="weekly"
			title="Cardápios Semanais Modelo"
			icon={CalendarDays}
			nounWithArticle="o cardápio"
			newLabel="Novo Cardápio"
			emptyMessage="Nenhum cardápio semanal modelo cadastrado."
			emptyHint="Crie um cardápio para que as unidades possam importá-lo para o calendário local."
			newLink={{ to: "/global/weekly-menus/new" }}
			editorLink={(weeklyMenuId) => ({ to: "/global/weekly-menus/$weeklyMenuId", params: { weeklyMenuId } })}
		/>
	)
}
