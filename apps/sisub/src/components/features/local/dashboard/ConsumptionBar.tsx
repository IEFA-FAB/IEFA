import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress"

export function ConsumptionBar({ pct }: { pct: number }) {
	const color = pct >= 100 ? "bg-destructive" : pct >= 90 ? "bg-destructive/80" : pct >= 80 ? "bg-amber-500" : "bg-primary"
	return (
		<div className="flex items-center gap-2 min-w-[120px]">
			<Progress value={pct} className="flex-1">
				<ProgressTrack className="h-1.5">
					<ProgressIndicator className={color} />
				</ProgressTrack>
			</Progress>
			<span className={`text-xs tabular-nums font-medium w-9 text-right ${pct >= 90 ? "text-destructive" : pct >= 80 ? "text-amber-600" : "text-foreground"}`}>
				{pct}%
			</span>
		</div>
	)
}
