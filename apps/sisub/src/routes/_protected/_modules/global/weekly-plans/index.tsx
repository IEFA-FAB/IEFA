import { Button } from "@iefa/ui"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarDays, Plus } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"

/**
 * GLOBAL-03 — Planos Semanais Modelo (SDAB)
 * URL: /global/weekly-plans
 * Acesso: módulo "global" nível 1+
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	component: WeeklyPlansPage,
	head: () => ({
		meta: [
			{ title: "Planos Semanais Modelo - SISUB" },
			{ name: "description", content: "Templates de cardápio semanal para todas as unidades" },
		],
	}),
})

function WeeklyPlansPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Planos Semanais Modelo">
				<Link to="/global/weekly-plans/new">
					<Button size="sm">
						<Plus className="h-4 w-4 mr-2" />
						Novo Plano
					</Button>
				</Link>
			</PageHeader>

			<div>
				<div className="rounded-md border border-dashed p-10 text-center space-y-3">
					<CalendarDays className="h-10 w-10 mx-auto text-muted-foreground" />
					<p className="text-sm font-medium text-muted-foreground">
						Nenhum plano semanal modelo cadastrado.
					</p>
					<p className="text-xs text-muted-foreground">
						Crie um plano para que as unidades possam importá-lo para o calendário local.
					</p>
					<Link to="/global/weekly-plans/new">
						<Button variant="outline" size="sm" className="mt-2">
							Criar primeiro plano
						</Button>
					</Link>
				</div>
			</div>
		</div>
	)
}
