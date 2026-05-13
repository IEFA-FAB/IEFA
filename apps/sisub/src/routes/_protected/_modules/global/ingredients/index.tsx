import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { IngredientsTreeManager } from "@/components/features/global/IngredientsTreeManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useExportIngredientsCSV } from "@/hooks/business/useExportIngredientsCSV"
import { ingredientsTreeQueryOptions } from "@/services/IngredientsService"

/**
 * Rota: /global/ingredients
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 */
export const Route = createFileRoute("/_protected/_modules/global/ingredients/")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	loader: ({ context }) => {
		return context.queryClient.ensureQueryData(ingredientsTreeQueryOptions())
	},
	component: IngredientsPage,
	head: () => ({
		meta: [
			{ title: "Gestão de Insumos - SISUB" },
			{
				name: "description",
				content: "Gerenciar hierarquia de produtos: pastas, produtos e itens de compra",
			},
		],
	}),
})

function IngredientsPage() {
	const { exportCSV } = useExportIngredientsCSV()

	// Ensure data é carregado (suspense query via loader)
	useSuspenseQuery(ingredientsTreeQueryOptions())

	return (
		<div className="space-y-6">
			<PageHeader title="Gestão de Insumos">
				<Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
					<DownloadIcon className="h-4 w-4" />
					Exportar CSV
				</Button>
			</PageHeader>
			<IngredientsTreeManager />
		</div>
	)
}
