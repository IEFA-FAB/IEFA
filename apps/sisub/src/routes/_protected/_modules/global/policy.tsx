import { useForm } from "@tanstack/react-form"
import { createFileRoute } from "@tanstack/react-router"
import { Check, ClipboardList, Copy, Loader2, Pencil, Plus, Trash2, UtensilsCrossed, Wheat } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useCreatePolicyRule, useDeletePolicyRule, usePolicyRules, useReviewPrompt, useUpdatePolicyRule } from "@/hooks/data/usePolicyRules"
import type { PolicyRule, PolicyRuleInsert, PolicyTarget } from "@/types/domain/policy"

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/_protected/_modules/global/policy")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	component: PolicyPage,
	head: () => ({
		meta: [{ title: "Política de Revisão" }, { name: "description", content: "Gerenciamento de regras de política para revisão de insumos e preparações" }],
	}),
})

// ============================================================================
// Page
// ============================================================================

function PolicyPage() {
	return (
		<div className="space-y-6">
			<PageHeader
				title="Política de Revisão"
				description="Gerencie as regras que definem os critérios de qualidade para insumos e preparações do catálogo SDAB."
			/>

			<Tabs defaultValue="product">
				<TabsList className="mb-4">
					<TabsTrigger value="product" className="gap-2">
						<Wheat className="h-4 w-4" />
						Insumos
					</TabsTrigger>
					<TabsTrigger value="recipe" className="gap-2">
						<UtensilsCrossed className="h-4 w-4" />
						Preparações
					</TabsTrigger>
				</TabsList>

				<TabsContent value="product">
					<PolicyTab target="product" />
				</TabsContent>
				<TabsContent value="recipe">
					<PolicyTab target="recipe" />
				</TabsContent>
			</Tabs>
		</div>
	)
}

// ============================================================================
// PolicyTab
// ============================================================================

interface PolicyTabProps {
	target: PolicyTarget
}

function PolicyTab({ target }: PolicyTabProps) {
	const { data: rules, isLoading } = usePolicyRules(target)
	const promptQuery = useReviewPrompt(target)

	const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
	const [editingRule, setEditingRule] = useState<PolicyRule | null>(null)
	const [promptDialogOpen, setPromptDialogOpen] = useState(false)

	const updateMutation = useUpdatePolicyRule()

	const isProduct = target === "product"
	const label = isProduct ? "insumos" : "preparações"
	const activeRules = rules?.filter((r) => !r.deleted_at) ?? []

	function handleAddRule() {
		setEditingRule(null)
		setRuleDialogOpen(true)
	}

	function handleEditRule(rule: PolicyRule) {
		setEditingRule(rule)
		setRuleDialogOpen(true)
	}

	async function handleToggleActive(rule: PolicyRule) {
		await updateMutation.mutateAsync({
			id: rule.id,
			target: rule.target,
			payload: { active: !rule.active },
		})
	}

	async function handleGeneratePrompt() {
		setPromptDialogOpen(true)
		await promptQuery.refetch()
	}

	if (isLoading) {
		return (
			<div className="space-y-3">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-20 w-full rounded-lg" />
				))}
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{/* Header actions */}
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-muted-foreground">
					{activeRules.length} {activeRules.length === 1 ? "regra" : "regras"} de política para {label}
				</p>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={handleGeneratePrompt} className="gap-2">
						<ClipboardList className="h-4 w-4" />
						Gerar Prompt de Revisão
					</Button>
					<Button size="sm" onClick={handleAddRule} className="gap-2">
						<Plus className="h-4 w-4" />
						Nova Regra
					</Button>
				</div>
			</div>

			{/* Rules list */}
			{activeRules.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12 text-center">
						<ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
						<p className="text-sm font-medium text-muted-foreground">Nenhuma regra cadastrada</p>
						<p className="text-xs text-muted-foreground/70 mt-1">Adicione regras de política para {label}.</p>
						<Button size="sm" variant="outline" onClick={handleAddRule} className="mt-4 gap-2">
							<Plus className="h-4 w-4" />
							Nova Regra
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-2">
					{activeRules.map((rule) => (
						<RuleItem key={rule.id} rule={rule} onEdit={handleEditRule} onToggleActive={handleToggleActive} target={target} />
					))}
				</div>
			)}

			{/* Dialogs */}
			<RuleFormDialog
				key={editingRule?.id ?? "new"}
				open={ruleDialogOpen}
				onOpenChange={setRuleDialogOpen}
				target={target}
				editingRule={editingRule}
				nextOrder={(rules?.length ?? 0) + 1}
			/>

			<PromptDialog
				open={promptDialogOpen}
				onOpenChange={setPromptDialogOpen}
				target={target}
				prompt={promptQuery.data ?? ""}
				isFetching={promptQuery.isFetching}
			/>
		</div>
	)
}

