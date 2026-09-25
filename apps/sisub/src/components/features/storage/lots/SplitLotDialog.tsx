import { useRouter } from "@tanstack/react-router"
import { Scissors } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { splitLotFn } from "@/server/adjustment.fn"
import { LotLabelSheet } from "./LotLabel"

/**
 * Abrir, fracionar ou descongelar um lote.
 *
 * O lote derivado ganha validade própria — a menor entre a do original e o
 * prazo do insumo para aquela manipulação — e uma etiqueta, que a RDC ANVISA
 * 216/2004 (item 4.8.6) exige no produto manipulado. A etiqueta é oferecida na
 * hora: etiqueta impressa "depois" é etiqueta que não existe.
 */

const DERIVATIONS = [
	{ value: "opened", label: "Aberto", hint: "embalagem aberta, prazo de consumo após abertura" },
	{ value: "portioned", label: "Fracionado", hint: "porcionado em outra embalagem" },
	{ value: "thawed", label: "Descongelado", hint: "prazo de consumo após descongelamento" },
] as const

interface SplitLotDialogProps {
	lot: { id: string; description: string; lotCode: string | null; balance: number; measureUnit: string | null; location: string | null }
	onClose: () => void
}

export function SplitLotDialog({ lot, onClose }: SplitLotDialogProps) {
	const router = useRouter()
	const [derivation, setDerivation] = useState<(typeof DERIVATIONS)[number]["value"]>("opened")
	const [quantity, setQuantity] = useState("")
	const [expiryDate, setExpiryDate] = useState("")
	const [location, setLocation] = useState(lot.location ?? "")
	const [busy, setBusy] = useState(false)
	const [created, setCreated] = useState<{ shortCode: string; expiryDate: string | null; quantity: number } | null>(null)

	async function submit() {
		const amount = Number(quantity.replace(",", "."))
		if (!Number.isFinite(amount) || amount <= 0) {
			toast.error("Informe a quantidade")
			return
		}
		if (amount > lot.balance) {
			toast.error(`Quantidade acima do saldo do lote (${lot.balance})`)
			return
		}
		setBusy(true)
		try {
			const result = await splitLotFn({
				data: { lotId: lot.id, quantity: amount, derivation, expiryDate: expiryDate || undefined, location: location.trim() || undefined },
			})
			setCreated({ shortCode: result.shortCode, expiryDate: result.expiryDate, quantity: amount })
			toast.success(`Lote ${result.shortCode} criado — imprima a etiqueta`)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao fracionar o lote")
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Scissors className="size-4" />
						Abrir, fracionar ou descongelar
					</DialogTitle>
					<DialogDescription>
						{lot.description} · lote {lot.lotCode ?? "—"} · saldo {lot.balance} {lot.measureUnit ?? ""}
					</DialogDescription>
				</DialogHeader>

				{created ? (
					<div className="space-y-3">
						<p className="text-sm">
							Lote derivado <strong>{created.shortCode}</strong> criado com validade {created.expiryDate ?? "não informada"}.
						</p>
						<div className="print:block">
							<LotLabelSheet
								width="58mm"
								lots={[
									{
										shortCode: created.shortCode,
										description: lot.description,
										lotCode: lot.lotCode,
										expiryDate: created.expiryDate,
										location: location.trim() || lot.location,
										derivation,
										quantity: created.quantity,
										measureUnit: lot.measureUnit,
									},
								]}
							/>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onClose}>
								Fechar
							</Button>
							<Button type="button" onClick={() => window.print()}>
								Imprimir etiqueta
							</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="space-y-3">
						<div className="space-y-1">
							<Label htmlFor="derivation">O que aconteceu com o produto</Label>
							<Select value={derivation} onValueChange={(value) => setDerivation((value ?? "opened") as typeof derivation)}>
								<SelectTrigger id="derivation">
									<SelectValue>{DERIVATIONS.find((item) => item.value === derivation)?.label}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{DERIVATIONS.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">{DERIVATIONS.find((item) => item.value === derivation)?.hint}</p>
						</div>
						<div className="space-y-1">
							<Label htmlFor="quantity">Quantidade {lot.measureUnit ? `(${lot.measureUnit})` : ""}</Label>
							<Input id="quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
						</div>
						<div className="space-y-1">
							<Label htmlFor="expiry">Validade do lote derivado</Label>
							<Input id="expiry" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
							<p className="text-xs text-muted-foreground">
								Em branco, o sistema calcula pelo prazo do insumo para esta manipulação (e nunca passa da validade original).
							</p>
						</div>
						<div className="space-y-1">
							<Label htmlFor="location">Local de armazenagem</Label>
							<Input id="location" value={location} maxLength={60} onChange={(event) => setLocation(event.target.value)} placeholder="ex.: Câmara 2" />
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onClose} disabled={busy}>
								Cancelar
							</Button>
							<Button type="button" onClick={submit} disabled={busy}>
								Criar lote derivado
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
