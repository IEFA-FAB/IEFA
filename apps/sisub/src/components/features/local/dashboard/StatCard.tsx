import { Card, CardContent } from "@/components/ui/card"

export function StatCard({
	icon: Icon,
	label,
	value,
	sub,
	variant = "default",
}: {
	icon: React.ElementType
	label: string
	value: number | string
	sub?: string
	variant?: "default" | "warning" | "danger" | "success"
}) {
	const iconColors = {
		default: "text-muted-foreground",
		warning: "text-amber-500",
		danger: "text-destructive",
		success: "text-green-600",
	}
	const valueColors = {
		default: "text-foreground",
		warning: "text-amber-600",
		danger: "text-destructive",
		success: "text-green-700",
	}

	return (
		<Card>
			<CardContent className="flex items-center gap-4 py-5">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
					<Icon className={`h-5 w-5 ${iconColors[variant]}`} />
				</div>
				<div className="min-w-0">
					<p className="text-xs text-muted-foreground truncate">{label}</p>
					<p className={`text-2xl font-bold tabular-nums leading-none mt-0.5 ${valueColors[variant]}`}>{value}</p>
					{sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
				</div>
			</CardContent>
		</Card>
	)
}
