import { receiptWithoutInvoiceProblems } from "@iefa/sisub-domain"
import { useNavigate } from "@tanstack/react-router"
import { Plus, Trash2 } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { createReceiptWithoutInvoiceFn } from "@/server/receiving.fn"
import { type IngredientOption, IngredientSearchCombobox } from "./IngredientSearchCombobox"

type Source = "delivery_note" | "ad_hoc"

interface LineDraft {
	key: string
	ingredient: IngredientOption | null
	quantity: string
	unitCost: string
	lotCode: string
	expiryDate: string
}

const newLine = (): LineDraft => ({ key: crypto.randomUUID(), ingredient: null, quantity: "", unitCost: "", lotCode: "", expiryDate: "" })
const toNumber = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")))

/**
 * Entrega que chegou sem NF-e: o pão com a guia do dia, a remessa do depósito, a carne que veio
 * antes da nota. Registra o que chegou e segue para a conferência; a nota, a OF e o empenho se
 * vinculam depois, no próprio recebimento, sem refazer nada.
 */
export function ReceiptWithoutInvoiceDialog({ kitchenId, open, onOpenChange }: { kitchenId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
	const navigate = useNavigate()
	const ids = { number: useId(), supplier: useId(), document: useId(), expected: useId() }
	const [source, setSource] = useState<Source>("delivery_note")
	const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("")
	const [supplierName, setSupplierName] = useState("")
	const [supplierDocument, setSupplierDocument] = useState("")
	const [invoiceExpected, setInvoiceExpected] = useState(true)
	const [lines, setLines] = useState<LineDraft[]>([newLine()])
	const [submitted, setSubmitted] = useState(false)
	const [saving, setSaving] = useState(false)

	const filled = lines.filter((line) => line.ingredient != null)
	const payloadLines = filled.map((line) => ({
		ingredientId: (line.ingredient as IngredientOption).id,
		quantityBase: toNumber(line.quantity) ?? 0,
		unitCost: toNumber(line.unitCost),
		lotCode: line.lotCode.trim() || null,
		expiryDate: line.expiryDate || undefined,
	}))
	const problems = receiptWithoutInvoiceProblems({
		source,
		deliveryNoteNumber: deliveryNoteNumber.trim() || null,
		supplierDocument: supplierDocument.trim() || null,
		lines: payloadLines,
	})

	function update(key: string, patch: Partial<LineDraft>) {
		setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
	}

	function reset() {
		setSource("delivery_note")
		setDeliveryNoteNumber("")
		setSupplierName("")
		setSupplierDocument("")
		setInvoiceExpected(true)
		setLines([newLine()])
		setSubmitted(false)
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		setSubmitted(true)
		if (problems.length > 0) return
		setSaving(true)
		try {
			const result = await createReceiptWithoutInvoiceFn({
				data: {
					kitchenId,
					source,
					deliveryNoteNumber: deliveryNoteNumber.trim() || null,
					supplierName: supplierName.trim() || null,
					supplierDocument: supplierDocument.trim() || null,
					invoiceExpected,
					lines: payloadLines,
				},
			})
			for (const warning of result.warnings) toast.warning(warning)
			toast.success(
				`Entrega registrada com ${result.itemsCount} ${result.itemsCount === 1 ? "item" : "itens"}. Confira lotes e temperatura e vincule a nota quando ela chegar.`
			)
			reset()
			onOpenChange(false)
			navigate({ to: "/storage/$kitchenId/receiving/$receiptId", params: { kitchenId: String(kitchenId), receiptId: result.receiptId } })
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível registrar a entrega")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Registrar entrega sem NF-e</DialogTitle>
					<DialogDescription>
						O que chegou entra agora; a nota fiscal, a OF e o empenho se vinculam depois, no próprio recebimento. A NF-e semanal do pão fecha todas as entregas
						da semana.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} noValidate>
					<FieldGroup>
						<Field>
							<FieldLabel>Documento que veio com a entrega</FieldLabel>
							<ToggleGroup value={[source]} onValueChange={(value) => value[0] && setSource(value[0] as Source)} variant="outline" size="sm">
								<ToggleGroupItem value="delivery_note">Guia de remessa</ToggleGroupItem>
								<ToggleGroupItem value="ad_hoc">Nenhum documento</ToggleGroupItem>
							</ToggleGroup>
						</Field>

						<div className="grid gap-4 sm:grid-cols-3">
							{source === "delivery_note" && (
								<Field>
									<FieldLabel htmlFor={ids.number}>Número da guia</FieldLabel>
									<Input id={ids.number} value={deliveryNoteNumber} maxLength={60} onChange={(e) => setDeliveryNoteNumber(e.target.value)} />
								</Field>
							)}
							<Field>
								<FieldLabel htmlFor={ids.supplier}>Quem entregou</FieldLabel>
								<Input
									id={ids.supplier}
									value={supplierName}
									maxLength={200}
									placeholder="Padaria, depósito, outra OM"
									onChange={(e) => setSupplierName(e.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={ids.document}>CNPJ ou CPF (opcional)</FieldLabel>
								<Input id={ids.document} value={supplierDocument} maxLength={20} inputMode="numeric" onChange={(e) => setSupplierDocument(e.target.value)} />
								<FieldDescription>É por ele que a NF-e que chegar depois é sugerida.</FieldDescription>
							</Field>
						</div>

						<Field orientation="horizontal">
							<Switch id={ids.expected} checked={invoiceExpected} onCheckedChange={setInvoiceExpected} />
							<FieldLabel htmlFor={ids.expected}>Esta entrega terá NF-e</FieldLabel>
							<FieldDescription>Desligue para remessa de depósito ou apoio de outra OM: sem nota de fornecedor, não fica pendência de nota.</FieldDescription>
						</Field>

						<FieldSet>
							<FieldLegend variant="label">O que chegou</FieldLegend>
							<div className="space-y-3">
								{lines.map((line, index) => (
									<div key={line.key} className="grid items-end gap-2 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_7rem_9rem_auto]">
										<Field>
											<FieldLabel className="sm:sr-only">Insumo {index + 1}</FieldLabel>
											<IngredientSearchCombobox kitchenId={kitchenId} value={line.ingredient} onChange={(ingredient) => update(line.key, { ingredient })} />
										</Field>
										<Field>
											<FieldLabel className="sm:sr-only">Quantidade</FieldLabel>
											<Input
												inputMode="decimal"
												placeholder={line.ingredient?.measure_unit ? `qtd (${line.ingredient.measure_unit})` : "qtd"}
												aria-label="Quantidade recebida, na unidade do insumo"
												value={line.quantity}
												onChange={(e) => update(line.key, { quantity: e.target.value })}
											/>
										</Field>
										<Field>
											<FieldLabel className="sm:sr-only">Custo unitário</FieldLabel>
											<Input
												inputMode="decimal"
												placeholder="R$ / un."
												aria-label="Custo unitário (opcional)"
												value={line.unitCost}
												onChange={(e) => update(line.key, { unitCost: e.target.value })}
											/>
										</Field>
										<Field>
											<FieldLabel className="sm:sr-only">Lote</FieldLabel>
											<Input
												placeholder="lote"
												aria-label="Lote (opcional)"
												value={line.lotCode}
												maxLength={40}
												onChange={(e) => update(line.key, { lotCode: e.target.value })}
											/>
										</Field>
										<Field>
											<FieldLabel className="sm:sr-only">Validade</FieldLabel>
											<Input
												type="date"
												aria-label="Validade (opcional)"
												value={line.expiryDate}
												onChange={(e) => update(line.key, { expiryDate: e.target.value })}
											/>
										</Field>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											aria-label="Remover linha"
											disabled={lines.length === 1}
											onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
										>
											<Trash2 />
										</Button>
									</div>
								))}
								<Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])}>
									<Plus data-icon="inline-start" aria-hidden="true" />
									Outro item
								</Button>
							</div>
							<FieldDescription>Custo, lote e validade são opcionais: o custo vem da NF-e quando ela é vinculada antes da efetivação.</FieldDescription>
						</FieldSet>

						{submitted && problems.length > 0 && <FieldError errors={problems.map((message) => ({ message }))} />}
					</FieldGroup>
					<DialogFooter className="mt-4">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancelar
						</Button>
						<Button type="submit" disabled={saving}>
							{saving && <Spinner data-icon="inline-start" />}
							Registrar entrega
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
