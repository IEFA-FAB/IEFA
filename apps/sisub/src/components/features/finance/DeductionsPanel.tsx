import { DEDUCTION_DOCUMENT_KINDS, DEDUCTION_KINDS, DEDUCTION_LABELS, type DeductionDocumentKind, type DeductionKind } from "@iefa/sisub-domain/operations"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useAssuredAction } from "@/hooks/auth/useAssuredAction"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { addLiquidacaoDeductionFn, deleteLiquidacaoDeductionFn, type LiquidacaoDeductionRow, registerDeductionRemittanceFn } from "@/server/liquidacao.fn"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export const DOCUMENT_LABELS: Record<DeductionDocumentKind, string> = { darf: "DARF", dar: "DAR", gps: "GPS", outro: "Outro" }

function today(): string {
	return new Date().toISOString().substring(0, 10)
}

/** Registrar o recolhimento de uma retenção: o documento e a data em que foi pago. */
export function DeductionRemittanceForm({ unitId, deduction, onDone }: { unitId: number; deduction: LiquidacaoDeductionRow; onDone: () => void }) {
	const [documentKind, setDocumentKind] = useState<DeductionDocumentKind>(
		deduction.document_kind ?? (deduction.kind === "inss" ? "gps" : deduction.kind === "iss" ? "dar" : "darf")
	)
	const [documentNumber, setDocumentNumber] = useState(deduction.document_number ?? "")
	const [paidOn, setPaidOn] = useState(today())
	const [busy, setBusy] = useState(false)
	const runAssured = useAssuredAction()

	async function submit(event: React.SyntheticEvent) {
		event.preventDefault()
		if (!documentNumber.trim()) return
		setBusy(true)
		try {
			await runAssured(() => registerDeductionRemittanceFn({ data: { unitId, deductionId: deduction.id, documentKind, documentNumber, paidOn } }))
			toast.success(`Recolhimento de ${DEDUCTION_LABELS[deduction.kind]} registrado`)
			onDone()
		} catch (err) {
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao registrar o recolhimento")
		} finally {
			setBusy(false)
		}
	}

	return (
		<form onSubmit={submit} className="flex flex-wrap items-end gap-2">
			<Field className="w-28">
				<FieldLabel htmlFor={`doc-kind-${deduction.id}`}>Documento</FieldLabel>
				<Select value={documentKind} onValueChange={(value) => value && setDocumentKind(value as DeductionDocumentKind)}>
					<SelectTrigger id={`doc-kind-${deduction.id}`}>
						<SelectValue>{DOCUMENT_LABELS[documentKind]}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{DEDUCTION_DOCUMENT_KINDS.map((kind) => (
							<SelectItem key={kind} value={kind}>
								{DOCUMENT_LABELS[kind]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Field className="w-44">
				<FieldLabel htmlFor={`doc-number-${deduction.id}`}>Número</FieldLabel>
				<Input id={`doc-number-${deduction.id}`} value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value.toUpperCase())} required />
			</Field>
			<Field className="w-40">
				<FieldLabel htmlFor={`doc-date-${deduction.id}`}>Pago em</FieldLabel>
				<Input id={`doc-date-${deduction.id}`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
			</Field>
			<Button type="submit" size="sm" disabled={busy || !documentNumber.trim()}>
				{busy ? <Spinner className="size-3.5" /> : "Registrar recolhimento"}
			</Button>
		</form>
	)
}

/**
 * Retenções da NS (IR, CSLL, COFINS, PIS/PASEP, INSS, ISS). Com elas, a OB paga o líquido e a
 * retenção fica “a recolher” até o DARF/DAR/GPS ser registrado.
 */
export function DeductionsPanel({
	unitId,
	liquidacaoId,
	bruto,
	deductions,
	onChanged,
}: {
	unitId: number
	liquidacaoId: string
	bruto: number
	deductions: LiquidacaoDeductionRow[]
	onChanged: () => void
}) {
	const [kind, setKind] = useState<DeductionKind>("ir")
	const [amount, setAmount] = useState("")
	const [rate, setRate] = useState("")
	const [revenueCode, setRevenueCode] = useState("")
	const [busy, setBusy] = useState(false)
	const [payingId, setPayingId] = useState<string | null>(null)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	const runAssured = useAssuredAction()

	function applyRate(value: string) {
		setRate(value)
		const pct = Number(value.replace(",", "."))
		if (pct > 0) setAmount((Math.round(bruto * pct) / 100).toFixed(2))
	}

	async function add(event: React.SyntheticEvent) {
		event.preventDefault()
		const value = Number(amount)
		if (!(value > 0)) return
		setBusy(true)
		try {
			await runAssured(() => addLiquidacaoDeductionFn({ data: { unitId, liquidacaoId, kind, amount: value, revenueCode } }))
			toast.success(`Retenção de ${DEDUCTION_LABELS[kind]} registrada — a OB passa a pagar o líquido`)
			setAmount("")
			setRate("")
			setRevenueCode("")
			onChanged()
		} catch (err) {
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao registrar a retenção")
		} finally {
			setBusy(false)
		}
	}

	async function remove(deduction: LiquidacaoDeductionRow) {
		setDeletingId(deduction.id)
		try {
			await runAssured(() => deleteLiquidacaoDeductionFn({ data: { unitId, deductionId: deduction.id } }))
			toast.success("Retenção apagada")
			onChanged()
		} catch (err) {
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao apagar a retenção")
		} finally {
			setDeletingId(null)
		}
	}

	return (
		<div className="space-y-4 py-2">
			{deductions.length > 0 && (
				<ItemGroup>
					{deductions.map((deduction) => (
						<Item key={deduction.id} variant="outline" size="sm" className="flex-wrap">
							<ItemContent>
								<ItemTitle>
									{DEDUCTION_LABELS[deduction.kind]} · {BRL.format(deduction.amount)}
									{deduction.paid_on ? <Badge variant="success">recolhida</Badge> : <Badge variant="warning">a recolher</Badge>}
								</ItemTitle>
								<ItemDescription>
									{deduction.paid_on
										? `${DOCUMENT_LABELS[deduction.document_kind ?? "outro"]} ${deduction.document_number ?? ""} pago em ${deduction.paid_on}`
										: "Retida na NS; registre o DARF/DAR/GPS quando for pago."}
									{deduction.revenue_code ? ` · código de receita ${deduction.revenue_code}` : ""}
								</ItemDescription>
							</ItemContent>
							{!deduction.paid_on && (
								<ItemActions>
									<Button size="sm" variant="outline" onClick={() => setPayingId(payingId === deduction.id ? null : deduction.id)}>
										{payingId === deduction.id ? "Fechar" : "Registrar recolhimento"}
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label="Apagar a retenção"
										disabled={deletingId === deduction.id}
										onClick={() => remove(deduction)}
									>
										{deletingId === deduction.id ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
									</Button>
								</ItemActions>
							)}
							{payingId === deduction.id && (
								<div className="basis-full pt-2">
									<DeductionRemittanceForm
										unitId={unitId}
										deduction={deduction}
										onDone={() => {
											setPayingId(null)
											onChanged()
										}}
									/>
								</div>
							)}
						</Item>
					))}
				</ItemGroup>
			)}

			<form onSubmit={add}>
				<FieldGroup className="grid sm:grid-cols-5 items-end">
					<Field>
						<FieldLabel htmlFor={`ded-kind-${liquidacaoId}`}>Retenção</FieldLabel>
						<Select value={kind} onValueChange={(value) => value && setKind(value as DeductionKind)}>
							<SelectTrigger id={`ded-kind-${liquidacaoId}`}>
								<SelectValue>{DEDUCTION_LABELS[kind]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{DEDUCTION_KINDS.map((value) => (
									<SelectItem key={value} value={value}>
										{DEDUCTION_LABELS[value]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field>
						<FieldLabel htmlFor={`ded-rate-${liquidacaoId}`}>Alíquota (%)</FieldLabel>
						<Input id={`ded-rate-${liquidacaoId}`} inputMode="decimal" value={rate} onChange={(e) => applyRate(e.target.value)} placeholder="5,85" />
						<FieldDescription>Opcional: calcula o valor sobre o bruto.</FieldDescription>
					</Field>
					<Field>
						<FieldLabel htmlFor={`ded-amount-${liquidacaoId}`}>Valor (R$) *</FieldLabel>
						<Input id={`ded-amount-${liquidacaoId}`} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
					</Field>
					<Field>
						<FieldLabel htmlFor={`ded-code-${liquidacaoId}`}>Código de receita</FieldLabel>
						<Input id={`ded-code-${liquidacaoId}`} value={revenueCode} onChange={(e) => setRevenueCode(e.target.value)} />
					</Field>
					<Button type="submit" size="sm" disabled={busy || !(Number(amount) > 0)}>
						{busy ? <Spinner className="size-3.5" /> : "Registrar retenção"}
					</Button>
				</FieldGroup>
			</form>
		</div>
	)
}
