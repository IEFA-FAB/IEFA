import { cn } from "@/lib/utils"

type SectionLabelProps = {
	index: string
	label: string
	className?: string
}

function SectionLabel({ index, label, className }: SectionLabelProps) {
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<span className="font-mono text-xs text-muted-foreground tabular-nums">{index}</span>
			<div className="h-px w-6 bg-border" />
			<span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">{label}</span>
		</div>
	)
}

export type { SectionLabelProps }
export { SectionLabel }
