"use no memo"

import type { PolicyStatementInput } from "@iefa/sisub-domain"
import { ArrowLeft, Lock, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
	useAddPolicyStatement,
	useCreatePolicy,
	useDeletePolicy,
	usePolicies,
	usePolicy,
	useRemovePolicyStatement,
	useUpdatePolicy,
	useUpdatePolicyStatement,
} from "@/hooks/data/usePolicies"
import {
	getScopeOptions,
	LEVEL_CONFIG,
	MODULE_LABELS,
	MODULE_SCOPES,
	type ScopeMaps,
	type ScopeType,
	type SisubModule,
	scopeLabel,
	scopeTypeOf,
} from "./labels"

// w-auto → o popup envolve o conteúdo em vez de herdar a largura do trigger.
const CONTENT_CLS = "w-auto min-w-(--anchor-width) p-2"

type StatementDraft = {
	module: SisubModule
	level: string
	scopeType: ScopeType
	scopeId: string
}

const INITIAL_DRAFT: StatementDraft = { module: "kitchen", level: "1", scopeType: "global", scopeId: "" }

function draftToStatement(draft: StatementDraft): PolicyStatementInput {
	return {
		module: draft.module,
		level: Number(draft.level),
		unit_id: draft.scopeType === "unit" && draft.scopeId ? Number(draft.scopeId) : null,
		kitchen_id: draft.scopeType === "kitchen" && draft.scopeId ? Number(draft.scopeId) : null,
		mess_hall_id: draft.scopeType === "mess_hall" && draft.scopeId ? Number(draft.scopeId) : null,
	}
}

// ─── Diálogo de statement ─────────────────────────────────────────────────────

