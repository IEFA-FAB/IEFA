"use no memo"

import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Pencil, Plus, Search, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import { useUserKitchens } from "@/hooks/data/useKitchens"
import { useMessHalls } from "@/hooks/data/useMessHalls"
import {
	createUserPermissionFn,
	deleteUserPermissionFn,
	fetchUserPermissionsAdminFn,
	type PermissionRow,
	searchUsersByEmailFn,
	type UserSearchResult,
	updateUserPermissionFn,
} from "@/server/permissions.fn"
import type { AppModule } from "@/types/domain/permissions"

// ─── Label Maps ──────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<AppModule, string> = {
	diner: "Comensal",
	messhall: "Fiscal de Rancho",
	unit: "Gestão Unidade",
	kitchen: "Gestão Cozinha",
	"kitchen-production": "Produção Cozinha",
	global: "SDAB (Global)",
	analytics: "Análises",
	storage: "Estoque",
}

const LEVEL_CONFIG: Record<
	number,
	{ label: string; variant: "destructive" | "secondary" | "default" }
> = {
	0: { label: "Negado", variant: "destructive" },
	1: { label: "Leitura", variant: "secondary" },
	2: { label: "Escrita", variant: "default" },
}

type ScopeType = "global" | "unit" | "kitchen" | "mess_hall"

/**
 * Escopos válidos por módulo.
 * Módulos não listados aqui só aceitam "global".
 */
const MODULE_SCOPES: Partial<Record<AppModule, ScopeType[]>> = {
	messhall: ["global", "mess_hall"],
	unit: ["global", "unit"],
	kitchen: ["global", "kitchen"],
	"kitchen-production": ["global", "kitchen"],
}

const ALL_SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
	{ value: "global", label: "Global (todas as unidades)" },
	{ value: "unit", label: "Por Unidade (OM)" },
	{ value: "kitchen", label: "Por Cozinha" },
	{ value: "mess_hall", label: "Por Refeitório" },
]

function getScopeOptions(module: AppModule) {
	const allowed = MODULE_SCOPES[module] ?? ["global"]
	return ALL_SCOPE_OPTIONS.filter((o) => allowed.includes(o.value))
}

type FormState = {
	module: AppModule
	level: string
	scopeType: ScopeType
	scopeId: string
}

const INITIAL_FORM: FormState = {
	module: "diner",
	level: "1",
	scopeType: "global",
	scopeId: "",
}

type DialogState = { mode: "add" } | { mode: "edit"; perm: PermissionRow }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scopeFromForm(form: FormState) {
	return {
		unit_id: form.scopeType === "unit" && form.scopeId ? Number(form.scopeId) : null,
		kitchen_id: form.scopeType === "kitchen" && form.scopeId ? Number(form.scopeId) : null,
		mess_hall_id: form.scopeType === "mess_hall" && form.scopeId ? Number(form.scopeId) : null,
	}
}

