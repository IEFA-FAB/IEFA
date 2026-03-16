/**
 * ScopeSelector — Tela padronizada de seleção de escopo (refeitório / unidade / cozinha).
 *
 * Comportamento:
 *  - 0 itens → empty state
 *  - 1 item  → redirect automático via onSelect no mount
 *  - N itens → grid de cards clicáveis
 */

import type { LucideIcon } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export interface ScopeSelectorItem {
	id: number
	name: string
	subtitle?: string
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
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{Array.from({ length: 3 }).map((_, i) => (
				<div
					key={i}
					className="h-36 rounded-xl border border-border/50 bg-muted/20 animate-pulse"
				/>
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
		<div className="flex h-full flex-col items-center justify-center px-4 py-12">
			<div className="w-full max-w-4xl space-y-10">
				<div className="space-y-2 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
						<Icon className="h-7 w-7" />
					</div>
					<h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
					{description && <p className="text-muted-foreground">{description}</p>}
				</div>

				{isLoading || items.length === 1 ? (
					<ScopeSelectorSkeleton />
				) : items.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-16 text-center">
						<Icon className="h-12 w-12 text-muted-foreground/40" />
						<p className="text-base font-medium text-muted-foreground">{emptyTitle}</p>
						<p className="text-sm text-muted-foreground/70">{emptyDescription}</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{items.map((item) => (
							<Button
								key={item.id}
								type="button"
								onClick={() => onSelect(item.id)}
								className="group relative flex h-auto flex-col items-start gap-3 rounded-xl border border-border/50 bg-card p-6 text-left transition-all duration-200 hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								variant="outline"
							>
								<div className="flex shrink-0 h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
									<Icon className="h-5 w-5" />
								</div>
								<div>
									<p className="font-semibold text-foreground">{item.name}</p>
									{item.subtitle && (
										<p className="text-sm text-muted-foreground mt-0.5">{item.subtitle}</p>
									)}
								</div>
							</Button>
						))}
					</div>
				)}
			</div>
		</div>
	)
}
