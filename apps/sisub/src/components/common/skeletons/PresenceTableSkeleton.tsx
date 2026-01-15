import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui";
import { Users } from "lucide-react";

export function PresenceTableSkeleton() {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Users className="h-5 w-5" aria-hidden="true" />
					Análise de Presenças
				</CardTitle>
				<CardDescription>
					Comparação entre previsões e presenças por dia, refeição e rancho
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" />
								<TableHead>Data</TableHead>
								<TableHead>Rancho</TableHead>
								<TableHead>Refeição</TableHead>
								<TableHead className="text-center">Previsto</TableHead>
								<TableHead className="text-center">Presença</TableHead>
								<TableHead className="text-center">Diferença</TableHead>
								<TableHead className="text-center">Taxa</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...Array(5)].map((_, i) => (
								<TableRow key={`skeleton-row-${i}`}>
									<TableCell>
										<div className="h-4 w-4 bg-muted animate-pulse rounded" />
									</TableCell>
									<TableCell>
										<div className="space-y-2">
											<div className="h-4 w-16 bg-muted animate-pulse rounded" />
											<div className="h-3 w-12 bg-muted animate-pulse rounded" />
										</div>
									</TableCell>
									<TableCell>
										<div className="h-4 w-24 bg-muted animate-pulse rounded" />
									</TableCell>
									<TableCell>
										<div className="h-6 w-16 bg-muted animate-pulse rounded-md" />
									</TableCell>
									<TableCell className="text-center">
										<div className="h-4 w-8 bg-muted animate-pulse rounded mx-auto" />
									</TableCell>
									<TableCell className="text-center">
										<div className="h-4 w-8 bg-muted animate-pulse rounded mx-auto" />
									</TableCell>
									<TableCell className="text-center">
										<div className="h-4 w-8 bg-muted animate-pulse rounded mx-auto" />
									</TableCell>
									<TableCell className="text-center">
										<div className="h-4 w-12 bg-muted animate-pulse rounded mx-auto" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<div className="mt-4 flex justify-center">
					<div className="h-4 w-48 bg-muted animate-pulse rounded" />
				</div>
			</CardContent>
		</Card>
	);
}
