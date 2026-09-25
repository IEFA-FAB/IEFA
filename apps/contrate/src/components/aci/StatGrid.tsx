import type { ReactNode } from "react"

/**
 * Tiles de contagem — a mesma grade em todas as telas do α.
 *
 * `gap-px` sobre `bg-border` é o que desenha as divisórias sem borda por
 * célula, no espírito border-first do contrato do portal.
 */
export function StatGrid({
	items,
	tone = "background",
	className = "",
}: {
	items: ReadonlyArray<readonly [string, ReactNode]>
	/** `card` no relatório (superfície elevada), `background` nas telas de lista. */
	tone?: "background" | "card"
	className?: string
}) {
	const surface = tone === "card" ? "bg-card p-3" : "bg-background p-4"
	const value = tone === "card" ? "text-xl" : "text-2xl"

	return (
		<dl className={`grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4 ${className}`}>
			{items.map(([label, content]) => (
				<div key={label} className={surface}>
					<dt className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{label}</dt>
					<dd className={`mt-1 font-semibold tabular-nums ${value}`}>{content}</dd>
				</div>
			))}
		</dl>
	)
}
