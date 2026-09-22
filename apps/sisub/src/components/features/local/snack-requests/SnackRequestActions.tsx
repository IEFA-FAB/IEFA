import type { SnackRequestDetail } from "@iefa/sisub-domain"
import { cancelDiscardsFood, isTerminalStatus } from "@iefa/sisub-domain/utils"
import { AlertTriangle, Ban, Check, ChefHat, Info, PackageCheck, Plus, Trash2, Undo2, X } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"
import { usePBAC } from "@/auth/pbac"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
	useAdvanceSnackRequest,
	useCancelKitchenSnackRequest,
	useCloseSnackRequest,
	useDecideSnackRequest,
	useRegisterSnackMaterialReturn,
	useRegisterSnackPickup,
} from "@/hooks/data/useSnackRequests"
import { cn } from "@/lib/cn"
import {
	AUDIENCE_LABELS,
	asStatus,
	classLabel,
	localInputToIso,
	MATERIAL_ITEM_LABELS,
	MATERIAL_ITEMS,
	type MaterialItem,
	nowBrasiliaLocalInput,
} from "./format"

type DialogKind = "accept" | "reject" | "ready" | "pickup" | "return" | "cancel" | null

interface SnackRequestActionsProps {
	request: SnackRequestDetail
	kitchenId: number
}

/**
 * Ações da cozinha conforme o status. Quem pode o quê espelha o servidor: decidir e cancelar
 * exigem `kitchen:2`; andamento, retirada, devolução e encerramento aceitam também quem opera
 * o chão (`kitchen-production:1`). O servidor continua sendo a trava — esconder o botão só
 * evita oferecer o que vai ser negado.
 */
export function SnackRequestActions({ request, kitchenId }: SnackRequestActionsProps) {
	const { can } = usePBAC()
	const scope = { type: "kitchen", id: kitchenId } as const
	const canManage = can("kitchen", 2, scope)
	const canFloor = canManage || can("kitchen-production", 1, scope)

	const [dialog, setDialog] = useState<DialogKind>(null)
	const close = () => setDialog(null)

	const advance = useAdvanceSnackRequest()
	const closeRequest = useCloseSnackRequest()

	const status = asStatus(request.status)
	const pendingMaterials = request.materials.filter((m) => m.returned_quantity < m.quantity)
	const canReturn = (status === "delivered" || status === "cancelled") && pendingMaterials.length > 0

	const actions: ReactNode[] = []

	if (status === "submitted" && canManage) {
		actions.push(
			<Button key="accept" size="sm" onClick={() => setDialog("accept")}>
				<Check className="size-4 mr-1.5" aria-hidden="true" />
				Aceitar
			</Button>,
			<Button key="reject" size="sm" variant="outline" onClick={() => setDialog("reject")}>
				<X className="size-4 mr-1.5" aria-hidden="true" />
				Recusar
			</Button>
		)
	}
	if (status === "accepted" && canFloor) {
		actions.push(
			<Button key="start" size="sm" disabled={advance.isPending} onClick={() => advance.mutate({ requestId: request.id, to: "in_production" })}>
				<ChefHat className="size-4 mr-1.5" aria-hidden="true" />
				Iniciar produção
			</Button>
		)
	}
	if (status === "in_production" && canFloor) {
		actions.push(
			<Button key="ready" size="sm" onClick={() => setDialog("ready")}>
				<Check className="size-4 mr-1.5" aria-hidden="true" />
				Marcar pronto
			</Button>
		)
	}
	if (status === "ready" && canFloor) {
		actions.push(
			<Button key="pickup" size="sm" onClick={() => setDialog("pickup")}>
				<PackageCheck className="size-4 mr-1.5" aria-hidden="true" />
				Registrar retirada
			</Button>
		)
	}
	if (canReturn && canFloor) {
		actions.push(
			<Button key="return" size="sm" variant={status === "cancelled" ? "default" : "outline"} onClick={() => setDialog("return")}>
				<Undo2 className="size-4 mr-1.5" aria-hidden="true" />
				Registrar devolução
			</Button>
		)
	}
	if (status === "delivered" && pendingMaterials.length === 0 && canFloor) {
		actions.push(
			<Button key="close" size="sm" disabled={closeRequest.isPending} onClick={() => closeRequest.mutate(request.id)}>
				<Check className="size-4 mr-1.5" aria-hidden="true" />
				Encerrar
			</Button>
		)
	}
	if (!isTerminalStatus(status) && canManage) {
		actions.push(
			<Button key="cancel" size="sm" variant="destructive" onClick={() => setDialog("cancel")}>
				<Ban className="size-4 mr-1.5" aria-hidden="true" />
				Cancelar pedido
			</Button>
		)
	}

	return (
		<>
			{actions.length > 0 ? (
				<div className="flex flex-wrap gap-2">{actions}</div>
			) : (
				<p className="text-caption text-muted-foreground">
					{isTerminalStatus(status) && !canReturn
						? "Pedido encerrado — nenhuma ação pendente."
						: "Seu acesso nesta cozinha não permite a próxima etapa deste pedido."}
				</p>
			)}
			{status === "delivered" && pendingMaterials.length > 0 && (
				<p className="text-caption text-muted-foreground">O pedido só pode ser encerrado depois que todo o material cautelado voltar.</p>
			)}

			<ActionDialog open={dialog === "accept"} onClose={close} wide>
				<AcceptForm request={request} onDone={close} />
			</ActionDialog>
			<ActionDialog open={dialog === "reject"} onClose={close}>
				<RejectForm request={request} onDone={close} />
			</ActionDialog>
			<ActionDialog open={dialog === "ready"} onClose={close}>
				<ReadyForm request={request} onDone={close} />
			</ActionDialog>
			<ActionDialog open={dialog === "pickup"} onClose={close} wide>
				<PickupForm request={request} onDone={close} />
			</ActionDialog>
			<ActionDialog open={dialog === "return"} onClose={close}>
				<ReturnForm request={request} onDone={close} />
			</ActionDialog>
			<ActionDialog open={dialog === "cancel"} onClose={close}>
				<CancelForm request={request} onDone={close} />
			</ActionDialog>
		</>
	)
}

