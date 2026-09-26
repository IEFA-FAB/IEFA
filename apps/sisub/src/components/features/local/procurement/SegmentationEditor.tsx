import type { ProcurementSegment, SegmentationLine, SegmentationOverview, SegmentRuleMode } from "@iefa/sisub-domain"
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { AutoSaveStatus, autoSaveStateOf } from "@/components/features/shared/AutoSaveStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useSegmentMutations } from "@/hooks/data/useProcurementSegments"

export const MONTH_LABELS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const NO_MONTH = "none"

type Mutations = ReturnType<typeof useSegmentMutations>
type Segment = SegmentationOverview["segments"][number]

/**
 * Segmentação das contratações da OM: cada contratação (Carnes, Estocáveis…) é um recorte do que
 * a OM compra num mesmo processo, montado por pastas do catálogo e por itens de compra. A tela
 * mostra na hora o efeito de cada regra: item que ficou sem contratação e item disputado por
 * duas (conflito, que a Lei 14.133/2021, art. 82, VIII, não admite).
 */
export function SegmentationEditor({ unitId, overview, canEdit }: { unitId: number; overview: SegmentationOverview; canEdit: boolean }) {
	const mutations = useSegmentMutations(unitId)
	const [creating, setCreating] = useState(false)
	const segmentNameById = new Map(overview.segments.map((s) => [s.id, s.name]))
	const conflicts = overview.lines.filter((l) => l.resolution.kind === "conflict")
	const unassigned = overview.lines.filter((l) => l.resolution.kind === "unassigned")
	const assignedCount = overview.lines.length - unassigned.length - conflicts.length

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline">
					{overview.segments.length} contrataç{overview.segments.length === 1 ? "ão" : "ões"}
				</Badge>
				<Badge variant="secondary">
					{assignedCount} ite{assignedCount === 1 ? "m" : "ns"} com contratação
				</Badge>
				<Badge variant={unassigned.length > 0 ? "warning" : "success"}>{unassigned.length} sem contratação</Badge>
				<Badge variant={conflicts.length > 0 ? "destructive" : "success"}>
					{conflicts.length} conflito{conflicts.length === 1 ? "" : "s"}
				</Badge>
				{canEdit && (
					<Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
						<Plus className="size-4" aria-hidden="true" />
						Nova contratação
					</Button>
				)}
			</div>

			{conflicts.length > 0 && (
				<Alert variant="destructive">
					<AlertTriangle className="size-4" aria-hidden="true" />
					<AlertTitle>Itens em duas contratações</AlertTitle>
					<AlertDescription>
						<p>O órgão não pode participar de duas atas com o mesmo objeto (Lei 14.133/2021, art. 82, VIII). Ajuste as regras até cada item ter uma só.</p>
						<ul className="mt-2 space-y-1">
							{conflicts.map((line) => (
								<li key={line.key}>
									<strong>{line.description}</strong>:{" "}
									{line.resolution.kind === "conflict" && line.resolution.segmentIds.map((id) => segmentNameById.get(id) ?? "?").join(" e ")}
								</li>
							))}
						</ul>
					</AlertDescription>
				</Alert>
			)}

			{overview.segments.length === 0 ? (
				<Card>
					<CardContent className="py-10">
						<p className="text-center text-sm text-muted-foreground">
							Nenhuma contratação ainda. Crie uma para cada processo que a OM conduz separado (ex.: Carnes em março, Estocáveis em junho) e diga quais pastas do
							catálogo entram em cada uma.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{overview.segments.map((segment) => (
						<SegmentCard key={segment.id} segment={segment} overview={overview} mutations={mutations} canEdit={canEdit} />
					))}
				</div>
			)}

			<UnassignedList lines={unassigned} />

			{creating && <CreateSegmentDialog mutations={mutations} onClose={() => setCreating(false)} />}
		</div>
	)
}

