import { EMPENHO_TYPES, type EmpenhoType } from "@iefa/sisub-domain"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { type CreateEmpenhoWithItemsInput, useCreateEmpenhoWithItems, useUnitArps } from "@/hooks/data/useAcquisitions"
import { BRL, normalizeDocument, parseMoneyInput, todayInBrasilia } from "@/lib/expense-execution"

const TIPO_LABEL: Record<EmpenhoType, string> = { ordinario: "Ordinário", estimativo: "Estimativo", global: "Global" }

type Mode = "arp" | "items" | "value"

interface FreeItem {
	key: number
	description: string
	quantity: string
	unit: string
	unitPrice: string
}

/** Número digitado em pt-BR ("1.234,56"); inválido ou vazio vira `null`. */
const toNumber = (value: string): number | null => {
	const parsed = parseMoneyInput(value)
	return parsed.ok ? parsed.value : null
}

const cents = (value: number) => Math.round(value * 100) / 100

export interface EmpenhoOrigin {
	acquisitionId: string | null
	kind: string | null
	supplierCnpj: string | null
	supplierName: string | null
	nd: string | null
	/** ARP de partida (NE a partir da ARP). */
	arpId?: string | null
}

/**
 * Registrar a NE com itens a partir da contratação de origem (com ou sem ARP) ou da ARP. Três
 * jeitos, do tamanho do fato: itens da ata (uma NE para arroz, feijão e óleo), itens livres
 * (dispensa, contrato), ou só o valor (NE estimativa ou global). A conferência com a ata (preço,
 * saldo, vigência) volta como aviso: a NE já existe no SIAFI.
 */