/** O formulário só monta com o diálogo aberto: cada abertura começa do estado do pedido. */
function ActionDialog({ open, onClose, wide, children }: { open: boolean; onClose: () => void; wide?: boolean; children: ReactNode }) {
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-md"}>{open && children}</DialogContent>
		</Dialog>
	)
}

type FormProps = { request: SnackRequestDetail; onDone: () => void }

function parseCount(value: string): number | null {
	if (value.trim() === "") return null
	const n = Number(value)
	return Number.isInteger(n) && n >= 0 ? n : null
}

// ── Aceitar ────────────────────────────────────────────────────────────────

function AcceptForm({ request, onDone }: FormProps) {
	const decide = useDecideSnackRequest()
	const [unitValue, setUnitValue] = useState(request.unit_value != null ? String(request.unit_value) : "")
	const [note, setNote] = useState("")
	const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(request.lines.map((l) => [l.id, String(l.quantity)])))
	const [submitted, setSubmitted] = useState(false)

	const value = unitValue.trim() === "" ? null : Number(unitValue.replace(",", "."))
	const valueError = value == null ? "Informe o valor do lanche." : !Number.isFinite(value) || value < 0 ? "Valor inválido." : null

	const lineErrors = new Map<string, string>()
	for (const line of request.lines) {
		const q = parseCount(quantities[line.id] ?? "")
		if (q == null) lineErrors.set(line.id, "Quantidade inválida.")
		else if (q > line.quantity) lineErrors.set(line.id, `No máximo ${line.quantity} (o pedido).`)
	}
	const allZero = request.lines.every((l) => parseCount(quantities[l.id] ?? "") === 0)

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setSubmitted(true)
		if (valueError || lineErrors.size > 0 || allZero || value == null) return
		const adjustments = request.lines
			.map((l) => ({ lineId: l.id, approvedQuantity: parseCount(quantities[l.id] ?? "") ?? l.quantity, requested: l.quantity }))
			.filter((a) => a.approvedQuantity !== a.requested)
			.map(({ lineId, approvedQuantity }) => ({ lineId, approvedQuantity }))
		decide.mutate(
			{
				requestId: request.id,
				decision: "accept",
				unitValue: value,
				note: note.trim() || undefined,
				adjustments: adjustments.length > 0 ? adjustments : undefined,
			},
			{ onSuccess: onDone }
		)
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			<DialogHeader>
				<DialogTitle>Aceitar pedido</DialogTitle>
				<DialogDescription>
					Ao aceitar, os itens entram no quadro de produção da cozinha sob “Lanches de Bordo/Apoio”, discriminados por pedido.
				</DialogDescription>
			</DialogHeader>

			<FieldGroup>
				<Field data-invalid={submitted && !!valueError}>
					<FieldLabel htmlFor="snack-unit-value">Valor do lanche (R$)</FieldLabel>
					<Input
						id="snack-unit-value"
						inputMode="decimal"
						type="number"
						step="0.01"
						min="0"
						value={unitValue}
						onChange={(e) => setUnitValue(e.target.value)}
						aria-invalid={submitted && !!valueError}
						className="font-mono tabular-nums"
						autoFocus
					/>
					<FieldDescription>Preenchido pela SSU, conforme o campo “valor do lanche” do Anexo E.</FieldDescription>
					{submitted && valueError && <FieldError>{valueError}</FieldError>}
				</Field>

				<div className="grid gap-2">
					<p className="text-subheading text-foreground">Quantidade aprovada por linha</p>
					<p className="text-hint text-muted-foreground">
						Só é possível reduzir. Linhas marcadas como opcionais (passageiros da Classe C em voo não operacional) ficam a critério da cozinha.
					</p>
					<div className="grid gap-2">
						{request.lines.map((line) => {
							const error = submitted ? lineErrors.get(line.id) : undefined
							return (
								<div
									key={line.id}
									className={cn("grid grid-cols-[1fr_6rem] items-center gap-3 rounded-lg border px-3 py-2", line.optional && "border-warning/40 bg-warning/5")}
								>
									<div className="min-w-0">
										<label htmlFor={`snack-line-${line.id}`} className="text-body text-foreground">
											{line.standard_snapshot.name}
										</label>
										<div className="flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
											<span>
												{classLabel(line.standard_snapshot.family, line.standard_snapshot.snackClass)} · {AUDIENCE_LABELS[line.audience] ?? line.audience} ·
												pedido <span className="font-mono tabular-nums">{line.quantity}</span>
											</span>
											{line.optional && <Badge variant="warning">Opcional</Badge>}
										</div>
										{error && <p className="text-hint text-destructive">{error}</p>}
									</div>
									<Input
										id={`snack-line-${line.id}`}
										type="number"
										min="0"
										max={line.quantity}
										step="1"
										value={quantities[line.id] ?? ""}
										onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: e.target.value }))}
										aria-invalid={!!error}
										className="font-mono tabular-nums text-right"
									/>
								</div>
							)
						})}
					</div>
					{submitted && allZero && <FieldError>Aceitar zerando tudo é recusar: use “Recusar”, com o motivo.</FieldError>}
				</div>

				<Field>
					<FieldLabel htmlFor="snack-accept-note">Observação (opcional)</FieldLabel>
					<Textarea id="snack-accept-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
				</Field>
			</FieldGroup>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Voltar
				</Button>
				<Button type="submit" disabled={decide.isPending}>
					Aceitar pedido
				</Button>
			</DialogFooter>
		</form>
	)
}

