import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

export function DayCardSkeleton() {
	return (
		<Card className="w-80 shrink-0">
			<CardHeader className="pb-3">
				<div className="flex items-center gap-4">
					<div className="flex flex-col items-center gap-1">
						<Skeleton className="h-12 w-10" />
						<Skeleton className="h-3 w-7" />
					</div>
					<Separator orientation="vertical" className="h-12" />
					<Skeleton className="h-10 w-20" />
				</div>
			</CardHeader>

			<CardContent className="flex flex-col gap-3">
				{/* Selector + icon buttons skeleton */}
				<div className="flex items-center gap-2">
					<Skeleton className="flex-1 h-8" />
					<Skeleton className="size-7" />
					<Skeleton className="size-7" />
				</div>

				{/* Meals grid skeleton */}
				<div className="grid grid-cols-2 gap-2">
					{[...Array(4)].map((_, i) => (
						<Skeleton key={i} className="h-16" />
					))}
				</div>
			</CardContent>
		</Card>
	)
}
