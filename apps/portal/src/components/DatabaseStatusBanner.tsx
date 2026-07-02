import { queryOptions, useQuery } from "@tanstack/react-query"
import { WarningTriangle } from "iconoir-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { checkDatabaseStatusFn } from "@/server/database-status.fn"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

const databaseStatusQueryOptions = () =>
	queryOptions({
		queryKey: ["portal", "database-status"],
		queryFn: () => checkDatabaseStatusFn(),
		staleTime: 30_000,
		gcTime: 5 * 60_000,
		retry: false,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	})

export function DatabaseStatusBanner({ className }: { className?: string }) {
	const [isClient, setIsClient] = useState(false)

	useEffect(() => {
		setIsClient(true)
	}, [])

	const status = useQuery({
		...databaseStatusQueryOptions(),
		enabled: isClient,
	})

	if (!status.isError) {
		return null
	}

	return (
		<Alert
			variant="destructive"
			aria-live="assertive"
			className={cn("z-60 rounded-none border-x-0 border-t-0 border-destructive/25 bg-destructive/10 px-4 py-2.5 shadow-xs backdrop-blur-sm", className)}
		>
			<WarningTriangle className="size-4" aria-hidden="true" />
			<AlertTitle>Instabilidade no banco de dados</AlertTitle>
			<AlertDescription className="text-destructive/90">Existe instabilidade no banco de dados. O serviço está fora do ar temporariamente.</AlertDescription>
		</Alert>
	)
}
