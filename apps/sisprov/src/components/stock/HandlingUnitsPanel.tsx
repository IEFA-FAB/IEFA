import { GIAI_PATTERN, isValidSscc } from "@iefa/sisprov-domain/inventory"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Package, PackageOpen, X } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import {
	closeHandlingUnitFn,
	createHandlingUnitFn,
	type HandlingUnitView,
	listHandlingUnitsFn,
	listLocationLotsFn,
	listPositionsFn,
	moveToPositionFn,
} from "@/server/addressing.fn"
import { OptionCombobox } from "./OptionCombobox"

const DESTINATION_PALLET = "pallet:"
const DESTINATION_POSITION = "position:"

/**
 * Pallets (GIAI) e caixas (SSCC) do local. A caixa é de um lote e pode estar num pallet, e então
 * segue a posição dele; mover o pallet move as caixas. O SSCC é conferido pelo dígito verificador
 * aqui e no banco.
 */
export function HandlingUnitsPanel({ locationId, canOperate }: { locationId: number; canOperate: boolean }) {
	const qc = useQueryClient()
	const units = useQuery({ queryKey: ["sisprov", "handlingUnits", locationId], queryFn: () => listHandlingUnitsFn({ data: { locationId } }) })
	const positions = useQuery({ queryKey: ["sisprov", "positions", locationId], queryFn: () => listPositionsFn({ data: { locationId } }), enabled: canOperate })
	const lots = useQuery({
		queryKey: ["sisprov", "locationLots", locationId, false],
		queryFn: () => listLocationLotsFn({ data: { locationId, pendingOnly: false } }),
		enabled: canOperate,
	})

	const pallets = (units.data ?? []).filter((u) => u.kind === "pallet")
	const boxesOf = (palletId: string | null) => (units.data ?? []).filter((u) => u.kind === "box" && u.parentId === palletId)
	const lotLabel = new Map((lots.data ?? []).map((lot) => [lot.lotId, `${lot.description} · lote ${lot.lotCode}`]))
	const positionOptions = (positions.data ?? []).filter((p) => p.holdsStock).map((p) => ({ id: `${DESTINATION_POSITION}${p.id}`, label: p.address }))
	const palletOptions = pallets.map((p) => ({ id: `${DESTINATION_PALLET}${p.id}`, label: `Pallet ${p.code}`, hint: p.address ?? "sem posição" }))

	const invalidate = () => qc.invalidateQueries({ queryKey: ["sisprov", "handlingUnits", locationId] })
	const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro")

	// ── cadastro ──
	const [kind, setKind] = useState<"pallet" | "box">("pallet")
	const [code, setCode] = useState("")
	const [lotId, setLotId] = useState<string | null>(null)
	const [destination, setDestination] = useState<string | null>(null)
	const [quantity, setQuantity] = useState("")
	const trimmed = code.trim()
	const codeOk = kind === "box" ? isValidSscc(trimmed) : GIAI_PATTERN.test(trimmed)

	const create = useMutation({
		mutationFn: () => {
			const positionId = destination?.startsWith(DESTINATION_POSITION) ? Number(destination.slice(DESTINATION_POSITION.length)) : null
			const palletId = destination?.startsWith(DESTINATION_PALLET) ? destination.slice(DESTINATION_PALLET.length) : null
			return kind === "pallet"
				? createHandlingUnitFn({ data: { kind: "pallet", locationId, code: trimmed, positionId, weightKg: null } })
				: createHandlingUnitFn({
						data: {
							kind: "box",
							locationId,
							code: trimmed,
							lotId: lotId as string,
							palletId,
							positionId,
							quantity: quantity ? Number(quantity.replace(",", ".")) : null,
							weightKg: null,
							boxCategory: null,
						},
					})
		},
		onSuccess: () => {
			toast.success(kind === "pallet" ? "Pallet cadastrado" : "Caixa cadastrada")
			setCode("")
			setQuantity("")
			invalidate()
		},
		onError,
	})

	// ── movimentação ──
	const [movingId, setMovingId] = useState<string | null>(null)
	const [moveTarget, setMoveTarget] = useState<string | null>(null)
	const move = useMutation({
		mutationFn: (unit: HandlingUnitView) =>
			moveToPositionFn({
				data: {
					locationId,
					lotId: null,
					handlingUnitId: unit.id,
					toPositionId: moveTarget?.startsWith(DESTINATION_POSITION) ? Number(moveTarget.slice(DESTINATION_POSITION.length)) : null,
					toPalletId: moveTarget?.startsWith(DESTINATION_PALLET) ? moveTarget.slice(DESTINATION_PALLET.length) : null,
					reason: null,
				},
			}),
		onSuccess: () => {
			toast.success("Unidade movida")
			setMovingId(null)
			setMoveTarget(null)
			invalidate()
		},
		onError,
	})
	const close = useMutation({
		mutationFn: (unit: HandlingUnitView) => closeHandlingUnitFn({ data: { locationId, handlingUnitId: unit.id } }),
		onSuccess: () => {
			toast.success("Unidade fechada")
			invalidate()
		},
		onError,
	})

	const renderUnit = (unit: HandlingUnitView, nested: boolean) => (
		<Item key={unit.id} variant={nested ? "muted" : "outline"} size="sm" style={nested ? { marginLeft: "1.25rem" } : undefined}>
			<ItemContent>
				<ItemTitle>
					{unit.kind === "pallet" ? <Package className="size-4" /> : <PackageOpen className="size-4" />}
					<span className="font-mono">{unit.code}</span>
				</ItemTitle>
				<ItemDescription>
					{unit.kind === "box" ? `${unit.lotId ? (lotLabel.get(unit.lotId) ?? "lote") : "lote"}${unit.quantity !== null ? ` · ${unit.quantity}` : ""} · ` : ""}
					{unit.address ? <span className="font-mono">{unit.address}</span> : "sem posição"}
				</ItemDescription>
				{movingId === unit.id && (
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<div className="min-w-64">
							<OptionCombobox
								value={moveTarget}
								onChange={setMoveTarget}
								options={unit.kind === "box" ? [...palletOptions, ...positionOptions] : positionOptions}
								placeholder={unit.kind === "box" ? "Pallet ou posição" : "Posição"}
								searchPlaceholder="Pesquisar..."
							/>
						</div>
						<Button size="sm" onClick={() => move.mutate(unit)} disabled={!moveTarget || move.isPending}>
							Confirmar
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setMovingId(null)}>
							Cancelar
						</Button>
					</div>
				)}
			</ItemContent>
			{canOperate && movingId !== unit.id && (
				<ItemActions>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setMovingId(unit.id)
							setMoveTarget(null)
						}}
					>
						Mover
					</Button>
					<Button variant="ghost" size="sm" onClick={() => close.mutate(unit)} disabled={close.isPending} aria-label={`Fechar ${unit.code}`}>
						<X className="size-4" />
					</Button>
				</ItemActions>
			)}
		</Item>
	)

	return (
		<div className="space-y-6">
			{units.isPending ? (
				<Skeleton className="h-32 w-full" />
			) : units.isError ? (
				<Alert variant="destructive">
					<AlertTitle>Não foi possível ler as unidades</AlertTitle>
					<AlertDescription>{units.error instanceof Error ? units.error.message : "Tente de novo."}</AlertDescription>
				</Alert>
			) : (units.data ?? []).length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Package />
						</EmptyMedia>
						<EmptyTitle>Nenhum pallet ou caixa aberto</EmptyTitle>
						<EmptyDescription>Pallet e caixa são opcionais: o lote pode ser guardado direto na prateleira.</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<ItemGroup>
					{pallets.flatMap((pallet) => [renderUnit(pallet, false), ...boxesOf(pallet.id).map((box) => renderUnit(box, true))])}
					{boxesOf(null).map((box) => renderUnit(box, false))}
				</ItemGroup>
			)}

			{canOperate && (
				<Card>
					<CardHeader>
						<CardTitle>Nova unidade</CardTitle>
						<CardDescription>Pallet com código GIAI; caixa com SSCC de 18 dígitos, de um lote deste local.</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault()
								create.mutate()
							}}
						>
							<div className="flex gap-2">
								<Button type="button" variant={kind === "pallet" ? "default" : "outline"} size="sm" onClick={() => setKind("pallet")}>
									Pallet
								</Button>
								<Button type="button" variant={kind === "box" ? "default" : "outline"} size="sm" onClick={() => setKind("box")}>
									Caixa
								</Button>
							</div>
							<FieldGroup className="sm:grid sm:grid-cols-2 sm:items-start">
								<Field>
									<FieldLabel htmlFor="unit-code">{kind === "pallet" ? "GIAI" : "SSCC"}</FieldLabel>
									<Input id="unit-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} required />
									{trimmed && !codeOk && (
										<FieldDescription className="text-destructive">
											{kind === "box" ? "SSCC inválido: 18 dígitos com o dígito verificador GS1." : "GIAI: 4 a 30 caracteres (letras, dígitos, . / : -)."}
										</FieldDescription>
									)}
								</Field>
								{kind === "box" && (
									<Field>
										<FieldLabel>Lote</FieldLabel>
										<OptionCombobox
											value={lotId}
											onChange={setLotId}
											options={(lots.data ?? []).map((lot) => ({
												id: lot.lotId,
												label: `${lot.description} · ${lot.lotCode}`,
												hint: lot.address ?? "pendente",
											}))}
											placeholder="Escolha o lote"
											searchPlaceholder="Pesquisar item ou lote..."
										/>
									</Field>
								)}
								<Field>
									<FieldLabel>{kind === "box" ? "Pallet ou posição (opcional)" : "Posição (opcional)"}</FieldLabel>
									<OptionCombobox
										value={destination}
										onChange={setDestination}
										options={kind === "box" ? [...palletOptions, ...positionOptions] : positionOptions}
										placeholder="Sem posição por enquanto"
										searchPlaceholder="Pesquisar..."
									/>
								</Field>
								{kind === "box" && (
									<Field>
										<FieldLabel htmlFor="unit-quantity">Quantidade na caixa</FieldLabel>
										<Input id="unit-quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
									</Field>
								)}
							</FieldGroup>
							<Button type="submit" disabled={create.isPending || !codeOk || (kind === "box" && !lotId)}>
								Cadastrar {kind === "pallet" ? "pallet" : "caixa"}
							</Button>
						</form>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
