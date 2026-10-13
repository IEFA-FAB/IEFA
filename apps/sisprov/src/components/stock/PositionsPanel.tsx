import { allowedChildKinds, buildAddress, flattenPositionTree, POSITION_KIND_LABELS, type PositionKind } from "@iefa/sisprov-domain/inventory"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MapPin, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { createPositionFn, deactivatePositionFn, listPositionsFn, type PositionView } from "@/server/addressing.fn"
import { OptionCombobox } from "./OptionCombobox"

const ROOT = "root"

function formatDate(value: string | null) {
	return value ? new Date(value).toLocaleDateString("pt-BR") : null
}

/**
 * Endereços do local: árvore (depósito, setor, estante, prateleira, escaninho), na ordem de
 * separação. O gestor do local (`storage` 3) cria e desativa; o banco deriva o endereço, recusa
 * tipo fora de ordem e não deixa desativar posição com estoque.
 */
export function PositionsPanel({ locationId, canManage }: { locationId: number; canManage: boolean }) {
	const qc = useQueryClient()
	const positions = useQuery({ queryKey: ["sisprov", "positions", locationId], queryFn: () => listPositionsFn({ data: { locationId } }) })
	const nodes = flattenPositionTree(positions.data ?? [])

	const [parent, setParent] = useState<string>(ROOT)
	const parentNode = parent === ROOT ? null : (positions.data ?? []).find((p) => String(p.id) === parent)
	const kinds = allowedChildKinds(parentNode?.kind ?? null)
	const [kind, setKind] = useState<PositionKind>("sector")
	const effectiveKind = kinds.includes(kind) ? kind : (kinds[0] ?? "shelf")
	const [code, setCode] = useState("")
	const [aisle, setAisle] = useState("")
	const [pickingSequence, setPickingSequence] = useState("")

	const invalidate = () => qc.invalidateQueries({ queryKey: ["sisprov", "positions", locationId] })

	const create = useMutation({
		mutationFn: () =>
			createPositionFn({
				data: {
					locationId,
					parentId: parentNode?.id ?? null,
					kind: effectiveKind,
					code: code.trim(),
					aisle: effectiveKind === "rack" && aisle ? Number(aisle) : null,
					rackType: null,
					pickingSequence: pickingSequence ? Number(pickingSequence) : null,
				},
			}),
		onSuccess: () => {
			toast.success("Posição criada")
			setCode("")
			invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar a posição"),
	})

	const deactivate = useMutation({
		mutationFn: (position: PositionView) => deactivatePositionFn({ data: { locationId, positionId: position.id } }),
		onSuccess: () => {
			toast.success("Posição desativada")
			invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao desativar"),
	})

	return (
		<div className="space-y-6">
			{positions.isPending ? (
				<Skeleton className="h-32 w-full" />
			) : positions.isError ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível ler os endereços</AlertTitle>
					<AlertDescription>{positions.error instanceof Error ? positions.error.message : "Tente de novo."}</AlertDescription>
				</Alert>
			) : nodes.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPin />
						</EmptyMedia>
						<EmptyTitle>Nenhum endereço cadastrado</EmptyTitle>
						<EmptyDescription>Comece pelo depósito ou pelo setor; só prateleira e escaninho guardam estoque.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ItemGroup>
					{nodes.map((node) => (
						<Item key={node.id} variant="outline" size="sm" style={{ marginLeft: `${node.depth * 1.25}rem` }}>
							<ItemContent>
								<ItemTitle>
									<span className="font-mono">{node.address}</span>
									<Badge variant={node.holdsStock ? "secondary" : "outline"}>{POSITION_KIND_LABELS[node.kind]}</Badge>
								</ItemTitle>
								<ItemDescription>
									{[
										node.aisle !== null ? `corredor ${node.aisle}` : null,
										node.pickingSequence !== null ? `separação ${node.pickingSequence}` : null,
										node.holdsStock ? (formatDate(node.lastCountedAt) ? `conferida em ${formatDate(node.lastCountedAt)}` : "nunca conferida") : null,
									]
										.filter(Boolean)
										.join(" · ") || "—"}
								</ItemDescription>
							</ItemContent>
							{canManage && (
								<ItemActions>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => deactivate.mutate(node)}
										disabled={deactivate.isPending}
										aria-label={`Desativar ${node.address}`}
									>
										<Trash2 className="size-4" />
									</Button>
								</ItemActions>
							)}
						</Item>
					))}
				</ItemGroup>
			)}

			{canManage && (
				<Card>
					<CardHeader>
						<CardTitle>Nova posição</CardTitle>
						<CardDescription>
							O endereço sai do caminho:{" "}
							<span className="font-mono">{code.trim() ? buildAddress(parentNode?.address ?? null, code.trim().toUpperCase()) : "…"}</span>
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault()
								create.mutate()
							}}
						>
							<FieldGroup className="sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:items-end">
								<Field className="lg:col-span-2">
									<FieldLabel>Dentro de</FieldLabel>
									<OptionCombobox
										value={parent}
										onChange={(v) => setParent(v ?? ROOT)}
										options={[
											{ id: ROOT, label: "Raiz do local" },
											...nodes
												.filter((node) => allowedChildKinds(node.kind).length > 0)
												.map((node) => ({ id: String(node.id), label: node.address, hint: POSITION_KIND_LABELS[node.kind] })),
										]}
										placeholder="Raiz do local"
										searchPlaceholder="Pesquisar endereço..."
									/>
								</Field>
								<Field>
									<FieldLabel>Tipo</FieldLabel>
									<Select
										value={effectiveKind}
										onValueChange={(v) => {
											if (v) setKind(v as PositionKind)
										}}
									>
										<SelectTrigger>
											<SelectValue>{POSITION_KIND_LABELS[effectiveKind]}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{kinds.map((k) => (
												<SelectItem key={k} value={k}>
													{POSITION_KIND_LABELS[k]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								<Field>
									<FieldLabel htmlFor="position-code">Código</FieldLabel>
									<Input id="position-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} placeholder="E05" required />
								</Field>
								<Field>
									<FieldLabel htmlFor="position-sequence">Ordem de separação</FieldLabel>
									<Input id="position-sequence" value={pickingSequence} onChange={(e) => setPickingSequence(e.target.value)} inputMode="numeric" />
								</Field>
								{effectiveKind === "rack" && (
									<Field>
										<FieldLabel htmlFor="position-aisle">Corredor</FieldLabel>
										<Input id="position-aisle" value={aisle} onChange={(e) => setAisle(e.target.value)} inputMode="numeric" />
										<FieldDescription>Só para estante.</FieldDescription>
									</Field>
								)}
							</FieldGroup>
							<Button type="submit" disabled={create.isPending || !code.trim() || kinds.length === 0}>
								<Plus className="size-4" />
								Criar posição
							</Button>
						</form>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
