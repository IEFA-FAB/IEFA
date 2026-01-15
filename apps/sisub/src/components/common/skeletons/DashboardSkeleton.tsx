import { Card, CardContent, CardHeader } from "@iefa/ui";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			{/* Filters Skeleton */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1 space-y-2">
					<div className="h-4 w-20 bg-muted animate-pulse rounded" />
					<div className="h-10 bg-muted animate-pulse rounded" />
				</div>
				<div className="space-y-2">
					<div className="h-4 w-20 bg-muted animate-pulse rounded" />
					<div className="h-10 w-48 bg-muted animate-pulse rounded" />
				</div>
			</div>

			{/* Tabs Skeleton */}
			<div className="space-y-4">
				<div className="flex gap-2">
					<div className="h-10 w-32 bg-muted animate-pulse rounded" />
					<div className="h-10 w-32 bg-muted animate-pulse rounded" />
					<div className="h-10 w-32 bg-muted animate-pulse rounded" />
				</div>

				{/* Content Skeleton */}
				<div className="space-y-6">
					{/* Metrics Grid */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						{[...Array(4)].map((_, i) => (
							<Card key={i} className="border-2">
								<CardHeader className="space-y-2">
									<div className="h-4 w-24 bg-muted animate-pulse rounded" />
									<div className="h-8 w-16 bg-muted animate-pulse rounded" />
								</CardHeader>
							</Card>
						))}
					</div>

					{/* Chart Skeleton */}
					<Card className="border-2">
						<CardHeader>
							<div className="h-6 w-48 bg-muted animate-pulse rounded" />
						</CardHeader>
						<CardContent>
							<div className="h-64 bg-muted animate-pulse rounded" />
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
