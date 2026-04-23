import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { CalendarRange, Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createBlankTemplateFn } from "@/server/menu-template-create.fn"

/**
 * KITCHEN — Novo Evento
 * Cria um cardápio de evento especial (template_type = 'event') vinculado à cozinha atual.
 * Esses templates são selecionados no Step 2 da Ata de Registro de Preços.
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/events/new")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	component: NewEventPage,
	head: () => ({
		meta: [{ title: "Novo Evento - SISUB" }],
	}),
})

function NewEventPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")

	const { mutate: createEvent, isPending } = useMutation({
		mutationFn: () => {
			if (!kitchenId || !name.trim()) throw new Error("Dados incompletos")
			return createBlankTemplateFn({
				data: {
					name: name.trim(),
					description: description.trim() || null,
					kitchenId,
					templateType: "event",
				},
			})
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Evento "${data.name}" criado!`)
			navigate({
				to: "/kitchen/$kitchenId/events/$eventId",
				params: { kitchenId: kitchenIdStr as string, eventId: data.id },
			})
		},
		onError: (err) => toast.error(`Erro: ${err.message}`),
	})

	const handleSubmit = () => {
		if (!name.trim() || !kitchenId) return
		createEvent()
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Novo Evento"
				description="Crie um cardápio para uma refeição especial fora do calendário semanal regular."
				onBack={() =>
					navigate({
						to: "/kitchen/$kitchenId/events",
						params: { kitchenId: kitchenIdStr as string },
					})
				}
			/>

			<div className="mx-auto w-full max-w-2xl space-y-6">
				<div className="rounded-md border bg-muted/30 p-4 flex items-start gap-3">
					<CalendarRange className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
					<p className="text-sm text-muted-foreground">
						Eventos são cardápios de refeições especiais — datas comemorativas, formaturas, exercícios de campo, visitas. Após criar, você montará o cardápio
						dia a dia. O evento poderá ser selecionado na composição das Atas de Registro de Preços.
					</p>
				</div>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						handleSubmit()
					}}
					className="space-y-4"
				>
					<div className="rounded-md border bg-card p-6 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">
								Nome do Evento <span className="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Ex.: Almoço de Formatura, Rancho de Manobra, Jantar Comemorativo"
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Descrição (opcional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Contexto do evento, data prevista ou observações relevantes"
								rows={2}
							/>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<p className="text-xs text-muted-foreground">Após criar, você será redirecionado para montar o cardápio do evento.</p>
						<div className="flex gap-2">
							<Button
								nativeButton={false}
								type="button"
								variant="outline"
								render={
									<Link to="/kitchen/$kitchenId/events" params={{ kitchenId: kitchenIdStr as string }}>
										Cancelar
									</Link>
								}
							/>
							<Button type="submit" disabled={isPending || !name.trim() || !kitchenId}>
								{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
								<Plus className="w-4 h-4 mr-2" />
								Criar Evento
							</Button>
						</div>
					</div>
				</form>
			</div>
		</div>
	)
}
