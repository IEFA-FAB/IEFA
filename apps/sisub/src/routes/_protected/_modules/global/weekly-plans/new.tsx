import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateTemplate } from "@/hooks/data/useTemplates"

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
	const [name, setName] = useState("")
	const [description, setDescription] = useState("")

	const { mutate: createTemplate, isPending } = useCreateTemplate()

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault()
		if (!name.trim()) return

		createTemplate(
			{
				template: {
					name: name.trim(),
					description: description.trim() || null,
					kitchen_id: null, // global SDAB
					template_type: "weekly",
				},
				items: [],
			},
			{
				onSuccess: (data) => {
					if (data?.id) {
						navigate({ to: "/global/weekly-plans/$planId", params: { planId: data.id } })
					}
				},
			}
		)
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Novo Plano Semanal Modelo" onBack={() => navigate({ to: "/global/weekly-plans" })} />

			<div className="mx-auto w-full max-w-2xl">
				<form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 space-y-5">
					<FieldGroup className="space-y-4">
						<Field>
							<FieldLabel htmlFor="plan-name">
								Nome do Plano <span className="text-destructive">*</span>
							</FieldLabel>
							<Input
								id="plan-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Ex.: Cardápio Padrão FAB — Semana 1"
								required
								autoFocus
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor="plan-description">Descrição (opcional)</FieldLabel>
							<Textarea
								id="plan-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Breve descrição do plano semanal modelo"
								rows={2}
							/>
						</Field>
					</FieldGroup>

					<p className="text-xs text-muted-foreground">Após criar, você será redirecionado para montar a grade semanal (7 dias × refeições).</p>

					<div className="flex justify-end gap-2 pt-1">
						<Button type="button" variant="outline" onClick={() => navigate({ to: "/global/weekly-plans" })}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending || !name.trim()}>
							{isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
							Criar Plano
						</Button>
					</div>
				</form>
			</div>
		</div>
	)
}
