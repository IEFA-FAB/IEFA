import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { GitFork, Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useTemplate } from "@/hooks/data/useTemplates"
import { createBlankTemplateFn, forkTemplateFn } from "@/server/menu-template-create.fn"

/**
 * KITCHEN — Novo Cardápio Semanal
 * Cria do zero ou adapta um plano global da SDAB.
 * - Search param `forkFrom`: ID do template global a ser adaptado
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/weekly-menus/new")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	validateSearch: z.object({
		forkFrom: z.string().optional(),
	}),
	component: NewWeeklyMenuPage,
	head: () => ({
		meta: [{ title: "Novo Cardápio Semanal - SISUB" }],
	}),
})

function NewWeeklyMenuPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = Number(kitchenIdStr)
	const { forkFrom } = Route.useSearch()

	const { data: baseTemplate } = useTemplate(forkFrom ?? null)

	const [name, setName] = useState("")
	const [description, setDescription] = useState("")

	const isFork = !!forkFrom

	// Mutation: criar template local (do zero)
	const { mutate: createBlank, isPending: isCreating } = useMutation({
		mutationFn: () => {
			if (!kitchenId || !name.trim()) throw new Error("Dados incompletos")
			return createBlankTemplateFn({
				data: {
					name: name.trim(),
					description: description.trim() || null,
					kitchenId,
					templateType: "weekly",
				},
			})
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Cardápio semanal "${data.name}" criado!`)
			navigate({
				to: "/kitchen/$kitchenId/weekly-menus/$weeklyMenuId",
				params: { kitchenId: kitchenIdStr as string, weeklyMenuId: data.id },
			})
		},
		onError: (err) => toast.error(`Erro: ${err.message}`),
	})

	// Mutation: adaptar template global
	const { mutate: createFork, isPending: isForking } = useMutation({
		mutationFn: () => {
			if (!kitchenId || !forkFrom || !name.trim()) throw new Error("Dados incompletos")
			return forkTemplateFn({
				data: {
					name: name.trim(),
					description: description.trim() || null,
					kitchenId,
					baseTemplateId: forkFrom,
					templateType: "weekly",
				},
			})
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Adaptação "${data.name}" criada com sucesso!`)
			navigate({
				to: "/kitchen/$kitchenId/weekly-menus/$weeklyMenuId",
				params: { kitchenId: kitchenIdStr as string, weeklyMenuId: data.id },
			})
		},
		onError: (err) => toast.error(`Erro ao adaptar: ${err.message}`),
	})

	const isPending = isCreating || isForking

	const handleSubmit = () => {
		if (!name.trim() || !kitchenId) return
		if (isFork) {
			createFork()
		} else {
			createBlank()
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title={isFork ? "Adaptar Plano Global" : "Novo Cardápio Semanal"}
				description={isFork ? "Cria uma cópia independente do plano global para sua cozinha." : undefined}
				onBack={() =>
					navigate({
						to: "/kitchen/$kitchenId/weekly-menus",
						params: { kitchenId: kitchenIdStr as string },
					})
				}
			/>

			<div className="mx-auto w-full max-w-2xl space-y-6">
				{/* Plano de origem */}
				{isFork && baseTemplate && (
					<Card className="border-dashed">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm flex items-center gap-2">
								<GitFork className="w-4 h-4 text-muted-foreground" />
								Plano de origem
							</CardTitle>
							<CardDescription>
								O novo cardápio semanal será uma cópia independente deste plano. Alterações futuras no original não afetarão sua versão local.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-3">
								<div>
									<p className="font-medium text-sm">{baseTemplate.name}</p>
									{baseTemplate.description && <p className="text-xs text-muted-foreground mt-0.5">{baseTemplate.description}</p>}
								</div>
								<Badge variant="outline" className="ml-auto text-xs">
									Global · SDAB
								</Badge>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Formulário */}
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
								Nome do Cardápio Semanal <span className="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={isFork ? `Ex.: ${baseTemplate?.name ?? "Cópia"} — ${new Date().getFullYear()}` : "Ex.: Semana Padrão, Semana de Feriados"}
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Descrição (opcional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Breve descrição do cardápio semanal"
								rows={2}
							/>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<p className="text-xs text-muted-foreground">
							{isFork ? "Após criar, você poderá editar o cardápio semanal livremente." : "Após criar, você será redirecionado para editar o cardápio semanal."}
						</p>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								render={
									<Link to="/kitchen/$kitchenId/weekly-menus" params={{ kitchenId: kitchenIdStr as string }}>
										Cancelar
									</Link>
								}
							/>
							<Button type="submit" disabled={isPending || !name.trim() || !kitchenId}>
								{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
								{isFork ? (
									<>
										<GitFork className="w-4 h-4 mr-2" />
										Criar Adaptação
									</>
								) : (
									<>
										<Plus className="w-4 h-4 mr-2" />
										Criar Cardápio Semanal
									</>
								)}
							</Button>
						</div>
					</div>
				</form>
			</div>
		</div>
	)
}
