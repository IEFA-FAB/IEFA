import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Boxes, MoveRight } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { type LotView, listLocationLotsFn, listPositionsFn, moveToPositionFn } from "@/server/addressing.fn"
import { OptionCombobox } from "./OptionCombobox"

function formatQuantity(value: number, unit: string | null) {
	return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`
}

/**
 * Lotes com saldo no local e onde estão. Lote sem posição num local endereçado está pendente
 * de endereçamento (recebido ou transferido e ainda não guardado). Guardar e mover gravam o log
 * de movimentação; saldo e custo não mudam.
 */
export function LotsPanel({ locationId, canOperate }: { locationId: number; canOperate: boolean }) {
	const qc = useQueryClient()
	const [pendingOnly, setPendingOnly] = useState(false)
	const lots = useQuery({
		queryKey: ["sisprov", "locationLots", locationId, pendingOnly],
		queryFn: () => listLocationLotsFn({ data: { locationId, pendingOnly } }),
	})
	const positions = useQuery({ queryKey: ["sisprov", "positions", locationId], queryFn: () => listPositionsFn({ data: { locationId } }), enabled: canOperate })
	const storageOptions = (positions.data ?? []).filter((p) => p.holdsStock).map((p) => ({ id: String(p.id), label: p.address }))

	const [moving, setMoving] = useState<LotView | null>(null)
	const [target, setTarget] = useState<string | null>(null)

	const move = useMutation({
		mutationFn: (lot: LotView) =>
			moveToPositionFn({ data: { locationId, lotId: lot.lotId, handlingUnitId: null, toPositionId: Number(target), toPalletId: null, reason: null } }),
		onSuccess: () => {
			toast.success("Lote guardado")
			setMoving(null)
			setTarget(null)
			qc.invalidateQueries({ queryKey: ["sisprov", "locationLots", locationId] })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao mover"),
	})

	return (
		<div className="space-y-4">
			<Field orientation="horizontal">
				<Switch id="lots-pending" checked={pendingOnly} onCheckedChange={setPendingOnly} />
				<FieldLabel htmlFor="lots-pending">Só os pendentes de endereçamento</FieldLabel>
			</Field>

			{lots.isPending ? (
				<Skeleton className="h-32 w-full" />
			) : lots.isError ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível ler os lotes</AlertTitle>
					<AlertDescription>{lots.error instanceof Error ? lots.error.message : "Tente de novo."}</AlertDescription>
				</Alert>
			) : lots.data.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Boxes />
						</EmptyMedia>
						<EmptyTitle>{pendingOnly ? "Nenhum lote esperando endereçamento" : "Nenhum lote com saldo neste local"}</EmptyTitle>
						<EmptyDescription>O lote entra pelo recebimento ou pela transferência e aparece aqui para ser guardado.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ItemGroup>
					{lots.data.map((lot) => (
						<Item key={lot.lotId} variant="outline" size="sm">
							<ItemContent>
								<ItemTitle>
									{lot.description}
									{lot.quarantined && <Badge variant="warning">Quarentena</Badge>}
								</ItemTitle>
								<ItemDescription>
									Lote {lot.lotCode}
									{lot.expiryDate ? ` · vence ${new Date(`${lot.expiryDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""} ·{" "}
									{formatQuantity(lot.balance, lot.measureUnit)} ·{" "}
									{lot.address ? <span className="font-mono">{lot.address}</span> : <span className="text-warning">pendente de endereçamento</span>}
								</ItemDescription>
								{moving?.lotId === lot.lotId && (
									<div className="mt-2 flex flex-wrap items-center gap-2">
										<div className="min-w-64">
											<OptionCombobox
												value={target}
												onChange={setTarget}
												options={storageOptions.filter((option) => Number(option.id) !== lot.positionId)}
												placeholder="Escolha a prateleira ou escaninho"
												searchPlaceholder="Pesquisar endereço..."
											/>
										</div>
										<Button size="sm" onClick={() => move.mutate(lot)} disabled={!target || move.isPending}>
											Confirmar
										</Button>
										<Button size="sm" variant="ghost" onClick={() => setMoving(null)}>
											Cancelar
										</Button>
									</div>
								)}
							</ItemContent>
							{canOperate && moving?.lotId !== lot.lotId && (
								<ItemActions>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setMoving(lot)
											setTarget(null)
										}}
									>
										<MoveRight className="size-4" />
										{lot.address ? "Mover" : "Guardar"}
									</Button>
								</ItemActions>
							)}
						</Item>
					))}
				</ItemGroup>
			)}
		</div>
	)
}