// ── Recusar ────────────────────────────────────────────────────────────────

function RejectForm({ request, onDone }: FormProps) {
	const decide = useDecideSnackRequest()
	const [reason, setReason] = useState("")
	const [submitted, setSubmitted] = useState(false)
	const invalid = reason.trim() === ""

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setSubmitted(true)
		if (invalid) return
		decide.mutate({ requestId: request.id, decision: "reject", reason: reason.trim() }, { onSuccess: onDone })
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			<DialogHeader>
				<DialogTitle>Recusar pedido</DialogTitle>
				<DialogDescription>O requisitante vê o motivo no acompanhamento do pedido.</DialogDescription>
			</DialogHeader>
			<Field data-invalid={submitted && invalid}>
				<FieldLabel htmlFor="snack-reject-reason">Motivo</FieldLabel>
				<Textarea
					id="snack-reject-reason"
					value={reason}
					maxLength={500}
					onChange={(e) => setReason(e.target.value)}
					aria-invalid={submitted && invalid}
					autoFocus
				/>
				{submitted && invalid && <FieldError>Informe o motivo da recusa.</FieldError>}
			</Field>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Voltar
				</Button>
				<Button type="submit" variant="destructive" disabled={decide.isPending}>
					Recusar pedido
				</Button>
			</DialogFooter>
		</form>
	)
}