// ============================================================================
// RuleItem
// ============================================================================

interface RuleItemProps {
	rule: PolicyRule
	target: PolicyTarget
	onEdit: (rule: PolicyRule) => void
	onToggleActive: (rule: PolicyRule) => void
}

function RuleItem({ rule, target, onEdit, onToggleActive }: RuleItemProps) {
	const deleteMutation = useDeletePolicyRule()
	const updateMutation = useUpdatePolicyRule()

	const isToggling = updateMutation.isPending && updateMutation.variables?.id === rule.id

	return (
		<Card className={rule.active ? "" : "opacity-60"}>
			<CardContent className="flex items-start gap-4 py-4">
				{/* Order badge */}
				<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground mt-0.5">
					{rule.display_order}
				</span>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold leading-snug">{rule.title}</p>
					<p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{rule.description}</p>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2 shrink-0 mt-0.5">
					<Switch
						checked={rule.active}
						onCheckedChange={() => onToggleActive(rule)}
						disabled={isToggling}
						aria-label={rule.active ? "Desativar regra" : "Ativar regra"}
					/>
					<Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(rule)} aria-label="Editar regra">
						<Pencil className="h-4 w-4" />
					</Button>
					<AlertDialog>
						<AlertDialogTrigger
							render={<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Remover regra" />}
						>
							<Trash2 className="h-4 w-4" />
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Remover regra?</AlertDialogTitle>
								<AlertDialogDescription>
									A regra <strong>"{rule.title}"</strong> será removida da política. Esta ação não pode ser desfeita pelo sistema.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancelar</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => deleteMutation.mutate({ id: rule.id, target })}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									{deleteMutation.isPending ? (
										<span className="inline-flex items-center gap-2">
											<Loader2 className="h-4 w-4 animate-spin" />
											Removendo…
										</span>
									) : (
										"Remover"
									)}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</CardContent>
		</Card>
	)
}

// ============================================================================
// RuleFormDialog (create / edit)
// ============================================================================

const ruleSchema = z.object({
	title: z.string().min(3, "Mínimo de 3 caracteres"),
	description: z.string().min(10, "Mínimo de 10 caracteres"),
	display_order: z.coerce.number().int().min(0, "Deve ser ≥ 0"),
})

interface RuleFormDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	target: PolicyTarget
	editingRule: PolicyRule | null
	nextOrder: number
}

