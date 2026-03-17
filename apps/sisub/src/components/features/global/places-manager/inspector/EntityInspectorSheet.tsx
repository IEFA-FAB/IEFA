import { ArrowRight, Building2, ChefHat, Utensils } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RELATION_LABELS } from "@/lib/places-graph/validate"
import type { PlacesEdge, PlacesEditorMode, PlacesNode, PlacesSelection } from "@/types/domain/places"
import { KitchenInspectorForm } from "./KitchenInspectorForm"
import { MessHallInspectorForm } from "./MessHallInspectorForm"
import { UnitInspectorForm } from "./UnitInspectorForm"

interface EntityInspectorSheetProps {
	selection: PlacesSelection
	edges: PlacesEdge[]
	nodes: PlacesNode[]
	onClose: () => void
	editorMode: PlacesEditorMode
}

// ─── Node metadata helpers ────────────────────────────────────────────────────

const ENTITY_ICONS = {
	unit: Building2,
	kitchen: ChefHat,
	mess_hall: Utensils,
} as const

const ENTITY_LABELS = {
	unit: "Unidade",
	kitchen: "Cozinha",
	mess_hall: "Refeitório",
} as const

const ENTITY_COLORS = {
	unit: "var(--color-chart-1)",
	kitchen: "var(--color-chart-2)",
	mess_hall: "var(--color-chart-3)",
} as const

// ─── Relations tab ────────────────────────────────────────────────────────────

function RelationsList({ nodeId, edges, nodeNames }: { nodeId: string; edges: PlacesEdge[]; nodeNames: Map<string, string> }) {
	const nodeEdges = edges.filter((e) => e.source === nodeId || e.target === nodeId)

	if (nodeEdges.length === 0) {
		return <p className="text-sm text-muted-foreground py-4 text-center">Este nó não possui relações cadastradas.</p>
	}

	const outgoing = nodeEdges.filter((e) => e.source === nodeId)
	const incoming = nodeEdges.filter((e) => e.target === nodeId)

	return (
		<div className="flex flex-col gap-4">
			{outgoing.length > 0 && (
				<div>
					<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aponta para</p>
					<div className="flex flex-col gap-1.5">
						{outgoing.map((edge) => {
							if (!edge.data) return null
							const label = RELATION_LABELS[edge.data.relationType]
							const targetName = nodeNames.get(edge.target) ?? edge.target
							return (
								<div key={edge.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
									<ArrowRight className="size-3.5 text-muted-foreground flex-shrink-0" />
									<div className="flex flex-col min-w-0">
										<span className="text-[10px] text-muted-foreground">{label}</span>
										<span className="text-xs font-medium text-foreground">{targetName}</span>
									</div>
									{edge.data.isDirty && (
										<Badge variant="warning" className="ml-auto text-[10px] h-4 px-1.5">
											Pendente
										</Badge>
									)}
								</div>
							)
						})}
					</div>
				</div>
			)}

			{incoming.length > 0 && (
				<div>
					<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recebe de</p>
					<div className="flex flex-col gap-1.5">
						{incoming.map((edge) => {
							if (!edge.data) return null
							const label = RELATION_LABELS[edge.data.relationType]
							const sourceName = nodeNames.get(edge.source) ?? edge.source
							return (
								<div key={edge.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
									<ArrowRight className="size-3.5 text-muted-foreground flex-shrink-0 rotate-180" />
									<div className="flex flex-col min-w-0">
										<span className="text-[10px] text-muted-foreground">{label}</span>
										<span className="text-xs font-medium text-foreground">{sourceName}</span>
									</div>
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}

// ─── Main sheet ───────────────────────────────────────────────────────────────

export function EntityInspectorSheet({ selection, edges, nodes, onClose, editorMode }: EntityInspectorSheetProps) {
	const isOpen = selection?.type === "node"
	const node = selection?.type === "node" ? selection.node : null

	const nodeNames = new Map(nodes.map((n) => [n.id, n.data.record.display_name ?? `#${n.data.record.id}`]))

	if (!node) {
		return (
			<Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<SheetContent side="right" className="w-[400px] sm:w-[420px]" />
			</Sheet>
		)
	}

	const { entityType } = node.data
	const record = node.data.record
	const Icon = ENTITY_ICONS[entityType]
	const entityLabel = ENTITY_LABELS[entityType]
	const entityColor = ENTITY_COLORS[entityType]
	const displayName = record.display_name ?? `#${record.id}`

	return (
		<Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-[400px] sm:w-[420px] flex flex-col">
				<SheetHeader className="pr-10">
					<div className="flex items-center gap-2.5">
						<div
							className="size-8 rounded flex items-center justify-center flex-shrink-0"
							style={{ backgroundColor: `color-mix(in oklch, ${entityColor} 15%, transparent)` }}
						>
							<Icon className="size-4" style={{ color: entityColor }} />
						</div>
						<div className="min-w-0">
							<SheetTitle className="text-base leading-tight truncate">{displayName}</SheetTitle>
							<SheetDescription className="text-xs mt-0.5">{entityLabel}</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<Separator />

				<Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0 px-4 pb-4">
					<TabsList variant="line" className="self-start">
						<TabsTrigger value="details">Detalhes</TabsTrigger>
						<TabsTrigger value="relations">Relações</TabsTrigger>
					</TabsList>

					<div className="flex-1 overflow-y-auto mt-3 pr-1">
						<TabsContent value="details">
							{editorMode === "edit" ? (
								<>
									{entityType === "unit" && <UnitInspectorForm unit={record as import("@/types/domain/places").DbUnit} />}
									{entityType === "kitchen" && <KitchenInspectorForm kitchen={record as import("@/types/domain/places").DbKitchen} />}
									{entityType === "mess_hall" && <MessHallInspectorForm messHall={record as import("@/types/domain/places").DbMessHall} />}
								</>
							) : (
								<div className="flex flex-col gap-4">
									<ReadOnlyFields record={record} entityType={entityType} />
									<p className="text-xs text-muted-foreground">
										Ative o modo <span className="font-medium text-foreground">Editar</span> para modificar os campos.
									</p>
								</div>
							)}
						</TabsContent>

						<TabsContent value="relations">
							<RelationsList nodeId={node.id} edges={edges} nodeNames={nodeNames} />
						</TabsContent>
					</div>
				</Tabs>
			</SheetContent>
		</Sheet>
	)
}

// ─── Read-only fields display ─────────────────────────────────────────────────

function ReadOnlyFields({
	record,
	entityType,
}: {
	record: { id: number; display_name?: string | null; code?: string; type?: string | null }
	entityType: string
}) {
	const fields = [
		record.display_name && { label: "Nome", value: record.display_name },
		record.code && { label: "Código", value: record.code },
		record.type && {
			label: "Tipo",
			value:
				entityType === "unit"
					? ({ consumption: "Consumo", purchase: "Compra" }[record.type] ?? record.type)
					: ({ consumption: "Consumo", production: "Produção" }[record.type] ?? record.type),
		},
		{ label: "ID", value: String(record.id) },
	].filter(Boolean) as Array<{ label: string; value: string }>

	return (
		<div className="flex flex-col gap-2">
			{fields.map(({ label, value }) => (
				<div key={label} className="grid grid-cols-[5rem_1fr] items-baseline gap-x-3">
					<span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
					<span className="text-sm text-foreground break-words">{value}</span>
				</div>
			))}
		</div>
	)
}
