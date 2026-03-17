import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { ProductsTreeManager } from "@/components/features/global/ProductsTreeManager"
import { Button } from "@/components/ui/button"
import { useExportProductsCSV } from "@/hooks/business/useExportProductsCSV"
import { productsTreeQueryOptions } from "@/services/ProductsService"

/**
 * Rota: /global/ingredients
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 */
export const Route = createFileRoute("/_protected/_modules/global/ingredients/")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	loader: ({ context }) => {
		return context.queryClient.ensureQueryData(productsTreeQueryOptions())
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
	const { exportCSV } = useExportProductsCSV()

	// Ensure data é carregado (suspense query via loader)
	useSuspenseQuery(productsTreeQueryOptions())

	return (
		<div className="space-y-6">
			<PageHeader title="Gestão de Insumos">
				<Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
					<DownloadIcon className="h-4 w-4" />
					Exportar CSV
				</Button>
			</PageHeader>
			<ProductsTreeManager />
		</div>
	)
}