function CreateSegmentDialog({ mutations, onClose }: { mutations: Mutations; onClose: () => void }) {
	const [name, setName] = useState("")
	const [plannedMonth, setPlannedMonth] = useState<number | null>(null)
	const [validityMonths, setValidityMonths] = useState(12)
	const [leadTimeMonths, setLeadTimeMonths] = useState(5)

	const submit = () => {
		if (!name.trim()) return
		mutations.create.mutate({ name: name.trim(), plannedMonth, validityMonths, leadTimeMonths }, { onSuccess: onClose })
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Nova contratação</DialogTitle>
					<DialogDescription>Um processo de compra que a OM conduz separado dos outros. As pastas que entram nela se escolhem em seguida.</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="segment-name">Nome</FieldLabel>
						<Input id="segment-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Carnes" autoFocus />
					</Field>
					<Field>
						<FieldLabel htmlFor="segment-month">Mês previsto no calendário de contratação</FieldLabel>
						<MonthSelect id="segment-month" value={plannedMonth} onChange={setPlannedMonth} />
						<FieldDescription>Quando o processo deve começar. O fluxo lembra antes, com a antecedência abaixo.</FieldDescription>
					</Field>
					<div className="grid grid-cols-2 gap-4">
						<Field>
							<FieldLabel htmlFor="segment-validity">Vigência da ata (meses)</FieldLabel>
							<Input
								id="segment-validity"
								type="number"
								min={1}
								max={120}
								value={validityMonths}
								onChange={(e) => setValidityMonths(Math.max(1, Number(e.target.value) || 1))}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="segment-lead">Antecedência do aviso (meses)</FieldLabel>
							<Input
								id="segment-lead"
								type="number"
								min={0}
								max={12}
								value={leadTimeMonths}
								onChange={(e) => setLeadTimeMonths(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
							/>
						</Field>
					</div>
				</FieldGroup>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={submit} disabled={!name.trim() || mutations.create.isPending}>
						{mutations.create.isPending ? "Criando…" : "Criar contratação"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function MonthSelect({ id, value, onChange, disabled }: { id: string; value: number | null; onChange: (month: number | null) => void; disabled?: boolean }) {
	return (
		<Select
			value={value == null ? NO_MONTH : String(value)}
			onValueChange={(next) => onChange(next == null || next === NO_MONTH ? null : Number(next))}
			disabled={disabled}
		>
			<SelectTrigger id={id} className="w-full">
				<SelectValue>{value == null ? "Sem mês definido" : MONTH_LABELS[value - 1]}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NO_MONTH}>Sem mês definido</SelectItem>
				{MONTH_LABELS.map((label, index) => (
					<SelectItem key={label} value={String(index + 1)}>
						{label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

/**
 * Uma contratação, editada no próprio card (SAVE_BEHAVIOR, modo B): campo discreto grava na
 * mudança, texto grava no blur, e o estado aparece no `AutoSaveStatus` no lugar de um Salvar.
 */
function SegmentCard({ segment, overview, mutations, canEdit }: { segment: Segment; overview: SegmentationOverview; mutations: Mutations; canEdit: boolean }) {
	const [name, setName] = useState(segment.name)
	const [pca, setPca] = useState(segment.pcaIdentifier ?? "")
	const save = (patch: Omit<Parameters<Mutations["update"]["mutate"]>[0], "segmentId">) => mutations.update.mutate({ segmentId: segment.id, ...patch })

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div>
						<CardTitle>{segment.name}</CardTitle>
						<CardDescription>
							{segment.lineCount} ite{segment.lineCount === 1 ? "m" : "ns"} dos cardápios da OM
							{segment.plannedMonth ? ` · calendário: ${MONTH_LABELS[segment.plannedMonth - 1]}` : " · sem mês no calendário"} · vigência de{" "}
							{segment.validityMonths} meses
						</CardDescription>
					</div>
					<div className="flex items-center gap-2">
						<AutoSaveStatus status={autoSaveStateOf(mutations.update)} />
						{canEdit && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									if (window.confirm(`Remover a contratação "${segment.name}"? Os anexos já feitos com ela continuam como estão.`))
										mutations.remove.mutate(segment.id)
								}}
							>
								<Trash2 className="size-4" aria-hidden="true" />
								Remover
							</Button>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-5">
				{canEdit && (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<Field>
							<FieldLabel htmlFor={`segment-name-${segment.id}`}>Nome</FieldLabel>
							<Input
								id={`segment-name-${segment.id}`}
								value={name}
								onChange={(e) => setName(e.target.value)}
								onBlur={() => name.trim() && name.trim() !== segment.name && save({ name: name.trim() })}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={`segment-month-${segment.id}`}>Mês previsto</FieldLabel>
							<MonthSelect id={`segment-month-${segment.id}`} value={segment.plannedMonth} onChange={(plannedMonth) => save({ plannedMonth })} />
						</Field>
						<Field>
							<FieldLabel htmlFor={`segment-validity-${segment.id}`}>Vigência (meses)</FieldLabel>
							<Input
								id={`segment-validity-${segment.id}`}
								type="number"
								min={1}
								max={120}
								defaultValue={segment.validityMonths}
								onBlur={(e) => {
									const next = Number(e.target.value)
									if (next >= 1 && next <= 120 && next !== segment.validityMonths) save({ validityMonths: next })
								}}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={`segment-pca-${segment.id}`}>Identificador no PCA</FieldLabel>
							<Input
								id={`segment-pca-${segment.id}`}
								value={pca}
								onChange={(e) => setPca(e.target.value)}
								onBlur={() => pca.trim() !== (segment.pcaIdentifier ?? "") && save({ pcaIdentifier: pca.trim() || null })}
								placeholder="Opcional"
							/>
						</Field>
					</div>
				)}

				<SegmentRules segment={segment} overview={overview} mutations={mutations} canEdit={canEdit} />
			</CardContent>
		</Card>
	)
}

function SegmentRules({
	segment,
	overview,
	mutations,
	canEdit,
}: {
	segment: ProcurementSegment
	overview: SegmentationOverview
	mutations: Mutations
	canEdit: boolean
}) {
	const [mode, setMode] = useState<SegmentRuleMode>("include")
	const purchaseItems = overview.lines.filter((l): l is SegmentationLine & { purchaseItemId: string } => l.purchaseItemId != null)

	return (
		<div className="space-y-3">
			<p className="text-subheading">O que entra nesta contratação</p>
			{segment.rules.length === 0 ? (
				<p className="text-sm text-muted-foreground">Nenhuma regra: inclua as pastas do catálogo que esta contratação compra.</p>
			) : (
				<ItemGroup>
					{segment.rules.map((rule) => (
						<Item key={rule.id} variant="outline" size="sm">
							<ItemContent>
								<ItemTitle>
									<Badge variant={rule.mode === "include" ? "success" : "warning"}>{rule.mode === "include" ? "Inclui" : "Exclui"}</Badge>
									{rule.folderPath ?? rule.purchaseItemDescription ?? "Regra sem alvo"}
								</ItemTitle>
								<ItemDescription className="text-xs">{rule.folderId ? "Pasta do catálogo, com as subpastas" : "Item de compra"}</ItemDescription>
							</ItemContent>
							{canEdit && (
								<ItemActions>
									<Button variant="ghost" size="icon-sm" aria-label="Remover regra" onClick={() => mutations.removeRule.mutate(rule.id)}>
										<Trash2 className="size-4" aria-hidden="true" />
									</Button>
								</ItemActions>
							)}
						</Item>
					))}
				</ItemGroup>
			)}

			{canEdit && (
				<div className="grid gap-3 lg:grid-cols-[auto_1fr_1fr] lg:items-end">
					<Field>
						<FieldLabel>Regra</FieldLabel>
						<ToggleGroup
							value={[mode]}
							onValueChange={(value) => setMode((value[0] as SegmentRuleMode) ?? mode)}
							variant="outline"
							size="sm"
							aria-label="Incluir ou excluir"
						>
							<ToggleGroupItem value="include" aria-label="Incluir">
								<Plus className="size-3.5" aria-hidden="true" />
								Incluir
							</ToggleGroupItem>
							<ToggleGroupItem value="exclude" aria-label="Excluir">
								<Minus className="size-3.5" aria-hidden="true" />
								Excluir
							</ToggleGroupItem>
						</ToggleGroup>
					</Field>
					<Field>
						<FieldLabel htmlFor={`segment-folder-${segment.id}`}>Pasta do catálogo</FieldLabel>
						<SearchableSelect
							id={`segment-folder-${segment.id}`}
							value={null}
							onValueChange={(folderId) => folderId && mutations.addRule.mutate({ segmentId: segment.id, mode, folderId })}
							options={overview.folders.map((f) => ({ value: f.id, label: f.path.split(" › ").at(-1) ?? f.path, hint: f.path, keywords: f.path }))}
							placeholder="Escolher pasta…"
							searchPlaceholder="Buscar pasta"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor={`segment-item-${segment.id}`}>Ou um item de compra</FieldLabel>
						<SearchableSelect
							id={`segment-item-${segment.id}`}
							value={null}
							onValueChange={(purchaseItemId) => purchaseItemId && mutations.addRule.mutate({ segmentId: segment.id, mode, purchaseItemId })}
							options={purchaseItems.map((l) => ({
								value: l.purchaseItemId,
								label: l.description,
								hint: l.folderPath ?? undefined,
								keywords: `${l.catmat ?? ""} ${l.ingredientNames.join(" ")}`,
							}))}
							placeholder="Escolher item…"
							searchPlaceholder="Buscar item, CATMAT ou insumo"
						/>
					</Field>
				</div>
			)}
		</div>
	)
}

function UnassignedList({ lines }: { lines: SegmentationLine[] }) {
	const [open, setOpen] = useState(false)
	if (lines.length === 0) return null
	const visible = open ? lines : lines.slice(0, 8)
	return (
		<Card>
			<CardHeader>
				<CardTitle>Itens sem contratação</CardTitle>
				<CardDescription>
					Itens dos cardápios da OM que nenhuma contratação inclui. Podem ser compra fora do rancho; se não forem, inclua a pasta deles.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<ItemGroup>
					{visible.map((line) => (
						<Item key={line.key} variant="outline" size="xs">
							<ItemContent>
								<ItemTitle>{line.description}</ItemTitle>
								<ItemDescription className="text-xs">{line.folderPath ?? "Insumo sem pasta no catálogo"}</ItemDescription>
							</ItemContent>
						</Item>
					))}
				</ItemGroup>
				{lines.length > visible.length && (
					<Button variant="link" size="sm" onClick={() => setOpen(true)}>
						Ver os {lines.length}
					</Button>
				)}
			</CardContent>
		</Card>
	)
}