// ── Pronto (amostra) ───────────────────────────────────────────────────────

function ReadyForm({ request, onDone }: FormProps) {
	const advance = useAdvanceSnackRequest()
	const [collectedAt, setCollectedAt] = useState(nowBrasiliaLocalInput)
	const [notes, setNotes] = useState("")
	const [submitted, setSubmitted] = useState(false)
	const iso = localInputToIso(collectedAt)

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setSubmitted(true)
		if (!iso) return
		advance.mutate({ requestId: request.id, to: "ready", sampleCollectedAt: iso, sampleNotes: notes.trim() || undefined }, { onSuccess: onDone })
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			<DialogHeader>
				<DialogTitle>Marcar como pronto</DialogTitle>
				<DialogDescription>A retirada só é liberada com a coleta da amostra registrada.</DialogDescription>
			</DialogHeader>
			<Alert>
				<Info aria-hidden="true" />
				<AlertTitle>Guarde a amostra por 72 horas</AlertTitle>
				<AlertDescription>A amostra coletada deste lote fica guardada por 72 horas. A hora da coleta vira a data de fabricação nas etiquetas.</AlertDescription>
			</Alert>
			<FieldGroup>
				<Field data-invalid={submitted && !iso}>
					<FieldLabel htmlFor="snack-sample-at">Coleta da amostra (hora de Brasília)</FieldLabel>
					<Input
						id="snack-sample-at"
						type="datetime-local"
						value={collectedAt}
						onChange={(e) => setCollectedAt(e.target.value)}
						aria-invalid={submitted && !iso}
						className="font-mono tabular-nums"
					/>
					{submitted && !iso && <FieldError>Informe data e hora da coleta.</FieldError>}
				</Field>
				<Field>
					<FieldLabel htmlFor="snack-sample-notes">Observação (opcional)</FieldLabel>
					<Textarea id="snack-sample-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
				</Field>
			</FieldGroup>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Voltar
				</Button>
				<Button type="submit" disabled={advance.isPending}>
					Marcar pronto
				</Button>
			</DialogFooter>
		</form>
	)
}

// ── Retirada e cautela ─────────────────────────────────────────────────────

type MaterialRow = { key: number; item: MaterialItem | null; description: string; quantity: string }