export function EmpenhoFromOriginDialog({ unitId, origin, onClose }: { unitId: number; origin: EmpenhoOrigin; onClose: () => void }) {
	const arpsQuery = useUnitArps(unitId, origin.arpId ? null : origin.acquisitionId)
	const arps = (arpsQuery.data ?? []).filter((arp) => !origin.arpId || arp.id === origin.arpId)
	const hasArps = arps.length > 0
	const create = useCreateEmpenhoWithItems(unitId)

	const [mode, setMode] = useState<Mode>(origin.arpId || origin.kind === "registro_precos" ? "arp" : "items")
	const [numero, setNumero] = useState("")
	const [data, setData] = useState(todayInBrasilia())
	const [tipo, setTipo] = useState<EmpenhoType>("ordinario")
	const [cnpj, setCnpj] = useState(origin.supplierCnpj ?? "")
	const [favorecido, setFavorecido] = useState(origin.supplierName ?? "")
	const [nd, setNd] = useState(origin.nd ?? "")
	const [ptres, setPtres] = useState("")
	const [fonte, setFonte] = useState("")
	const [arpQty, setArpQty] = useState<Record<string, string>>({})
	const [arpPrice, setArpPrice] = useState<Record<string, string>>({})
	const [freeItems, setFreeItems] = useState<FreeItem[]>([{ key: 1, description: "", quantity: "", unit: "", unitPrice: "" }])
	const [totalValue, setTotalValue] = useState("")

	const arpItems = arps.flatMap((arp) => arp.items.map((item) => ({ ...item, arpNumero: arp.numeroAta })))
	const items: CreateEmpenhoWithItemsInput["items"] =
		mode === "arp"
			? arpItems.flatMap((item) => {
					const quantity = toNumber(arpQty[item.id] ?? "")
					if (quantity == null || quantity <= 0) return []
					const unitPrice = toNumber(arpPrice[item.id] ?? "") ?? item.valorUnitario ?? 0
					return [
						{
							arpItemId: item.id,
							description: item.descricaoItem,
							quantity,
							unit: item.medida,
							unitPrice,
							value: cents(quantity * unitPrice),
						},
					]
				})
			: mode === "items"
				? freeItems.flatMap((item) => {
						const quantity = toNumber(item.quantity)
						const unitPrice = toNumber(item.unitPrice)
						if (!item.description.trim() || quantity == null || unitPrice == null) return []
						return [{ description: item.description.trim(), quantity, unit: item.unit.trim() || null, unitPrice, value: cents(quantity * unitPrice) }]
					})
				: (toNumber(totalValue) ?? 0) > 0
					? [{ description: null, value: cents(toNumber(totalValue) ?? 0) }]
					: []
	const total = cents(items.reduce((sum, item) => sum + item.value, 0))
	const cnpjInvalid = cnpj.trim() !== "" && normalizeDocument(cnpj) == null
	const canSubmit = numero.trim() !== "" && items.length > 0 && !cnpjInvalid && !create.isPending

	function submit() {
		if (!canSubmit) return
		create.mutate(
			{
				unitId,
				numeroEmpenho: numero,
				dataEmpenho: data,
				tipo: mode === "value" && tipo === "ordinario" ? "estimativo" : tipo,
				acquisitionId: origin.acquisitionId,
				favorecidoCnpj: normalizeDocument(cnpj),
				favorecidoNome: favorecido.trim() || null,
				nd: /^\d{6,8}$/.test(nd) ? nd : null,
				ptres: ptres.trim() || null,
				fonte: fonte.trim() || null,
				items,
			},
			{
				onSuccess: (result) => {
					for (const warning of result.warnings) toast.warning(warning.message)
					onClose()
				},
			}
		)
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Registrar nota de empenho</DialogTitle>
					<DialogDescription>
						A NE como está no SIAFI: número, data e os itens que ela cobre. Preço diferente do registrado, quantidade acima do saldo e data fora da vigência da
						ata viram aviso, não recusa.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<div className="grid gap-4 sm:grid-cols-3">
						<Field>
							<FieldLabel htmlFor="ne-numero">Número da NE</FieldLabel>
							<Input id="ne-numero" value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="2026NE000123" autoFocus />
						</Field>
						<Field>
							<FieldLabel htmlFor="ne-data">Data</FieldLabel>
							<Input id="ne-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
						</Field>
						<Field>
							<FieldLabel htmlFor="ne-tipo">Tipo</FieldLabel>
							<Select value={tipo} onValueChange={(next) => next && setTipo(next as EmpenhoType)}>
								<SelectTrigger id="ne-tipo" className="w-full">
									<SelectValue>{TIPO_LABEL[tipo]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{EMPENHO_TYPES.map((value) => (
										<SelectItem key={value} value={value}>
											{TIPO_LABEL[value]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field data-invalid={cnpjInvalid || undefined}>
							<FieldLabel htmlFor="ne-cnpj">CNPJ do favorecido</FieldLabel>
							<Input id="ne-cnpj" inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} aria-invalid={cnpjInvalid || undefined} />
							<FieldDescription>Vazio: usa o fornecedor da contratação ou dos itens da ata.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="ne-favorecido">Favorecido</FieldLabel>
							<Input id="ne-favorecido" value={favorecido} onChange={(e) => setFavorecido(e.target.value)} />
						</Field>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						<Field>
							<FieldLabel htmlFor="ne-nd">ND</FieldLabel>
							<Input id="ne-nd" inputMode="numeric" value={nd} onChange={(e) => setNd(e.target.value.replace(/\D/g, ""))} placeholder="33903007" />
						</Field>
						<Field>
							<FieldLabel htmlFor="ne-ptres">PTRES</FieldLabel>
							<Input id="ne-ptres" value={ptres} onChange={(e) => setPtres(e.target.value)} placeholder="Opcional" />
						</Field>
						<Field>
							<FieldLabel htmlFor="ne-fonte">Fonte</FieldLabel>
							<Input id="ne-fonte" value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder="Opcional" />
						</Field>
					</div>

					<Field>
						<FieldLabel>O que a NE cobre</FieldLabel>
						<ToggleGroup value={[mode]} onValueChange={(value) => setMode((value[0] as Mode) ?? mode)} variant="outline" size="sm" aria-label="Itens da NE">
							<ToggleGroupItem value="arp" aria-label="Itens da ata" disabled={!hasArps}>
								Itens da ata
							</ToggleGroupItem>
							<ToggleGroupItem value="items" aria-label="Itens livres">
								Itens
							</ToggleGroupItem>
							<ToggleGroupItem value="value" aria-label="Só o valor">
								Só o valor
							</ToggleGroupItem>
						</ToggleGroup>
						{!hasArps && !arpsQuery.isLoading && (
							<FieldDescription>Sem ARP nesta contratação: importe ou cadastre a ARP para empenhar pelos itens da ata.</FieldDescription>
						)}
						{arpsQuery.isError && <FieldDescription>Não foi possível ler as ARPs.</FieldDescription>}
					</Field>
				</FieldGroup>

				{mode === "arp" && hasArps && (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-20">Item</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead className="w-28 text-right">Saldo oficial</TableHead>
									<TableHead className="w-28 text-right">Já empenhado</TableHead>
									<TableHead className="w-28">Preço</TableHead>
									<TableHead className="w-28">Quantidade</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{arpItems.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="tabular-nums">
											{arps.length > 1 ? `${item.arpNumero} · ` : ""}
											{item.numeroItem ?? "—"}
										</TableCell>
										<TableCell>
											{item.descricaoItem ?? "—"}
											{item.nomeFornecedor && <span className="block text-caption text-muted-foreground">{item.nomeFornecedor}</span>}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{item.saldoOficial.toLocaleString("pt-BR")} {item.medida ?? ""}
										</TableCell>
										<TableCell className="text-right tabular-nums">{item.localCommitted.toLocaleString("pt-BR")}</TableCell>
										<TableCell>
											<Input
												aria-label="Preço unitário"
												inputMode="decimal"
												value={arpPrice[item.id] ?? (item.valorUnitario != null ? String(item.valorUnitario) : "")}
												onChange={(e) => setArpPrice((current) => ({ ...current, [item.id]: e.target.value }))}
											/>
										</TableCell>
										<TableCell>
											<Input
												aria-label="Quantidade empenhada"
												inputMode="decimal"
												value={arpQty[item.id] ?? ""}
												onChange={(e) => setArpQty((current) => ({ ...current, [item.id]: e.target.value }))}
											/>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				{mode === "items" && (
					<div className="space-y-2">
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Descrição</TableHead>
										<TableHead className="w-28">Quantidade</TableHead>
										<TableHead className="w-20">Unid.</TableHead>
										<TableHead className="w-28">Preço</TableHead>
										<TableHead className="w-10" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{freeItems.map((item) => (
										<TableRow key={item.key}>
											<TableCell>
												<Input
													aria-label="Descrição"
													value={item.description}
													onChange={(e) => setFreeItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, description: e.target.value } : row)))}
												/>
											</TableCell>
											<TableCell>
												<Input
													aria-label="Quantidade"
													inputMode="decimal"
													value={item.quantity}
													onChange={(e) => setFreeItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, quantity: e.target.value } : row)))}
												/>
											</TableCell>
											<TableCell>
												<Input
													aria-label="Unidade"
													value={item.unit}
													onChange={(e) => setFreeItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, unit: e.target.value } : row)))}
												/>
											</TableCell>
											<TableCell>
												<Input
													aria-label="Preço unitário"
													inputMode="decimal"
													value={item.unitPrice}
													onChange={(e) => setFreeItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, unitPrice: e.target.value } : row)))}
												/>
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Remover item"
													disabled={freeItems.length === 1}
													onClick={() => setFreeItems((rows) => rows.filter((row) => row.key !== item.key))}
												>
													<Trash2 className="size-4" aria-hidden="true" />
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setFreeItems((rows) => [...rows, { key: Math.max(...rows.map((row) => row.key)) + 1, description: "", quantity: "", unit: "", unitPrice: "" }])
							}
						>
							<Plus className="size-4" aria-hidden="true" />
							Adicionar item
						</Button>
					</div>
				)}

				{mode === "value" && (
					<Field>
						<FieldLabel htmlFor="ne-total">Valor da NE (R$)</FieldLabel>
						<Input id="ne-total" inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} placeholder="0,00" />
						<FieldDescription>NE estimativa ou global: só o valor. A OF é conferida pelo valor vigente.</FieldDescription>
					</Field>
				)}

				<DialogFooter className="items-center">
					<span className="mr-auto text-caption text-muted-foreground">
						{items.length} item(ns) · total <span className="text-foreground tabular-nums">{BRL.format(total)}</span>
					</span>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={submit} disabled={!canSubmit}>
						{create.isPending ? "Registrando…" : "Registrar NE"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
