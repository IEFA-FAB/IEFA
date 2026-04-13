export function DashboardSkeleton() {
	return (
		<div className="space-y-8 animate-pulse">
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-20 rounded-lg border bg-muted" />
				))}
			</div>
			<div className="space-y-3">
				<div className="h-5 w-40 rounded bg-muted" />
				<div className="h-28 rounded-lg border bg-muted" />
			</div>
			<div className="space-y-3">
				<div className="h-5 w-48 rounded bg-muted" />
				<div className="h-52 rounded-lg border bg-muted" />
			</div>
		</div>
	)
}
