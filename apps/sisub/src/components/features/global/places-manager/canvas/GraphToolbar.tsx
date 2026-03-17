import { Building2, ChefHat, LayoutDashboard, Loader2, Map as MapIcon, Search, Utensils } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/cn"
import type { PlacesEditorMode, PlacesFilterState } from "@/types/domain/places"
import { GraphLegend } from "../GraphLegend"

interface GraphToolbarProps {
	filters: PlacesFilterState
	onFiltersChange: (filters: PlacesFilterState) => void
	onAutoLayout: () => void
	onToggleMinimap: () => void
	isLayouting: boolean
	showMinimap: boolean
	editorMode: PlacesEditorMode
	onEditorModeChange: (mode: PlacesEditorMode) => void
}

interface FilterToggleProps {
	active: boolean
	onClick: () => void
	icon: React.ReactNode
	label: string
	color: string
}

function FilterToggle({ active, onClick, icon, label, color }: FilterToggleProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						aria-label={`${active ? "Ocultar" : "Mostrar"} ${label}`}
						aria-pressed={active}
						onClick={onClick}
						className={cn(
							"border transition-all",
							active ? "bg-card border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
						)}
					/>
				}
			>
				<span style={{ color: active ? color : undefined }}>{icon}</span>
				<span className="hidden sm:inline">{label}</span>
			</TooltipTrigger>
			<TooltipContent>{active ? `Ocultar ${label}` : `Mostrar ${label}`}</TooltipContent>
		</Tooltip>
	)
}

export function GraphToolbar({
	filters,
	onFiltersChange,
	onAutoLayout,
	onToggleMinimap,
	isLayouting,
	showMinimap,
	editorMode,
	onEditorModeChange,
}: GraphToolbarProps) {
	const toggle = (key: keyof Omit<PlacesFilterState, "search">) => {
		onFiltersChange({ ...filters, [key]: !filters[key] })
	}

	return (
		<div className="flex items-center gap-2 flex-wrap">
			{/* Entity filters */}
			<div className="flex items-center gap-1 border border-border/60 rounded-md px-1.5 h-9 bg-background">
				<FilterToggle
					active={filters.showUnits}
					onClick={() => toggle("showUnits")}
					icon={<Building2 className="size-3.5" />}
					label="Unidades"
					color="var(--color-chart-1)"
				/>
				<FilterToggle
					active={filters.showKitchens}
					onClick={() => toggle("showKitchens")}
					icon={<ChefHat className="size-3.5" />}
					label="Cozinhas"
					color="var(--color-chart-2)"
				/>
				<FilterToggle
					active={filters.showMessHalls}
					onClick={() => toggle("showMessHalls")}
					icon={<Utensils className="size-3.5" />}
					label="Refeitórios"
					color="var(--color-chart-3)"
				/>
			</div>

			<Separator orientation="vertical" className="h-6" />

			{/* Search */}
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
				<Input
					placeholder="Buscar..."
					value={filters.search}
					onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
					className="pl-8 h-8 w-40 text-sm"
					aria-label="Buscar entidades no grafo"
				/>
			</div>

			<Separator orientation="vertical" className="h-6" />

			{/* Auto-layout */}
			<Tooltip>
				<TooltipTrigger
					render={<Button variant="outline" size="sm" onClick={onAutoLayout} disabled={isLayouting} aria-label="Organizar layout automaticamente" />}
				>
					{isLayouting ? <Loader2 className="size-3.5 animate-spin" /> : <LayoutDashboard className="size-3.5" />}
					<span className="hidden sm:inline">Auto-layout</span>
				</TooltipTrigger>
				<TooltipContent>Reorganizar posições automaticamente com ELK</TooltipContent>
			</Tooltip>

			{/* Minimap toggle */}
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant={showMinimap ? "secondary" : "outline"}
							size="sm"
							onClick={onToggleMinimap}
							aria-label={showMinimap ? "Ocultar minimapa" : "Mostrar minimapa"}
							aria-pressed={showMinimap}
						/>
					}
				>
					<MapIcon className="size-3.5" />
				</TooltipTrigger>
				<TooltipContent>{showMinimap ? "Ocultar minimapa" : "Mostrar minimapa"}</TooltipContent>
			</Tooltip>

			{/* Legend */}
			<GraphLegend />

			<div className="ml-auto flex items-center gap-2">
				<Separator orientation="vertical" className="h-6" />

				{/* Editor mode toggle */}
				<div className="flex items-center gap-1 border border-border/60 rounded-md p-0.5 h-9 bg-background">
					<Button
						variant={editorMode === "view" ? "secondary" : "ghost"}
						size="sm"
						onClick={() => onEditorModeChange("view")}
						aria-pressed={editorMode === "view"}
					>
						Visualizar
					</Button>
					<Button
						variant={editorMode === "edit" ? "default" : "ghost"}
						size="sm"
						onClick={() => onEditorModeChange("edit")}
						aria-pressed={editorMode === "edit"}
					>
						Editar
					</Button>
				</div>
			</div>
		</div>
	)
}
