/**
 * ScopeSelector — Tela padronizada de seleção de escopo (refeitório / unidade / cozinha).
 *
 * Comportamento:
 *  - 0 itens → empty state
 *  - 1 item  → redirect automático via onSelect no mount
 *  - N itens → grid scrollável de cards clicáveis
 *
 * Layout top-aligned — scroll natural via <main> pai do AppShell.
 */

import { ChevronRight, type LucideIcon } from "lucide-react"
import { useEffect } from "react"

export interface ScopeSelectorItem {
	id: number
	name: string
	subtitle?: string
	/** Metadado contextual exibido abaixo do nome (ex: nome da unidade associada). */
	meta?: string
}

interface ScopeSelectorProps {
	title: string
	description?: string
	icon: LucideIcon
	items: ScopeSelectorItem[]
	isLoading: boolean
	onSelect: (id: number) => void
	emptyTitle?: string
	emptyDescription?: string
}

function ScopeSelectorSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{Array.from({ length: 6 }).map((_, i) => (
				<div key={i} className="h-17 rounded-lg border border-border/30 bg-muted/15 animate-pulse" />
			))}
		</div>
	)
}

export function ScopeSelector({
	title,
	description,
	icon: Icon,
	items,
	isLoading,
	onSelect,
	emptyTitle = "Nenhum item disponível",
	emptyDescription = "Você não tem permissão para acessar nenhum item.",
}: ScopeSelectorProps) {
	// Auto-redirect quando há apenas uma opção disponível
	useEffect(() => {
		if (!isLoading && items.length === 1) {
			onSelect(items[0].id)
		}
	}, [isLoading, items, onSelect])

	return (
		<div className="space-y-6">
			{/* ── Header ──────────────────────────────────────── */}
			<header className="border-b border-border/60 pb-4">
				<div className="flex items-center gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Icon className="size-4.5" />
					</div>
					<div className="min-w-0">
						<h1 className="text-lg font-semibold tracking-tight text-foreground leading-tight">{title}</h1>
						{description && <p className="text-sm text-muted-foreground leading-snug">{description}</p>}
					</div>
				</div>
			</header>

			{/* ── Content ─────────────────────────────────────── */}
			{isLoading || items.length === 1 ? (
				<ScopeSelectorSkeleton />
			) : items.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-16 text-center">
					<Icon className="size-10 text-muted-foreground/25" />
					<p className="text-sm font-medium text-muted-foreground">{emptyTitle}</p>
					<p className="text-xs text-muted-foreground/60 max-w-xs">{emptyDescription}</p>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{items.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => onSelect(item.id)}
							className="group flex items-center gap-3 rounded-lg border border-border/50 bg-card px-4 py-3 text-left transition-colors hover:border-primary/25 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none cursor-pointer"
						>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-foreground leading-tight">{item.name}</p>
								{item.subtitle && <p className="text-xs text-muted-foreground leading-snug mt-0.5">{item.subtitle}</p>}
								{item.meta && <p className="text-xs text-muted-foreground/60 leading-snug mt-1">{item.meta}</p>}
							</div>
							<ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:text-muted-foreground/70 group-hover:translate-x-0.5" />
						</button>
					))}
				</div>
			)}
		</div>
	)
}