function PickupForm({ request, onDone }: FormProps) {
	const pickup = useRegisterSnackPickup()
	const [name, setName] = useState(request.pickup_responsible)
	const [rows, setRows] = useState<MaterialRow[]>([])
	const [nextKey, setNextKey] = useState(1)
	const [submitted, setSubmitted] = useState(false)

	const nameInvalid = name.trim() === ""
	const rowErrors = new Map<number, string>()
	for (const row of rows) {
		const q = parseCount(row.quantity)
		if (!row.item) rowErrors.set(row.key, "Escolha o item.")
		else if (row.item === "outro" && row.description.trim() === "") rowErrors.set(row.key, "Descreva o item.")
		else if (q == null || q < 1) rowErrors.set(row.key, "Quantidade mínima 1.")
	}

	const addRow = () => {
		setRows((r) => [...r, { key: nextKey, item: null, description: "", quantity: "1" }])
		setNextKey((k) => k + 1)
	}
	const updateRow = (key: number, patch: Partial<MaterialRow>) => setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)))

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setSubmitted(true)
		if (nameInvalid || rowErrors.size > 0) return
		pickup.mutate(
			{
				requestId: request.id,
				pickedUpByName: name.trim(),
				materials: rows.map((row) => ({
					item: row.item as MaterialItem,
					description: row.description.trim() || undefined,
					quantity: parseCount(row.quantity) ?? 1,
				})),
			},
			{ onSuccess: onDone }
		)
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			<DialogHeader>
				<DialogTitle>Registrar retirada</DialogTitle>
				<DialogDescription>Registre quem retirou e o material de apoio que sai cautelado — ele tem que voltar para o pedido ser encerrado.</DialogDescription>
			</DialogHeader>
			<FieldGroup>
				<Field data-invalid={submitted && nameInvalid}>
					<FieldLabel htmlFor="snack-picked-up-by">Retirado por</FieldLabel>
					<Input id="snack-picked-up-by" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} aria-invalid={submitted && nameInvalid} />
					<FieldDescription>Responsável indicado no pedido: {request.pickup_responsible}.</FieldDescription>
					{submitted && nameInvalid && <FieldError>Informe o nome de quem retirou.</FieldError>}
				</Field>

				<div className="grid gap-2">
					<div className="flex items-center justify-between gap-2">
						<p className="text-subheading text-foreground">Material cautelado</p>
						<Button type="button" size="sm" variant="outline" onClick={addRow} disabled={rows.length >= 20}>
							<Plus className="size-4 mr-1.5" aria-hidden="true" />
							Adicionar item
						</Button>
					</div>
					{rows.length === 0 ? (
						<p className="text-hint text-muted-foreground">
							Nenhum material cautelado. Adicione garrafa térmica, caixa térmica, hotbox ou cooler se saírem com o lanche.
						</p>
					) : (
						rows.map((row) => {
							const error = submitted ? rowErrors.get(row.key) : undefined
							return (
								<div key={row.key} className="grid gap-1">
									<div className="grid grid-cols-[10rem_1fr_5rem_auto] items-center gap-2">
										<Select value={row.item ?? null} onValueChange={(value) => updateRow(row.key, { item: value as MaterialItem })}>
											<SelectTrigger className="w-full" aria-label="Item">
												<SelectValue>{row.item ? MATERIAL_ITEM_LABELS[row.item] : "Item"}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{MATERIAL_ITEMS.map((item) => (
													<SelectItem key={item} value={item}>
														{MATERIAL_ITEM_LABELS[item]}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Input
											aria-label="Descrição"
											placeholder={row.item === "outro" ? "Descrição (obrigatória)" : "Descrição (opcional)"}
											value={row.description}
											maxLength={160}
											onChange={(e) => updateRow(row.key, { description: e.target.value })}
										/>
										<Input
											aria-label="Quantidade"
											type="number"
											min="1"
											max="999"
											step="1"
											value={row.quantity}
											onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
											className="font-mono tabular-nums text-right"
										/>
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											aria-label="Remover item"
											onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
										>
											<Trash2 aria-hidden="true" />
										</Button>
									</div>
									{error && <p className="text-hint text-destructive">{error}</p>}
								</div>
							)
						})
					)}
				</div>
			</FieldGroup>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Voltar
				</Button>
				<Button type="submit" disabled={pickup.isPending}>
					Registrar retirada
				</Button>
			</DialogFooter>
		</form>
	)
}

// ── Devolução ──────────────────────────────────────────────────────────────

function ReturnForm({ request, onDone }: FormProps) {
	const registerReturn = useRegisterSnackMaterialReturn()
	const pending = request.materials.filter((m) => m.returned_quantity < m.quantity)
	const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(pending.map((m) => [m.id, String(m.quantity)])))
	const [submitted, setSubmitted] = useState(false)

	const errors = new Map<string, string>()
	for (const m of pending) {
		const q = parseCount(values[m.id] ?? "")
		if (q == null) errors.set(m.id, "Quantidade inválida.")
		else if (q > m.quantity) errors.set(m.id, `No máximo ${m.quantity} (o cautelado).`)
		else if (q < m.returned_quantity) errors.set(m.id, `Já foram devolvidos ${m.returned_quantity}.`)
	}

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setSubmitted(true)
		if (errors.size > 0 || pending.length === 0) return
		registerReturn.mutate(
			{ requestId: request.id, returns: pending.map((m) => ({ materialId: m.id, returnedQuantity: parseCount(values[m.id] ?? "") ?? 0 })) },
			{ onSuccess: onDone }
		)
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			<DialogHeader>
				<DialogTitle>Registrar devolução de material</DialogTitle>
				<DialogDescription>Informe o total devolvido de cada item até agora. Devolução parcial mantém o pedido com material pendente.</DialogDescription>
			</DialogHeader>
			<div className="grid gap-2">
				{pending.map((m) => {
					const error = submitted ? errors.get(m.id) : undefined
					return (
						<div key={m.id} className="grid grid-cols-[1fr_6rem] items-center gap-3 rounded-lg border px-3 py-2">
							<div className="min-w-0">
								<label htmlFor={`snack-return-${m.id}`} className="text-body text-foreground">
									{MATERIAL_ITEM_LABELS[m.item] ?? m.item}
									{m.description ? ` — ${m.description}` : ""}
								</label>
								<p className="text-caption text-muted-foreground">
									Cautelado <span className="font-mono tabular-nums">{m.quantity}</span> · já devolvido{" "}
									<span className="font-mono tabular-nums">{m.returned_quantity}</span>
								</p>
								{error && <p className="text-hint text-destructive">{error}</p>}
							</div>
							<Input
								id={`snack-return-${m.id}`}
								type="number"
								min={m.returned_quantity}
								max={m.quantity}
								step="1"
								value={values[m.id] ?? ""}
								onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
								aria-invalid={!!error}
								className="font-mono tabular-nums text-right"
							/>
						</div>
					)
				})}
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Voltar
				</Button>
				<Button type="submit" disabled={registerReturn.isPending}>
					Registrar devolução
				</Button>
			</DialogFooter>
		</form>
	)
}

