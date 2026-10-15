import { isValidSupplierLevel, STOCK_LEVEL_LABELS, STOCK_LEVELS, type StockLevel } from "@iefa/sisprov-domain/inventory"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { createStockLocationFn, listAdministeredUnitsFn, listSupplierCandidatesFn, type StockLocationView, updateStockLocationFn } from "@/server/stock.fn"
import { OptionCombobox } from "./OptionCombobox"

const CLASS_OPTIONS = [
	{ id: "alimentacao", label: "Alimentação" },
	{ id: "auxiliar", label: "Auxiliar" },
	{ id: "permanente", label: "Permanente" },
	{ id: "fardamento", label: "Fardamento" },
] as const
type SupplyClass = (typeof CLASS_OPTIONS)[number]["id"]

const NO_SUPPLIER = "none"

/**
 * Criar (SDAB) ou configurar (gestor do local) um local de estoque: nível, abastecedor, recebe
 * direto, GLN, endereçamento. Salvar é explícito e confere a versão que a tela viu; o banco
 * recusa abastecedor de nível igual ou maior e GLN com dígito verificador errado.
 */
export function LocationSettingsForm({ location, onDone }: { location?: StockLocationView; onDone?: (id: number) => void }) {
	const qc = useQueryClient()
	const isKitchen = location?.kitchenId != null
	const [name, setName] = useState(location?.name ?? "")
	const [level, setLevel] = useState<StockLevel>(location?.level ?? 3)
	const [supplier, setSupplier] = useState<number | null>(location?.suppliedById ?? null)
	const [receivesDirect, setReceivesDirect] = useState(location?.receivesDirect ?? false)
	const [usesPositions, setUsesPositions] = useState(location?.usesPositions ?? true)
	const [gln, setGln] = useState(location?.gln ?? "")
	const [unitId, setUnitId] = useState<number | null>(location?.unitId ?? null)
	const [classes, setClasses] = useState<SupplyClass[]>((location?.supplyClasses as SupplyClass[] | undefined) ?? ["fardamento"])

	const suppliers = useQuery({
		queryKey: ["sisprov", "supplierCandidates", level],
		queryFn: () => listSupplierCandidatesFn({ data: { level: level as 2 | 3 } }),
		enabled: level !== 1,
	})
	const units = useQuery({ queryKey: ["sisprov", "administeredUnits"], queryFn: () => listAdministeredUnitsFn(), enabled: !location })

	const effectiveSupplier = level === 1 ? null : supplier
	const settings = {
		name,
		level,
		suppliedByLocationId: effectiveSupplier,
		receivesDirect,
		usesPositions,
		gln: gln.trim() || null,
	}

	const save = useMutation({
		mutationFn: async () => {
			if (location) {
				await updateStockLocationFn({ data: { ...settings, locationId: location.id, seenUpdatedAt: location.updatedAt } })
				return location.id
			}
			if (unitId === null) throw new Error("Escolha a OM dona do local")
			return (await createStockLocationFn({ data: { ...settings, unitId, supplyClasses: classes } })).id
		},
		onSuccess: (id) => {
			toast.success(location ? "Local atualizado" : "Local criado")
			qc.invalidateQueries({ queryKey: ["sisprov", "stockLocations"] })
			qc.invalidateQueries({ queryKey: ["sisprov", "stockLocation", id] })
			onDone?.(id)
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
	})

	const supplierOptions = (suppliers.data ?? []).filter((s) => s.id !== location?.id && isValidSupplierLevel(s.level as StockLevel, level))

	return (
		<form
			className="space-y-6"
			onSubmit={(event) => {
				event.preventDefault()
				save.mutate()
			}}
		>
			<FieldGroup className="sm:grid sm:grid-cols-2">
				<Field>
					<FieldLabel htmlFor="location-name">Nome</FieldLabel>
					<Input id="location-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
				</Field>
				{!location && (
					<Field>
						<FieldLabel>OM dona do local</FieldLabel>
						<OptionCombobox
							value={unitId === null ? null : String(unitId)}
							onChange={(id) => setUnitId(id === null ? null : Number(id))}
							options={(units.data ?? []).map((unit) => ({ id: String(unit.id), label: unit.code, hint: unit.name ?? undefined }))}
							placeholder={units.isLoading ? "Carregando OMs…" : "Escolha a OM"}
							searchPlaceholder="Pesquisar OM..."
						/>
					</Field>
				)}
				<Field>
					<FieldLabel>Nível</FieldLabel>
					<Select
						value={String(level)}
						onValueChange={(v) => {
							if (v) setLevel(Number(v) as StockLevel)
						}}
						disabled={isKitchen}
					>
						<SelectTrigger>
							<SelectValue>{STOCK_LEVEL_LABELS[level]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{STOCK_LEVELS.map((l) => (
								<SelectItem key={l} value={String(l)}>
									{STOCK_LEVEL_LABELS[l]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{isKitchen && <FieldDescription>O local de cozinha é sempre nível 3.</FieldDescription>}
				</Field>
				<Field>
					<FieldLabel>Abastecido por</FieldLabel>
					<Select
						value={effectiveSupplier === null ? NO_SUPPLIER : String(effectiveSupplier)}
						onValueChange={(v) => {
							if (v) setSupplier(v === NO_SUPPLIER ? null : Number(v))
						}}
						disabled={level === 1}
					>
						<SelectTrigger>
							<SelectValue>
								{effectiveSupplier === null ? "Ninguém (só fornecedor)" : (supplierOptions.find((s) => s.id === effectiveSupplier)?.name ?? "Abastecedor")}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NO_SUPPLIER}>Ninguém (só fornecedor)</SelectItem>
							{supplierOptions.map((s) => (
								<SelectItem key={s.id} value={String(s.id)}>
									{s.name} · nível {s.level}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldDescription>Só local de nível menor abastece. O depósito central não tem abastecedor.</FieldDescription>
				</Field>
				<Field>
					<FieldLabel htmlFor="location-gln">GLN (opcional)</FieldLabel>
					<Input id="location-gln" value={gln} onChange={(e) => setGln(e.target.value)} inputMode="numeric" maxLength={13} placeholder="13 dígitos" />
					<FieldDescription>Código de localização GS1, conferido pelo dígito verificador.</FieldDescription>
				</Field>
			</FieldGroup>

			<FieldGroup>
				<Field orientation="horizontal">
					<Switch id="location-direct" checked={receivesDirect} onCheckedChange={setReceivesDirect} />
					<FieldLabel htmlFor="location-direct">Recebe direto do fornecedor</FieldLabel>
				</Field>
				<Field orientation="horizontal">
					<Switch id="location-positions" checked={usesPositions} onCheckedChange={setUsesPositions} disabled={isKitchen} />
					<FieldLabel htmlFor="location-positions">Endereçado (posições, pallets, separação)</FieldLabel>
				</Field>
			</FieldGroup>

			{!location && (
				<FieldGroup>
					<FieldLabel>Classes que o local guarda</FieldLabel>
					<div className="flex flex-wrap gap-4">
						{CLASS_OPTIONS.map((option) => (
							<Field key={option.id} orientation="horizontal" className="w-auto">
								<Checkbox
									id={`class-${option.id}`}
									checked={classes.includes(option.id)}
									onCheckedChange={(checked) => setClasses((current) => (checked ? [...current, option.id] : current.filter((c) => c !== option.id)))}
								/>
								<FieldLabel htmlFor={`class-${option.id}`}>{option.label}</FieldLabel>
							</Field>
						))}
					</div>
				</FieldGroup>
			)}

			<Button type="submit" disabled={save.isPending || !name.trim() || (!location && (unitId === null || classes.length === 0))}>
				{location ? "Salvar configuração" : "Criar local"}
			</Button>
		</form>
	)
}
