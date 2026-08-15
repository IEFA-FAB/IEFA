import type { LucideIcon } from "lucide-react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/cn"

/**
 * Linha de uma árvore virtualizada — recuo, conectores, chevron, ícone e slots.
 *
 * Existe porque duas telas de catálogo (insumos e preparações) precisam ser a MESMA
 * navegação: mesma indentação, mesmo conector, mesmo tamanho de ícone, mesmo alvo de
 * clique. Enquanto cada tela desenhava a própria linha, "parecidas" era uma
 * coincidência que a próxima edição desfazia.
 *
 * Só apresentação: quem monta a árvore (`lib/ingredient-tree`, `lib/recipe-tree`) e
 * quem executa as ações continuam fora daqui.
 */

/** Cores do ícone da linha. Sempre tokens semânticos (STYLE_CONTRACT §4.1). */
export interface TreeRowTone {
	iconBg: string
	iconColor: string
	border: string
}

/**
 * Cor da pasta por nível: 1 → governance (roxo) · 2 → success (verde) · 3+ → warning (amarelo).
 * Níveis acima do último reaproveitam o último tom.
 */
export const TREE_FOLDER_TONES: readonly TreeRowTone[] = [
	{ iconBg: "bg-governance/10 dark:bg-governance/20", iconColor: "text-governance", border: "border-governance/20" },
	{ iconBg: "bg-success/10 dark:bg-success/20", iconColor: "text-success", border: "border-success/20" },
	{ iconBg: "bg-warning/10 dark:bg-warning/20", iconColor: "text-warning", border: "border-warning/20" },
]

/** Folha do catálogo (insumo, preparação global): destaque com a cor primária. */
export const TREE_LEAF_TONE: TreeRowTone = { iconBg: "bg-primary/10 dark:bg-primary/20", iconColor: "text-primary", border: "border-primary/20" }

/** Folha sem destaque (ex.: preparação de uma cozinha, dentro do catálogo global). */
export const TREE_MUTED_TONE: TreeRowTone = { iconBg: "bg-muted/50", iconColor: "text-muted-foreground", border: "border-border/30" }

export function treeFolderTone(level: number): TreeRowTone {
	return TREE_FOLDER_TONES[Math.min(Math.max(level, 0), TREE_FOLDER_TONES.length - 1)]
}

/** Recuo horizontal de um nível, em px. Conectores e `paddingLeft` derivam daqui. */
const LEVEL_INDENT = 24

interface TreeRowProps {
	/** Profundidade 0-indexed. Define recuo, conectores e `aria-level`. */
	level: number
	/** Exibe o chevron; sem filhos, entra um espaçador do mesmo tamanho. */
	hasChildren?: boolean
	isExpanded?: boolean
	onToggle?: () => void
	icon: LucideIcon
	tone: TreeRowTone
	/** Rótulo, badges — tudo que fica à esquerda, depois do ícone. */
	children: ReactNode
	/** Ações da linha (editar, excluir…). Ocultas no modo de seleção em massa. */
	actions?: ReactNode
	/** Dado à direita (ex.: rendimento). Só leitura, então continua visível na seleção. */
	meta?: ReactNode
	/** Clique / Enter / Espaço na linha (navegar, por exemplo). */
	onActivate?: () => void
	/** Seleção em massa ativa: exibe checkbox e o clique passa a selecionar. */
	selectionMode?: boolean
	selected?: boolean
	onSelectChange?: (checked: boolean) => void
	/** Texto para o `aria-label` do checkbox e do chevron (o nome da entidade). */
	label: string
	className?: string
}

export function TreeRow({
	level,
	hasChildren = false,
	isExpanded = false,
	onToggle,
	icon: Icon,
	tone,
	children,
	actions,
	meta,
	onActivate,
	selectionMode = false,
	selected = false,
	onSelectChange,
	label,
	className,
}: TreeRowProps) {
	const isInteractive = selectionMode ? !!onSelectChange : !!onActivate
	const activate = selectionMode ? () => onSelectChange?.(!selected) : onActivate

	return (
		<div
			className={cn(
				"relative flex items-center justify-between px-2 py-2 hover:bg-muted/50 border-b border-border/50",
				isInteractive && "cursor-pointer",
				selected && "bg-primary/5",
				className
			)}
			style={{ paddingLeft: `${level * LEVEL_INDENT + 8}px` }}
			role="treeitem"
			tabIndex={0}
			aria-level={level + 1}
			aria-expanded={hasChildren ? isExpanded : undefined}
			aria-selected={selectionMode ? selected : undefined}
			onClick={isInteractive ? activate : undefined}
			onKeyDown={
				isInteractive
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault()
								activate?.()
							}
						}
					: undefined
			}
		>
			{/* Conectores da hierarquia */}
			{level > 0 && (
				<>
					<div className="absolute top-0 bottom-1/2 w-px bg-border/40" style={{ left: `${(level - 1) * LEVEL_INDENT + 20}px` }} />
					<div className="absolute top-1/2 h-px bg-border/40" style={{ left: `${(level - 1) * LEVEL_INDENT + 20}px`, width: "16px" }} />
				</>
			)}

			<div className="flex items-center gap-2 flex-1 min-w-0">
				{selectionMode && onSelectChange && (
					<Checkbox
						checked={selected}
						onCheckedChange={(checked) => onSelectChange(checked === true)}
						onClick={(e) => e.stopPropagation()}
						aria-label={`Selecionar ${label}`}
					/>
				)}

				{hasChildren ? (
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={(e) => {
							e.stopPropagation()
							onToggle?.()
						}}
						aria-label={isExpanded ? `Recolher ${label}` : `Expandir ${label}`}
					>
						{isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
					</Button>
				) : (
					<div className="w-5" />
				)}

				<div className={cn("flex items-center justify-center size-7 shrink-0 rounded-[var(--radius)] border", tone.iconBg, tone.border)}>
					<Icon className={cn("size-3.5", tone.iconColor)} />
				</div>

				{children}
			</div>

			{/* Ações somem no modo de seleção: ali o clique da linha pertence à seleção. O `meta`
			    fica — esconder um dado só de leitura por causa do modo não ajuda ninguém. */}
			{(meta || (actions && !selectionMode)) && (
				<div className="flex items-center gap-3 shrink-0 ml-3">
					{meta}
					{actions && !selectionMode && <div className="flex items-center gap-1">{actions}</div>}
				</div>
			)}
		</div>
	)
}