function scopeTypeOf(perm: PermissionRow): ScopeType {
	if (perm.unit_id) return "unit"
	if (perm.kitchen_id) return "kitchen"
	if (perm.mess_hall_id) return "mess_hall"
	return "global"
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModuleBadge({ module }: { module: AppModule }) {
	return (
		<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium">
			{MODULE_LABELS[module] ?? module}
		</span>
	)
}

function LevelBadge({ level }: { level: number }) {
	const cfg = LEVEL_CONFIG[level] ?? { label: String(level), variant: "secondary" as const }
	return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function ScopeLabel({
	perm,
	unitMap,
	kitchenMap,
	messHallMap,
}: {
	perm: PermissionRow
	unitMap: Record<number, string>
	kitchenMap: Record<number, string>
	messHallMap: Record<number, string>
}) {
	if (perm.unit_id) return <span>Unidade: {unitMap[perm.unit_id] ?? perm.unit_id}</span>
	if (perm.kitchen_id) return <span>Cozinha: {kitchenMap[perm.kitchen_id] ?? perm.kitchen_id}</span>
	if (perm.mess_hall_id)
		return <span>Refeitório: {messHallMap[perm.mess_hall_id] ?? perm.mess_hall_id}</span>
	return <span className="text-muted-foreground">Global</span>
}

// ─── Permission Dialog ────────────────────────────────────────────────────────

// Aplicado em todos os SelectContent do formulário:
//   w-auto               → popup cresce para envolver o conteúdo (não fica preso na largura do trigger)
//   min-w-[var(...)]     → mínimo igual à largura do trigger, para não ficar menor
//   p-1                  → padding interno proporcional ao rounded-lg do popup (8px ≈ rounded-lg)
const CONTENT_CLS = "w-auto min-w-[var(--anchor-width)] p-2"

function PermissionDialog({
	open,
	dialog,
	form,
	setForm,
	isPending,
	units,
	kitchens,
	messHalls,
	onSubmit,
	onClose,
}: {
	open: boolean
	dialog: DialogState | null
	form: FormState
	setForm: React.Dispatch<React.SetStateAction<FormState>>
	isPending: boolean
	units: { id: number; code: string; display_name: string | null }[]
	kitchens: { id: number; unit: { display_name: string | null; code: string } | null }[]
	messHalls: { id: number; code: string; display_name: string | null }[]
	onSubmit: () => void
	onClose: () => void
}) {
	const isEdit = dialog?.mode === "edit"
	const isValid = form.scopeType === "global" || !!form.scopeId

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Editar Permissão" : "Adicionar Permissão"}</DialogTitle>
				</DialogHeader>

				<div className="grid gap-5 py-2">
					{/* Módulo */}
					<div className="grid grid-cols-4 items-center gap-3">
						<Label className="text-right text-sm">Módulo</Label>
						<div className="col-span-3">
							<Select
								value={form.module}
								onValueChange={(v) => {
									const mod = v as AppModule
									const validScopes = MODULE_SCOPES[mod] ?? ["global"]
									setForm((f) => ({
										...f,
										module: mod,
										scopeType: validScopes.includes(f.scopeType) ? f.scopeType : "global",
										scopeId: "",
									}))
								}}
								disabled={isEdit}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className={CONTENT_CLS}>
									{(Object.keys(MODULE_LABELS) as AppModule[]).map((m) => (
										<SelectItem key={m} value={m}>
											{MODULE_LABELS[m]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{isEdit && (
								<p className="mt-1 text-xs text-muted-foreground">
									O módulo não pode ser alterado. Exclua e crie uma nova permissão se necessário.
								</p>
							)}
						</div>
					</div>

					{/* Nível */}
					<div className="grid grid-cols-4 items-center gap-3">
						<Label className="text-right text-sm">Nível</Label>
						<div className="col-span-3">
							<Select
								value={form.level}
								onValueChange={(v) => setForm((f) => ({ ...f, level: v ?? "" }))}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className={CONTENT_CLS}>
									<SelectItem value="0">0 — Negado (nega acesso implícito)</SelectItem>
									<SelectItem value="1">1 — Leitura / Acesso básico</SelectItem>
									<SelectItem value="2">2 — Escrita / Edição</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Escopo tipo */}
					<div className="grid grid-cols-4 items-center gap-3">
						<Label className="text-right text-sm">Escopo</Label>
						<div className="col-span-3">
							<Select
								value={form.scopeType}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, scopeType: v as ScopeType, scopeId: "" }))
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className={CONTENT_CLS}>
									{getScopeOptions(form.module).map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Escopo valor — condicional por tipo */}
					{form.scopeType === "unit" && (
						<div className="grid grid-cols-4 items-center gap-3">
							<Label className="text-right text-sm">Unidade</Label>
							<div className="col-span-3">
								<Select
									value={form.scopeId}
									onValueChange={(v) => setForm((f) => ({ ...f, scopeId: v ?? "" }))}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Selecione a OM..." />
									</SelectTrigger>
									<SelectContent className={CONTENT_CLS}>
										{units.map((u) => (
											<SelectItem key={u.id} value={String(u.id)}>
												{u.display_name ?? u.code}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					)}

					{form.scopeType === "kitchen" && (
						<div className="grid grid-cols-4 items-center gap-3">
							<Label className="text-right text-sm">Cozinha</Label>
							<div className="col-span-3">
								<Select
									value={form.scopeId}
									onValueChange={(v) => setForm((f) => ({ ...f, scopeId: v ?? "" }))}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Selecione a cozinha..." />
									</SelectTrigger>
									<SelectContent className={CONTENT_CLS}>
										{kitchens.map((k) => (
											<SelectItem key={k.id} value={String(k.id)}>
												{k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}`}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					)}

					{form.scopeType === "mess_hall" && (
						<div className="grid grid-cols-4 items-center gap-3">
							<Label className="text-right text-sm">Refeitório</Label>
							<div className="col-span-3">
								<Select
									value={form.scopeId}
									onValueChange={(v) => setForm((f) => ({ ...f, scopeId: v ?? "" }))}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Selecione o refeitório..." />
									</SelectTrigger>
									<SelectContent className={CONTENT_CLS}>
										{messHalls.map((m) => (
											<SelectItem key={m.id} value={String(m.id)}>
												{m.display_name ?? m.code}
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
						{isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Adicionar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ─── Delete Confirmation Dialog ───────────────────────────────────────────────

function DeleteDialog({
	perm,
	isPending,
	onConfirm,
	onClose,
}: {
	perm: PermissionRow | null
	isPending: boolean
	onConfirm: () => void
	onClose: () => void
}) {
	return (
		<Dialog open={!!perm} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[400px]">
				<DialogHeader>
					<DialogTitle>Remover permissão</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground py-2">
					Tem certeza que deseja remover a permissão{" "}
					<span className="font-medium text-foreground">
						{perm ? MODULE_LABELS[perm.module] : ""}
					</span>{" "}
					(nível {perm?.level ?? ""})?{" "}
					{perm?.module === "diner" && perm?.level === 0 && (
						<span className="text-orange-600">
							Isso restaurará o acesso implícito de Comensal para este usuário.
						</span>
					)}
				</p>
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isPending}>
						Cancelar
					</Button>
					<Button variant="destructive" onClick={onConfirm} disabled={isPending}>
						{isPending ? "Removendo..." : "Remover"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PermissionsManager() {
	"use no memo"

	// ── Lookup data ──────────────────────────────────────────────────────────
	const { units, messHalls } = useMessHalls()
	const { data: kitchens = [] } = useUserKitchens()

	const unitMap = React.useMemo(
		() => Object.fromEntries(units.map((u) => [u.id, u.display_name ?? u.code])),
		[units]
	)
	const messHallMap = React.useMemo(
		() => Object.fromEntries(messHalls.map((m) => [m.id, m.display_name ?? m.code])),
		[messHalls]
	)
	const kitchenMap = React.useMemo(
		() =>
			Object.fromEntries(
				kitchens.map((k) => [k.id, k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}`])
			),
		[kitchens]
	)

	// ── Search ────────────────────────────────────────────────────────────────
	const [emailInput, setEmailInput] = React.useState("")
	const [debouncedEmail, setDebouncedEmail] = React.useState("")
	const [selectedUser, setSelectedUser] = React.useState<UserSearchResult | null>(null)

	React.useEffect(() => {
		const t = setTimeout(() => setDebouncedEmail(emailInput), 300)
		return () => clearTimeout(t)
	}, [emailInput])

	const { data: searchResults = [], isLoading: isSearching } = useQuery({
		queryKey: ["userSearch", debouncedEmail],
		queryFn: () => searchUsersByEmailFn({ data: { email: debouncedEmail } }),
		enabled: debouncedEmail.length >= 3,
		staleTime: 30_000,
	})

	// ── Permissions ───────────────────────────────────────────────────────────
	const queryClient = useQueryClient()
	const permsKey = ["adminPermissions", selectedUser?.id]

	const { data: permissions = [], isLoading: isLoadingPerms } = useQuery({
		queryKey: permsKey,
		queryFn: () => fetchUserPermissionsAdminFn({ data: { userId: selectedUser?.id } }),
		enabled: !!selectedUser,
	})

	// ── Dialog state ──────────────────────────────────────────────────────────
	const [dialog, setDialog] = React.useState<DialogState | null>(null)
	const [deleteTarget, setDeleteTarget] = React.useState<PermissionRow | null>(null)
	const [form, setForm] = React.useState<FormState>(INITIAL_FORM)

	const openAdd = () => {
		setForm(INITIAL_FORM)
		setDialog({ mode: "add" })
	}

	const openEdit = (perm: PermissionRow) => {
		const scopeType = scopeTypeOf(perm)
		const scopeId = (perm.unit_id ?? perm.kitchen_id ?? perm.mess_hall_id)?.toString() ?? ""
		setForm({ module: perm.module, level: String(perm.level), scopeType, scopeId })
		setDialog({ mode: "edit", perm })
	}

	const closeDialog = () => setDialog(null)

	// ── Mutations ─────────────────────────────────────────────────────────────
	const invalidatePerms = () => queryClient.invalidateQueries({ queryKey: permsKey })

	const createPerm = useMutation({
		mutationFn: () =>
			createUserPermissionFn({
				data: {
					userId: selectedUser?.id,
					module: form.module,
					level: Number(form.level),
					...scopeFromForm(form),
				},
			}),
		onSuccess: () => {
			toast.success("Permissão adicionada")
			closeDialog()
			invalidatePerms()
		},
		onError: (e: Error) => toast.error("Erro ao adicionar", { description: e.message }),
	})

	const updatePerm = useMutation({
		mutationFn: () => {
			if (dialog?.mode !== "edit") throw new Error("invalid state")
			return updateUserPermissionFn({
				data: {
					permissionId: dialog.perm.id,
					level: Number(form.level),
					...scopeFromForm(form),
				},
			})
		},
		onSuccess: () => {
			toast.success("Permissão atualizada")
			closeDialog()
			invalidatePerms()
		},
		onError: (e: Error) => toast.error("Erro ao atualizar", { description: e.message }),
	})

	const deletePerm = useMutation({
		mutationFn: (permissionId: string) => deleteUserPermissionFn({ data: { permissionId } }),
		onSuccess: () => {
			toast.success("Permissão removida")
			setDeleteTarget(null)
			invalidatePerms()
		},
		onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
	})

	const handleSubmit = () => {
		if (dialog?.mode === "add") createPerm.mutate()
		else if (dialog?.mode === "edit") updatePerm.mutate()
	}

	const isMutating = createPerm.isPending || updatePerm.isPending

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6">
			{/* ── Search Section ──────────────────────────────────────────────── */}
			{!selectedUser ? (
				<div className="rounded-lg border bg-card shadow-sm p-6 space-y-4">
					<div>
						<h2 className="text-base font-semibold">Buscar Usuário</h2>
						<p className="text-sm text-muted-foreground mt-0.5">
							Digite o email do usuário para gerenciar suas permissões.
						</p>
					</div>

					<div className="relative max-w-md">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							value={emailInput}
							onChange={(e) => setEmailInput(e.target.value)}
							placeholder="email@fab.mil.br"
							className="pl-9"
							autoFocus
						/>
					</div>

					{/* Results */}
					{debouncedEmail.length >= 3 && (
						<div className="space-y-1">
							{isSearching ? (
								<div className="space-y-2 pt-1">
									<Skeleton className="h-12 w-full rounded-lg" />
									<Skeleton className="h-12 w-full rounded-lg" />
								</div>
							) : searchResults.length === 0 ? (
								<p className="text-sm text-muted-foreground py-2">
									Nenhum usuário encontrado para &ldquo;{debouncedEmail}&rdquo;.
								</p>
							) : (
								searchResults.map((user) => (
									<button
										key={user.id}
										type="button"
										onClick={() => setSelectedUser(user)}
										className="w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm hover:bg-accent transition-colors group"
									>
										<div>
											<p className="font-medium">{user.email}</p>
											{user.nrOrdem && (
												<p className="text-xs text-muted-foreground mt-0.5">
													Nr. Ordem: {user.nrOrdem}
												</p>
											)}
										</div>
										<span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
											Selecionar →
										</span>
									</button>
								))
							)}
						</div>
					)}

					{debouncedEmail.length > 0 && debouncedEmail.length < 3 && (
						<p className="text-xs text-muted-foreground">
							Digite ao menos 3 caracteres para buscar.
						</p>
					)}
				</div>
			) : (
				/* ── User Permissions Panel ───────────────────────────────────── */
				<div className="space-y-4">
					{/* User info + back */}
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center gap-3">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setSelectedUser(null)}
								className="gap-1.5"
							>
								<ArrowLeft className="h-4 w-4" />
								Voltar
							</Button>
							<div className="h-5 w-px bg-border" />
							<div>
								<p className="font-semibold text-sm">{selectedUser.email}</p>
								{selectedUser.nrOrdem && (
									<p className="text-xs text-muted-foreground">Nr. Ordem: {selectedUser.nrOrdem}</p>
								)}
							</div>
						</div>
						<Button size="sm" onClick={openAdd} className="gap-1.5 shrink-0">
							<Plus className="h-4 w-4" />
							Adicionar permissão
						</Button>
					</div>

					{/* Permissions table */}
					<div className="rounded-lg border bg-card shadow-sm overflow-hidden p-6">
						<Table>
							<TableHeader className="border-b border-foreground">
								<TableRow>
									<TableHead className="text-foreground font-semibold">Módulo</TableHead>
									<TableHead className="text-foreground font-semibold">Nível</TableHead>
									<TableHead className="text-foreground font-semibold">Escopo</TableHead>
									<TableHead className="w-[80px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoadingPerms ? (
									Array.from({ length: 3 }).map((_, i) => (
										<TableRow key={i}>
											<TableCell>
												<Skeleton className="h-5 w-28" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-16" />
											</TableCell>
											<TableCell>
												<Skeleton className="h-5 w-24" />
											</TableCell>
											<TableCell />
										</TableRow>
									))
								) : permissions.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={4}
											className="h-24 text-center text-muted-foreground text-sm"
										>
											<div className="flex flex-col items-center gap-1">
												<span>Nenhuma permissão cadastrada.</span>
												<span className="text-xs">
													Acesso implícito de Comensal ativo por padrão.
												</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									permissions.map((perm) => (
										<TableRow key={perm.id} className="hover:bg-accent/40">
											<TableCell>
												<ModuleBadge module={perm.module} />
											</TableCell>
											<TableCell>
												<LevelBadge level={perm.level} />
											</TableCell>
											<TableCell className="text-sm">
												<ScopeLabel
													perm={perm}
													unitMap={unitMap}
													kitchenMap={kitchenMap}
													messHallMap={messHallMap}
												/>
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1 justify-end">
													<Button
														variant="ghost"
														size="sm"
														className="h-7 w-7 p-0"
														onClick={() => openEdit(perm)}
													>
														<Pencil className="h-3.5 w-3.5" />
														<span className="sr-only">Editar</span>
													</Button>
													<Button
														variant="ghost"
														size="sm"
														className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
														onClick={() => setDeleteTarget(perm)}
													>
														<Trash2 className="h-3.5 w-3.5" />
														<span className="sr-only">Remover</span>
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					<p className="text-xs text-muted-foreground">
						<span className="font-medium">Regra implícita:</span> todo usuário possui acesso de
						Comensal (nível 1) por padrão. Para revogar, adicione uma permissão{" "}
						<span className="font-medium">diner — Negado</span>.
					</p>
				</div>
			)}

			{/* ── Dialogs ─────────────────────────────────────────────────────── */}
			<PermissionDialog
				open={!!dialog}
				dialog={dialog}
				form={form}
				setForm={setForm}
				isPending={isMutating}
				units={[...units]}
				kitchens={kitchens}
				messHalls={[...messHalls]}
				onSubmit={handleSubmit}
				onClose={closeDialog}
			/>

			<DeleteDialog
				perm={deleteTarget}
				isPending={deletePerm.isPending}
				onConfirm={() => deleteTarget && deletePerm.mutate(deleteTarget.id)}
				onClose={() => setDeleteTarget(null)}
			/>
		</div>
	)
}
