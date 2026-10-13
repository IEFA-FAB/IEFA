import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { listLocationLotsFn } from "@/server/addressing.fn"
import { closePickingListFn, createPickingListFn, fetchPickingListFn, listPickingListsFn, type PickingListSummary } from "@/server/picking.fn"
import { OptionCombobox } from "./OptionCombobox"

const STATUS_LABEL: Record<PickingListSummary["status"], string> = { open: "Aberta", picked: "Separada", cancelled: "Cancelada" }

type DraftLine = { key: number; itemId: string | null; quantity: string }

/**
 * Listas de separação do local. O banco aloca FEFO entre os lotes alocáveis e ordena as linhas
 * pela ordem de separação das posições; o que falta aparece como falta, não some. A lista não
 * move estoque: a saída ou a transferência que ela atende é que move.
 */
export function PickingPanel({ locationId, canOperate }: { locationId: number; canOperate: boolean }) {
	const qc = useQueryClient()
	const lists = useQuery({ queryKey: ["sisprov", "pickingLists", locationId], queryFn: () => listPickingListsFn({ data: { locationId } }) })
	const [openId, setOpenId] = useState<string | null>(null)
	const detail = useQuery({
		queryKey: ["sisprov", "pickingList", openId],
		queryFn: () => fetchPickingListFn({ data: { locationId, listId: openId as string } }),
		enabled: openId !== null,
	})
	const lots = useQuery({
		queryKey: ["sisprov", "locationLots", locationId, false],
		queryFn: () => listLocationLotsFn({ data: { locationId, pendingOnly: false } }),
		enabled: canOperate,
	})
	// um item por linha da seleção, com o saldo somado dos lotes
	const itemOptions = useMemo(() => {
		const byItem = new Map<string, { label: string; balance: number; unit: string | null }>()
		for (const lot of lots.data ?? []) {
			const current = byItem.get(lot.itemId) ?? { label: lot.description, balance: 0, unit: lot.measureUnit }
			current.balance += lot.balance
			byItem.set(lot.itemId, current)
		}
		return [...byItem.entries()].map(([id, item]) => ({
			id,
			label: item.label,
			hint: `${item.balance.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${item.unit ? ` ${item.unit}` : ""} em estoque`,
		}))
	}, [lots.data])

	const [reference, setReference] = useState("")
	const [lines, setLines] = useState<DraftLine[]>([{ key: 1, itemId: null, quantity: "" }])
	const validLines = lines.filter((line) => line.itemId && Number(line.quantity.replace(",", ".")) > 0)

	const create = useMutation({
		mutationFn: () =>
			createPickingListFn({
				data: {
					locationId,
					reference: reference.trim() || null,
					lines: validLines.map((line) => ({ itemId: line.itemId as string, quantity: Number(line.quantity.replace(",", ".")) })),
				},
			}),
		onSuccess: ({ id }) => {
			toast.success("Lista de separação gerada")
			setLines([{ key: Date.now(), itemId: null, quantity: "" }])
			setReference("")
			setOpenId(id)
			qc.invalidateQueries({ queryKey: ["sisprov", "pickingLists", locationId] })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar a lista"),
	})

	const closeList = useMutation({
		mutationFn: (status: "picked" | "cancelled") => closePickingListFn({ data: { locationId, listId: openId as string, status } }),
		onSuccess: () => {
			toast.success("Lista fechada")
			qc.invalidateQueries({ queryKey: ["sisprov", "pickingLists", locationId] })
			qc.invalidateQueries({ queryKey: ["sisprov", "pickingList", openId] })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao fechar a lista"),
	})

	return (
		<div className="space-y-6">
			{lists.isPending ? (
				<Skeleton className="h-24 w-full" />
			) : lists.isError ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível ler as listas</AlertTitle>
					<AlertDescription>{lists.error instanceof Error ? lists.error.message : "Tente de novo."}</AlertDescription>
				</Alert>
			) : lists.data.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ClipboardList />
						</EmptyMedia>
						<EmptyTitle>Nenhuma lista de separação</EmptyTitle>
						<EmptyDescription>Gere uma lista a partir dos itens a separar; ela sai na ordem dos endereços.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ItemGroup>
					{lists.data.map((list) => (
						<Item
							key={list.id}
							variant={openId === list.id ? "muted" : "outline"}
							size="sm"
							render={<button type="button" onClick={() => setOpenId(openId === list.id ? null : list.id)} />}
						>
							<ItemContent>
								<ItemTitle>
									Lista {list.number}/{list.year}
									<Badge variant={list.status === "open" ? "secondary" : "outline"}>{STATUS_LABEL[list.status]}</Badge>
								</ItemTitle>
								<ItemDescription>
									{list.reference ?? "sem documento de referência"} · {new Date(list.createdAt).toLocaleString("pt-BR")}
								</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</ItemGroup>
			)}

			{openId &&
				(detail.isPending ? (
					<Skeleton className="h-24 w-full" />
				) : detail.isError ? (
					<Alert variant="destructive">
						<AlertTitle>Não foi possível abrir a lista</AlertTitle>
						<AlertDescription>{detail.error instanceof Error ? detail.error.message : "Tente de novo."}</AlertDescription>
					</Alert>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>
								Lista {detail.data.list.number}/{detail.data.list.year}
							</CardTitle>
							<CardDescription>Na ordem de separação dos endereços. As faltas vêm por último.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<ItemGroup>
								{detail.data.lines.map((line) => (
									<Item key={line.lineNumber} variant={line.shortage ? "muted" : "outline"} size="sm">
										<ItemContent>
											<ItemTitle>
												{line.lineNumber}. {line.description}
												{line.shortage && <Badge variant="warning">Falta</Badge>}
											</ItemTitle>
											<ItemDescription>
												{line.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
												{line.measureUnit ? ` ${line.measureUnit}` : ""}
												{line.shortage ? " sem estoque alocável" : ` · lote ${line.lotCode ?? "—"} · `}
												{!line.shortage && (line.address ? <span className="font-mono">{line.address}</span> : "sem endereço")}
											</ItemDescription>
										</ItemContent>
									</Item>
								))}
							</ItemGroup>
							{canOperate && detail.data.list.status === "open" && (
								<div className="flex gap-2">
									<Button onClick={() => closeList.mutate("picked")} disabled={closeList.isPending}>
										Marcar como separada
									</Button>
									<Button variant="outline" onClick={() => closeList.mutate("cancelled")} disabled={closeList.isPending}>
										Cancelar lista
									</Button>
								</div>
							)}
						</CardContent>
					</Card>
				))}

			{canOperate && (
				<Card>
					<CardHeader>
						<CardTitle>Nova lista de separação</CardTitle>
						<CardDescription>Os lotes saem por FEFO (vence antes, sai antes), fora de quarentena e dentro da validade.</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault()
								create.mutate()
							}}
						>
							<Field>
								<FieldLabel htmlFor="picking-reference">Documento que a separação atende (opcional)</FieldLabel>
								<Input id="picking-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="OF 12/2026" />
							</Field>
							{lines.map((line, index) => (
								<FieldGroup key={line.key} className="sm:grid sm:grid-cols-[1fr_10rem_auto] sm:items-end">
									<Field>
										<FieldLabel>Item {index + 1}</FieldLabel>
										<OptionCombobox
											value={line.itemId}
											onChange={(itemId) => setLines((current) => current.map((l) => (l.key === line.key ? { ...l, itemId } : l)))}
											options={itemOptions}
											placeholder="Escolha o item"
											searchPlaceholder="Pesquisar item..."
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor={`picking-qty-${line.key}`}>Quantidade</FieldLabel>
										<Input
											id={`picking-qty-${line.key}`}
											value={line.quantity}
											onChange={(e) => setLines((current) => current.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)))}
											inputMode="decimal"
										/>
									</Field>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => setLines((current) => (current.length > 1 ? current.filter((l) => l.key !== line.key) : current))}
										aria-label={`Remover item ${index + 1}`}
									>
										<Trash2 className="size-4" />
									</Button>
								</FieldGroup>
							))}
							<ItemActions className="justify-start">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setLines((current) => [...current, { key: Date.now(), itemId: null, quantity: "" }])}
								>
									<Plus className="size-4" />
									Item
								</Button>
								<Button type="submit" disabled={create.isPending || validLines.length === 0}>
									Gerar lista
								</Button>
							</ItemActions>
						</form>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