function StatementDialog({
	open,
	draft,
	setDraft,
	isEdit,
	isPending,
	scopes,
	onSubmit,
	onClose,
}: {
	open: boolean
	draft: StatementDraft
	setDraft: React.Dispatch<React.SetStateAction<StatementDraft>>
	isEdit: boolean
	isPending: boolean
	scopes: { units: { id: number; label: string }[]; kitchens: { id: number; label: string }[]; messHalls: { id: number; label: string }[] }
	onSubmit: () => void
	onClose: () => void
}) {
	const isValid = draft.scopeType === "global" || !!draft.scopeId
	const options = draft.scopeType === "unit" ? scopes.units : draft.scopeType === "kitchen" ? scopes.kitchens : scopes.messHalls
	const selected = options.find((o) => o.id === Number(draft.scopeId))

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Editar permissão da política" : "Adicionar permissão à política"}</DialogTitle>
				</DialogHeader>

				<div className="grid gap-5 py-2">
					<div className="grid grid-cols-4 items-center gap-3">
						<Label className="text-right text-sm">Módulo</Label>
						<div className="col-span-3">
							<Select
								value={draft.module}
								onValueChange={(v) => {
									const mod = v as SisubModule
									const valid = MODULE_SCOPES[mod] ?? ["global"]
									// Escopo incompatível com o módulo novo volta para global — senão o
									// statement nasceria com um escopo que aquele módulo nunca casa.
									setDraft((d) => ({ ...d, module: mod, scopeType: valid.includes(d.scopeType) ? d.scopeType : "global", scopeId: "" }))
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue>{MODULE_LABELS[draft.module]}</SelectValue>
								</SelectTrigger>
								<SelectContent className={CONTENT_CLS}>
									{(Object.keys(MODULE_LABELS) as SisubModule[]).map((m) => (
										<SelectItem key={m} value={m}>
											{MODULE_LABELS[m]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid grid-cols-4 items-center gap-3">
						<Label className="text-right text-sm">Nível</Label>
						<div className="col-span-3">
							<Select value={draft.level} onValueChange={(v) => setDraft((d) => ({ ...d, level: v ?? "" }))}>
								<SelectTrigger className="w-full">
									<SelectValue>{LEVEL_CONFIG[Number(draft.level)]?.label ?? draft.level}</SelectValue>
								</SelectTrigger>
								<SelectContent className={CONTENT_CLS}>
									<SelectItem value="0">0 — Negado (anula qualquer allow)</SelectItem>
									<SelectItem value="1">1 — Leitura / Acesso básico</SelectItem>
									<SelectItem value="2">2 — Escrita / Edição</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid grid-cols-4 items-center gap-3">
						<Label className="text-right text-sm">Escopo</Label>
						<div className="col-span-3">
							<Select value={draft.scopeType} onValueChange={(v) => setDraft((d) => ({ ...d, scopeType: v as ScopeType, scopeId: "" }))}>
								<SelectTrigger className="w-full">
									<SelectValue>{getScopeOptions(draft.module).find((o) => o.value === draft.scopeType)?.label ?? draft.scopeType}</SelectValue>
								</SelectTrigger>
								<SelectContent className={CONTENT_CLS}>
									{getScopeOptions(draft.module).map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{draft.scopeType !== "global" && (
						<div className="grid grid-cols-4 items-center gap-3">
							<Label className="text-right text-sm">Alvo</Label>
							<div className="col-span-3">
								<Select value={draft.scopeId} onValueChange={(v) => setDraft((d) => ({ ...d, scopeId: v ?? "" }))}>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Selecione...">{selected?.label}</SelectValue>
									</SelectTrigger>
									<SelectContent className={CONTENT_CLS}>
										{options.map((o) => (
											<SelectItem key={o.id} value={String(o.id)}>
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="flex justify-between">
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancelar
					</Button>
					<Button onClick={onSubmit} disabled={isPending || !isValid}>
						{isPending ? "Salvando..." : isEdit ? "Salvar" : "Adicionar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ─── Detalhe da política ──────────────────────────────────────────────────────

function PolicyDetailPanel({
	policyId,
	maps,
	scopes,
	onBack,
}: {
	policyId: string
	maps: ScopeMaps
	scopes: React.ComponentProps<typeof StatementDialog>["scopes"]
	onBack: () => void
}) {
	const { data: policy, isLoading } = usePolicy(policyId)
	const addStatement = useAddPolicyStatement()
	const updateStatement = useUpdatePolicyStatement()
	const removeStatement = useRemovePolicyStatement()
	const updatePolicy = useUpdatePolicy()

	const [dialog, setDialog] = React.useState<{ mode: "add" } | { mode: "edit"; statementId: string } | null>(null)
	const [draft, setDraft] = React.useState<StatementDraft>(INITIAL_DRAFT)
	const [name, setName] = React.useState("")
	const [description, setDescription] = React.useState("")

	React.useEffect(() => {
		if (policy) {
			setName(policy.name)
			setDescription(policy.description ?? "")
		}
	}, [policy])

	if (isLoading || !policy) return <Skeleton className="h-64 w-full rounded-lg" />

	const readOnly = policy.managed

	const submit = () => {
		if (dialog?.mode === "add") addStatement.mutate({ policyId, statement: draftToStatement(draft) }, { onSuccess: () => setDialog(null) })
		else if (dialog?.mode === "edit")
			updateStatement.mutate({ statementId: dialog.statementId, statement: draftToStatement(draft) }, { onSuccess: () => setDialog(null) })
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
					<ArrowLeft className="size-4" />
					Voltar
				</Button>
				<div className="h-5 w-px bg-border" />
				<p className="text-subheading">{policy.name}</p>
				{policy.managed && (
					<Badge variant="secondary" className="gap-1">
						<Lock className="size-3" />
						Gerenciada
					</Badge>
				)}
			</div>

			{readOnly && (
				<Alert>
					<Lock className="size-4" />
					<AlertTitle>Política gerenciada pelo sistema</AlertTitle>
					<AlertDescription>
						Criada por migration e imutável: alterar seus escopos transformaria a política que define o ambiente de treino num acesso de escrita à operação
						real. Ela pode ser anexada e desanexada normalmente.
					</AlertDescription>
				</Alert>
			)}

			<div className="rounded-lg border bg-card p-6 space-y-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="policy-name" className="text-sm">
							Nome
						</Label>
						<Input id="policy-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="policy-description" className="text-sm">
							Descrição
						</Label>
						<Textarea id="policy-description" value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} rows={2} />
					</div>
				</div>
				{!readOnly && (
					<div className="flex justify-end">
						<Button
							size="sm"
							onClick={() => updatePolicy.mutate({ policyId, name, description: description.trim() || null })}
							disabled={updatePolicy.isPending || name.trim().length < 3}
						>
							{updatePolicy.isPending ? "Salvando..." : "Salvar dados da política"}
						</Button>
					</div>
				)}
			</div>

			<div className="rounded-lg border bg-card overflow-hidden p-6 space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-heading">Permissões</h3>
					{!readOnly && (
						<Button
							size="sm"
							onClick={() => {
								setDraft(INITIAL_DRAFT)
								setDialog({ mode: "add" })
							}}
							className="gap-1.5"
						>
							<Plus className="size-4" />
							Adicionar
						</Button>
					)}
				</div>

				<Table>
					<TableHeader className="border-b border-foreground">
						<TableRow>
							<TableHead className="text-foreground text-subheading">Módulo</TableHead>
							<TableHead className="text-foreground text-subheading">Nível</TableHead>
							<TableHead className="text-foreground text-subheading">Escopo</TableHead>
							<TableHead className="w-[80px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{policy.statements.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
									Nenhuma permissão nesta política — anexá-la não concede nada.
								</TableCell>
							</TableRow>
						) : (
							policy.statements.map((st) => (
								<TableRow key={st.id} className="hover:bg-accent/40">
									<TableCell>
										<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-caption">
											{MODULE_LABELS[st.module as SisubModule] ?? st.module}
										</span>
									</TableCell>
									<TableCell>
										<Badge variant={LEVEL_CONFIG[st.level]?.variant ?? "secondary"}>{LEVEL_CONFIG[st.level]?.label ?? st.level}</Badge>
									</TableCell>
									<TableCell className="text-sm">{scopeLabel(st, maps)}</TableCell>
									<TableCell>
										{!readOnly && (
											<div className="flex items-center gap-1 justify-end">
												<Button
													variant="ghost"
													size="sm"
													className="size-7 p-0"
													onClick={() => {
														setDraft({
															module: st.module as SisubModule,
															level: String(st.level),
															scopeType: scopeTypeOf(st),
															scopeId: (st.unit_id ?? st.kitchen_id ?? st.mess_hall_id)?.toString() ?? "",
														})
														setDialog({ mode: "edit", statementId: st.id })
													}}
												>
													<Pencil className="size-3.5" />
													<span className="sr-only">Editar</span>
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="size-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => removeStatement.mutate(st.id)}
												>
													<Trash2 className="size-3.5" />
													<span className="sr-only">Remover</span>
												</Button>
											</div>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<StatementDialog
				open={!!dialog}
				draft={draft}
				setDraft={setDraft}
				isEdit={dialog?.mode === "edit"}
				isPending={addStatement.isPending || updateStatement.isPending}
				scopes={scopes}
				onSubmit={submit}
				onClose={() => setDialog(null)}
			/>
		</div>
	)
}

// ─── Listagem ─────────────────────────────────────────────────────────────────

export function PoliciesManager({ maps, scopes }: { maps: ScopeMaps; scopes: React.ComponentProps<typeof StatementDialog>["scopes"] }) {
	"use no memo"

	const { data: policies = [], isLoading } = usePolicies()
	const createPolicy = useCreatePolicy()
	const deletePolicy = useDeletePolicy()

	const [selectedId, setSelectedId] = React.useState<string | null>(null)
	const [createOpen, setCreateOpen] = React.useState(false)
	const [newName, setNewName] = React.useState("")
	const [newDescription, setNewDescription] = React.useState("")
	const [deleteTarget, setDeleteTarget] = React.useState<(typeof policies)[number] | null>(null)

	if (selectedId) {
		return <PolicyDetailPanel policyId={selectedId} maps={maps} scopes={scopes} onBack={() => setSelectedId(null)} />
	}

	return (
		<div className="space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-heading">Políticas</h2>
					<p className="text-sm text-muted-foreground mt-0.5">
						Uma política é um conjunto nomeado de permissões. Anexe-a a um usuário para conceder todas de uma vez — e desanexe para revogar em bloco.
					</p>
				</div>
				<Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 shrink-0">
					<Plus className="size-4" />
					Nova política
				</Button>
			</div>

			<div className="rounded-lg border bg-card overflow-hidden p-6">
				<Table>
					<TableHeader className="border-b border-foreground">
						<TableRow>
							<TableHead className="text-foreground text-subheading">Nome</TableHead>
							<TableHead className="text-foreground text-subheading">Permissões</TableHead>
							<TableHead className="text-foreground text-subheading">Usuários</TableHead>
							<TableHead className="w-[80px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell colSpan={4}>
									<Skeleton className="h-5 w-full" />
								</TableCell>
							</TableRow>
						) : policies.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
									Nenhuma política cadastrada.
								</TableCell>
							</TableRow>
						) : (
							policies.map((policy) => (
								<TableRow key={policy.id} className="hover:bg-accent/40">
									<TableCell>
										<button type="button" onClick={() => setSelectedId(policy.id)} className="text-left">
											<span className="text-subheading underline-offset-2 hover:underline">{policy.name}</span>
											{policy.managed && (
												<Badge variant="secondary" className="ml-2 gap-1">
													<Lock className="size-3" />
													Gerenciada
												</Badge>
											)}
											{policy.description && <p className="text-xs text-muted-foreground mt-0.5">{policy.description}</p>}
										</button>
									</TableCell>
									<TableCell className="text-sm font-mono">{policy.statement_count}</TableCell>
									<TableCell className="text-sm font-mono">{policy.attachment_count}</TableCell>
									<TableCell>
										{!policy.managed && (
											<div className="flex justify-end">
												<Button
													variant="ghost"
													size="sm"
													className="size-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => setDeleteTarget(policy)}
												>
													<Trash2 className="size-3.5" />
													<span className="sr-only">Remover</span>
												</Button>
											</div>
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
				<DialogContent className="sm:max-w-[480px]">
					<DialogHeader>
						<DialogTitle>Nova política</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="new-policy-name" className="text-sm">
								Nome
							</Label>
							<Input id="new-policy-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Fiscal de Rancho" />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="new-policy-description" className="text-sm">
								Descrição
							</Label>
							<Textarea id="new-policy-description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2} />
						</div>
						<p className="text-xs text-muted-foreground">A política nasce vazia. Adicione as permissões dela na tela seguinte.</p>
					</div>
					<DialogFooter className="flex justify-between">
						<Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createPolicy.isPending}>
							Cancelar
						</Button>
						<Button
							onClick={() =>
								createPolicy.mutate(
									{ name: newName, description: newDescription.trim() || null },
									{
										onSuccess: (policy) => {
											setCreateOpen(false)
											setNewName("")
											setNewDescription("")
											setSelectedId(policy.id)
										},
									}
								)
							}
							disabled={createPolicy.isPending || newName.trim().length < 3}
						>
							{createPolicy.isPending ? "Criando..." : "Criar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
				<DialogContent className="sm:max-w-[440px]">
					<DialogHeader>
						<DialogTitle>Remover política</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground py-2">
						Remover <span className="text-subheading text-foreground">{deleteTarget?.name}</span>?{" "}
						{(deleteTarget?.attachment_count ?? 0) > 0 && (
							<span className="text-warning">{deleteTarget?.attachment_count} usuário(s) perderão as permissões concedidas por ela imediatamente.</span>
						)}
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deletePolicy.isPending}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							onClick={() => deleteTarget && deletePolicy.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
							disabled={deletePolicy.isPending}
						>
							{deletePolicy.isPending ? "Removendo..." : "Remover"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
