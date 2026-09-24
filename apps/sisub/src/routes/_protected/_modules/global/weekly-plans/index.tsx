import { createFileRoute } from "@tanstack/react-router"
import { CalendarDays } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { GlobalTemplateCatalog } from "@/components/features/global/GlobalTemplateCatalog"

/**
 * GLOBAL-03 — Planos Semanais Modelo (SDAB)
 * URL: /global/weekly-plans
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: WeeklyPlansPage,
	head: () => ({
		meta: [{ name: "description", content: "Templates de cardápio semanal para todas as unidades" }],
	}),
})

function WeeklyPlansPage() {
	return (
		<GlobalTemplateCatalog
			templateType="weekly"
			title="Planos Semanais Modelo"
			icon={CalendarDays}
			nounWithArticle="o plano"
			newLabel="Novo Plano"
			emptyMessage="Nenhum plano semanal modelo cadastrado."
			emptyHint="Crie um plano para que as unidades possam importá-lo para o calendário local."
			newLink={{ to: "/global/weekly-plans/new" }}
			editorLink={(planId) => ({ to: "/global/weekly-plans/$planId", params: { planId } })}
		/>
	)
}