function RuleFormDialog({ open, onOpenChange, target, editingRule, nextOrder }: RuleFormDialogProps) {
	const createMutation = useCreatePolicyRule()
	const updateMutation = useUpdatePolicyRule()

	const isEditing = editingRule !== null
	const isSaving = createMutation.isPending || updateMutation.isPending

	const form = useForm({
		defaultValues: {
			title: editingRule?.title ?? "",
			description: editingRule?.description ?? "",
			display_order: editingRule?.display_order ?? nextOrder,
		},
		validators: {
			onChange: ({ value }) => {
				const result = ruleSchema.safeParse(value)
				if (result.success) return undefined
				const errors: Record<string, string> = {}
				for (const issue of result.error.issues) {
					errors[issue.path.join(".")] = issue.message
				}
				return errors
			},
		},
		onSubmit: async ({ value }) => {
			try {
				if (isEditing && editingRule) {
					await updateMutation.mutateAsync({
						id: editingRule.id,
						target,
						payload: {
							title: value.title,
							description: value.description,
							display_order: value.display_order,
						},
					})
				} else {
					const payload: PolicyRuleInsert = {
						target,
						title: value.title,
						description: value.description,
						display_order: value.display_order,
					}
					await createMutation.mutateAsync(payload)
				}
				onOpenChange(false)
				form.reset()
			} catch {
				// errors handled by mutation onError toast
			}
		},
	})

	function handleClose() {
		onOpenChange(false)
		form.reset()
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Editar Regra" : "Nova Regra de Política"}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						e.stopPropagation()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<FieldGroup>
						<form.Field name="title">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Título</FieldLabel>
									<FieldDescription>Nome curto que identifica a regra (ex.: "Sem marca").</FieldDescription>
									<Input
										id={field.name}
										placeholder="Ex.: Sem marca ou fabricante"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										disabled={isSaving}
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors.join(", ")}</FieldError>}
								</Field>
							)}
						</form.Field>

						<form.Field name="description">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Descrição</FieldLabel>
									<FieldDescription>Diretiva completa que será incluída no prompt de revisão.</FieldDescription>
									<Textarea
										id={field.name}
										placeholder="Descreva a regra com clareza e exemplos quando possível…"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										disabled={isSaving}
										rows={4}
										className="resize-y bg-input"
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors.join(", ")}</FieldError>}
								</Field>
							)}
						</form.Field>

						<form.Field name="display_order">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Ordem</FieldLabel>
									<FieldDescription>Posição da regra na lista (números menores aparecem primeiro).</FieldDescription>
									<Input
										id={field.name}
										type="number"
										min={0}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(Number(e.target.value))}
										disabled={isSaving}
										className="w-28"
									/>
									{field.state.meta.errors.length > 0 && <FieldError>{field.state.meta.errors.join(", ")}</FieldError>}
								</Field>
							)}
						</form.Field>
					</FieldGroup>

					<DialogFooter className="pt-2">
						<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
							{([canSubmit, isSubmitting]) => (
								<>
									<Button type="button" variant="ghost" onClick={handleClose} disabled={isSaving || isSubmitting}>
										Cancelar
									</Button>
									<Button type="submit" disabled={!canSubmit || isSaving || isSubmitting}>
										{isSaving || isSubmitting ? (
											<span className="inline-flex items-center gap-2">
												<Loader2 className="h-4 w-4 animate-spin" />
												Salvando…
											</span>
										) : (
											"Salvar"
										)}
									</Button>
								</>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

// ============================================================================
// PromptDialog
// ============================================================================

interface PromptDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	target: PolicyTarget
	prompt: string
	isFetching: boolean
}

function PromptDialog({ open, onOpenChange, target, prompt, isFetching }: PromptDialogProps) {
	const [copied, setCopied] = useState(false)
	const label = target === "product" ? "Insumos" : "Preparações"

	async function handleCopy() {
		await navigator.clipboard.writeText(prompt)
		setCopied(true)
		toast.success("Prompt copiado para a área de transferência!")
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl flex flex-col max-h-[90dvh]">
				<DialogHeader className="shrink-0">
					<DialogTitle className="flex items-center gap-2">
						<ClipboardList className="h-5 w-5 text-muted-foreground" />
						Prompt de Revisão — {label}
					</DialogTitle>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto min-h-0">
					<Card className="border-dashed">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">Prompt gerado</CardTitle>
							<CardDescription className="text-xs">
								Copie o texto abaixo e cole em uma sessão do Claude com acesso ao MCP do Supabase para revisar os itens.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{isFetching ? (
								<div className="space-y-2">
									{Array.from({ length: 6 }).map((_, i) => (
										<Skeleton key={i} className="h-4 w-full" />
									))}
									<Skeleton className="h-4 w-2/3" />
								</div>
							) : (
								<Textarea value={prompt} readOnly className="font-mono text-xs resize-none bg-muted/40 border-0 focus-visible:ring-0 h-[50vh]" />
							)}
						</CardContent>
					</Card>
				</div>

				<DialogFooter className="shrink-0 pt-2">
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Fechar
					</Button>
					<Button onClick={handleCopy} disabled={isFetching || !prompt} className="gap-2">
						{copied ? (
							<>
								<Check className="h-4 w-4" />
								Copiado!
							</>
						) : (
							<>
								<Copy className="h-4 w-4" />
								Copiar Prompt
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
