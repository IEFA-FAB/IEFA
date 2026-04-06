import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * GLOBAL-03 — Criar Plano Semanal Modelo
 * URL: /global/weekly-plans/new
 * Acesso: módulo "global" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/global/weekly-plans/new")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	component: NewWeeklyPlanPage,
	head: () => ({
		meta: [{ title: "Novo Plano Semanal - SISUB" }],
	}),
})

function NewWeeklyPlanPage() {
	const navigate = useNavigate()

	return (
		<div className="space-y-6">
			<PageHeader title="Novo Plano Semanal Modelo" onBack={() => navigate({ to: "/global/weekly-plans" })} />

			<div className="mx-auto w-full max-w-2xl rounded-lg border bg-card p-6 space-y-4">
				<div className="space-y-2">
					<Label htmlFor="plan-name">Nome do Plano</Label>
					<Input id="plan-name" placeholder="Ex.: Cardápio Padrão FAB — Semana 1" className="max-w-md" />
				</div>

				{/* Placeholder — o componente de planejamento semanal será integrado aqui */}
				<div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
					A grade de planejamento semanal (7 dias × refeições) será montada aqui.
					<br />
					Cada célula recebe uma Preparação do catálogo global.
				</div>

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={() => navigate({ to: "/global/weekly-plans" })}>
						Cancelar
					</Button>
					<Button disabled>Salvar Plano</Button>
				</div>
			</div>
		</div>
	)
}
