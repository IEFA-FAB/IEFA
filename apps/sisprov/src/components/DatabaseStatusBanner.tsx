import { queryOptions, useQuery } from "@tanstack/react-query"
import { TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/cn"
import { checkDatabaseStatusFn } from "@/server/database-status.fn"

const databaseStatusQueryOptions = () =>
	queryOptions({
		queryKey: ["sisprov", "database-status"],
		queryFn: () => checkDatabaseStatusFn(),
		staleTime: 30_000,
		gcTime: 5 * 60_000,
		retry: false,
		refetchInterval: 30_000,
		refetchOnWindowFocus: true,
	})

/** Faixa de instabilidade do banco: falha da leitura de saúde nunca vira "lista vazia" nas telas. */
export function DatabaseStatusBanner({ className }: { className?: string }) {
	const [isClient, setIsClient] = useState(false)
	useEffect(() => {
		setIsClient(true)
	}, [])

	const status = useQuery({ ...databaseStatusQueryOptions(), enabled: isClient })
	if (!status.isError) return null

	return (
		<div
			role="alert"
			aria-live="assertive"
			className={cn("z-60 flex items-start gap-2 border-b border-destructive/25 bg-destructive/10 px-4 py-2.5 text-destructive", className)}
		>
			<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<div className="flex flex-col">
				<span className="text-subheading">Instabilidade no banco de dados</span>
				<span className="text-caption">O serviço está fora do ar temporariamente. O que você vê pode estar desatualizado.</span>
			</div>
		</div>
	)
}