// ── Cancelar ───────────────────────────────────────────────────────────────

function CancelForm({ request, onDone }: FormProps) {
	const cancel = useCancelKitchenSnackRequest()
	const [reason, setReason] = useState("")
	const [submitted, setSubmitted] = useState(false)
	const invalid = reason.trim() === ""
	const discardsFood = cancelDiscardsFood(asStatus(request.status))

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault()
		setSubmitted(true)
		if (invalid) return
		cancel.mutate({ requestId: request.id, reason: reason.trim() }, { onSuccess: onDone })
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-4">
			<DialogHeader>
				<DialogTitle>Cancelar pedido</DialogTitle>
				<DialogDescription>
					{asStatus(request.status) === "accepted"
						? "Os itens deste pedido saem do quadro de produção."
						: "O cancelamento fica registrado no histórico do pedido."}
				</DialogDescription>
			</DialogHeader>
			{discardsFood && (
				<Alert variant="destructive">
					<AlertTriangle aria-hidden="true" />
					<AlertTitle>A comida produzida não é reaproveitada</AlertTitle>
					<AlertDescription>
						Lanche perecível que volta de missão cancelada é descartado. O material de apoio que saiu do rancho tem que voltar — o pedido fica com devolução
						pendente.
					</AlertDescription>
				</Alert>
			)}
			<Field data-invalid={submitted && invalid}>
				<FieldLabel htmlFor="snack-cancel-reason">Motivo</FieldLabel>
				<Textarea
					id="snack-cancel-reason"
					value={reason}
					maxLength={500}
					onChange={(e) => setReason(e.target.value)}
					aria-invalid={submitted && invalid}
					autoFocus
				/>
				{submitted && invalid && <FieldError>Informe o motivo do cancelamento.</FieldError>}
			</Field>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onDone}>
					Voltar
				</Button>
				<Button type="submit" variant="destructive" disabled={cancel.isPending}>
					Cancelar pedido
				</Button>
			</DialogFooter>
		</form>
	)
}
