import { CalendarRange, Folder, FolderOpen, Sandwich } from "lucide-react"
import { type ReactNode, useState } from "react"
import { SnackStandardBadges } from "@/components/features/local/planning/SnackStandardBadges"
import { Badge } from "@/components/ui/badge"
import { TREE_LEAF_TONE, TREE_MUTED_TONE, TreeRow, treeFolderTone } from "@/components/ui/tree-row"
import { cn } from "@/lib/cn"
import { buildCatalogTree, type CatalogFolder, type CatalogTreeRow } from "@/lib/template-catalog-tree"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

export type CatalogFolderRow = Extract<CatalogTreeRow<TemplateWithItemCounts>, { type: "folder" }>

interface TemplateCatalogTreeProps {
	templateType: "event" | "apoio"
	folders: readonly CatalogFolder[] | undefined
	templates: readonly TemplateWithItemCounts[]
	/** Ações do modelo (editar, adaptar…). */
	templateActions?: (template: TemplateWithItemCounts) => ReactNode
	/** Ações da pasta (nova subpasta, editar…); só quem escreve no catálogo. */
	folderActions?: (row: CatalogFolderRow) => ReactNode
	/** Seleção de modelos (montar evento na cozinha). */
	selection?: { selectedIds: ReadonlySet<string>; onChange: (templateId: string, checked: boolean) => void }
	/** Clique no modelo (abrir o editor). */
	onOpenTemplate?: (template: TemplateWithItemCounts) => void
}

/**
 * Catálogo global de eventos ou cardápios de apoio em árvore: pastas da SDAB (padrão → formato;
 * família → classe) e os modelos dentro delas. Abre tudo expandido, como a SDAB desenhou; a mesma
 * linha (`TreeRow`) das árvores de insumos e preparações.
 */
export function TemplateCatalogTree({ templateType, folders, templates, templateActions, folderActions, selection, onOpenTemplate }: TemplateCatalogTreeProps) {
	// `null` = tudo aberto. Recolher guarda o que ficou aberto.
	const [expanded, setExpanded] = useState<ReadonlySet<string> | null>(null)
	const rows = buildCatalogTree({ folders, templates, expanded })
	const LeafIcon = templateType === "apoio" ? Sandwich : CalendarRange

	const toggle = (id: string) =>
		setExpanded((current) => {
			const open = new Set(current ?? rows.filter((r) => r.type === "folder").map((r) => r.id))
			if (open.has(id)) open.delete(id)
			else open.add(id)
			return open
		})

	return (
		<div className="rounded-md border" role="tree" aria-label={templateType === "apoio" ? "Cardápios de apoio por pasta" : "Eventos por pasta"}>
			{rows.map((row) => {
				if (row.type === "folder") {
					return (
						<TreeRow
							key={row.id}
							level={row.level}
							hasChildren={row.hasChildren}
							isExpanded={row.isExpanded}
							onToggle={() => toggle(row.id)}
							onActivate={row.hasChildren ? () => toggle(row.id) : undefined}
							icon={row.isExpanded && row.hasChildren ? FolderOpen : Folder}
							tone={row.isUnfiled ? TREE_MUTED_TONE : treeFolderTone(row.level)}
							label={row.label}
							actions={folderActions && !row.isUnfiled ? folderActions(row) : undefined}
						>
							<div className="min-w-0 flex-1 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
								<span className={cn("text-sm truncate", row.level === 0 && "font-bold uppercase tracking-wide", row.isUnfiled && "text-muted-foreground")}>
									{row.label}
								</span>
								{row.folder?.description && <span className="text-xs text-muted-foreground truncate">{row.folder.description}</span>}
							</div>
							<Badge variant="outline" className="shrink-0">
								{row.templateCount} {row.templateCount === 1 ? "modelo" : "modelos"}
							</Badge>
						</TreeRow>
					)
				}
				const template = row.template
				return (
					<TreeRow
						key={row.id}
						level={row.level}
						icon={LeafIcon}
						tone={TREE_LEAF_TONE}
						label={template.name ?? "Modelo"}
						selectionMode={!!selection}
						selected={selection?.selectedIds.has(template.id) ?? false}
						onSelectChange={selection ? (checked) => selection.onChange(template.id, checked) : undefined}
						onActivate={onOpenTemplate ? () => onOpenTemplate(template) : undefined}
						meta={
							<span className="text-xs text-muted-foreground tabular-nums">
								{template.recipe_count || 0} {template.recipe_count === 1 ? "preparação" : "preparações"}
							</span>
						}
						actions={templateActions?.(template)}
					>
						<div className="min-w-0 flex-1">
							<p className="text-sm truncate">{template.name}</p>
							{template.description && <p className="text-xs text-muted-foreground truncate">{template.description}</p>}
							{templateType === "apoio" && <SnackStandardBadges template={template} />}
						</div>
					</TreeRow>
				)
			})}
		</div>
	)
}
