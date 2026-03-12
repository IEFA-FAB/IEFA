import {
	Badge,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Textarea,
} from "@iefa/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router"
import { ArrowLeft, GitFork, Loader2, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { useTemplate } from "@/hooks/data/useTemplates"
import supabase from "@/lib/supabase"
import type { MenuTemplateItemInsert } from "@/types/supabase.types"

/**
 * KITCHEN — Novo Cardápio Semanal
 * Cria do zero ou forka um plano global da SDAB.
 * - Search param `forkFrom`: ID do template global a ser forkado
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
		mutationFn: async () => {
			if (!kitchenId || !name.trim()) throw new Error("Dados incompletos")

			const { data, error } = await supabase
				.from("menu_template")
				.insert({
					name: name.trim(),
					description: description.trim() || null,
					kitchen_id: kitchenId,
				})
				.select()
				.single()

			if (error) throw new Error(error.message)
			return data
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Cardápio semanal "${data.name}" criado!`)
			navigate({
				to: "/kitchen/$kitchenId/weekly-menus/$weeklyMenuId",
				params: { kitchenId: kitchenIdStr!, weeklyMenuId: data.id },
			})
		},
		onError: (err) => toast.error(`Erro: ${err.message}`),
	})

	// Mutation: forkar template global
	const { mutate: createFork, isPending: isForking } = useMutation({
		mutationFn: async () => {
			if (!kitchenId || !forkFrom || !name.trim()) throw new Error("Dados incompletos")

			// 1. Criar novo template local com referência ao base
			const { data: newTemplate, error: templateError } = await supabase
				.from("menu_template")
				.insert({
					name: name.trim(),
					description: description.trim() || null,
					kitchen_id: kitchenId,
					base_template_id: forkFrom,
				})
				.select()
				.single()

			if (templateError) throw new Error(templateError.message)

			// 2. Copiar items do template base
			const { data: baseItems, error: itemsError } = await supabase
				.from("menu_template_items")
				.select("day_of_week, meal_type_id, recipe_id")
				.eq("menu_template_id", forkFrom)

			if (itemsError) {
				// Rollback
				await supabase.from("menu_template").delete().eq("id", newTemplate.id)
				throw new Error(itemsError.message)
			}

			if (baseItems && baseItems.length > 0) {
				const forkedItems: MenuTemplateItemInsert[] = baseItems.map((item) => ({
					menu_template_id: newTemplate.id,
					day_of_week: item.day_of_week,
					meal_type_id: item.meal_type_id,
					recipe_id: item.recipe_id,
				}))

				const { error: insertError } = await supabase
					.from("menu_template_items")
					.insert(forkedItems)

				if (insertError) {
					await supabase.from("menu_template").delete().eq("id", newTemplate.id)
					throw new Error(insertError.message)
				}
			}

			return newTemplate
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Fork "${data.name}" criado com sucesso!`)
			navigate({
				to: "/kitchen/$kitchenId/weekly-menus/$weeklyMenuId",
				params: { kitchenId: kitchenIdStr!, weeklyMenuId: data.id },
			})
		},
		onError: (err) => toast.error(`Erro ao forkar: ${err.message}`),
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
		<div className="space-y-6 mx-auto max-w-2xl">
			<PageHeader
				title={isFork ? "Forkar Plano Global" : "Novo Cardápio Semanal"}
				description={
					isFork ? "Cria uma cópia independente do plano global para sua cozinha." : undefined
				}
			>
				<Link
					to="/kitchen/$kitchenId/weekly-menus"
					params={{ kitchenId: kitchenIdStr! }}
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Cardápios Semanais
				</Link>
			</PageHeader>

			<div className="space-y-6">
				{/* Origem do fork */}
				{isFork && baseTemplate && (
					<Card className="border-dashed">
						<CardHeader className="pb-3">
							<CardTitle className="text-sm flex items-center gap-2">
								<GitFork className="w-4 h-4 text-muted-foreground" />
								Origem do Fork
							</CardTitle>
							<CardDescription>
								O novo cardápio semanal será uma cópia independente deste plano. Alterações futuras
								no original não afetarão sua versão local.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex items-center gap-3">
								<div>
									<p className="font-medium text-sm">{baseTemplate.name}</p>
									{baseTemplate.description && (
										<p className="text-xs text-muted-foreground mt-0.5">
											{baseTemplate.description}
										</p>
									)}
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
					<div className="rounded-lg border bg-card p-6 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">
								Nome do Cardápio Semanal <span className="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={
									isFork
										? `Ex.: ${baseTemplate?.name ?? "Cópia"} — ${new Date().getFullYear()}`
										: "Ex.: Semana Padrão, Semana de Feriados"
								}
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
							{isFork
								? "Após criar, você poderá editar o cardápio semanal livremente."
								: "Após criar, você será redirecionado para editar o cardápio semanal."}
						</p>
						<div className="flex gap-2">
							<Link to="/kitchen/$kitchenId/weekly-menus" params={{ kitchenId: kitchenIdStr! }}>
								<Button type="button" variant="outline">
									Cancelar
								</Button>
							</Link>
							<Button type="submit" disabled={isPending || !name.trim() || !kitchenId}>
								{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
								{isFork ? (
									<>
										<GitFork className="w-4 h-4 mr-2" />
										Criar Fork
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
