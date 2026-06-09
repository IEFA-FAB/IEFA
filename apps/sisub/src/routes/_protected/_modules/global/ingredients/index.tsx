import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon, PackagePlus } from "lucide-react"
import { useRef } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { IngredientsTreeManager, type IngredientsTreeManagerHandle } from "@/components/features/global/IngredientsTreeManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useExportIngredientsCSV } from "@/hooks/business/useExportIngredientsCSV"
import { ingredientsTreeQueryOptions } from "@/services/IngredientsService"

/**
 * Rota: /global/ingredients
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 */
const searchSchema = z.object({
	search: z.string().optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/ingredients/")({
	validateSearch: searchSchema,
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
	const managerRef = useRef<IngredientsTreeManagerHandle>(null)

	// Ensure data é carregado (suspense query via loader)
	useSuspenseQuery(ingredientsTreeQueryOptions())

	return (
		<div className="space-y-6">
			<PageHeader title="Gestão de Insumos">
				<Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
					<DownloadIcon className="size-4" />
					Exportar CSV
				</Button>
				<Button size="sm" onClick={() => managerRef.current?.openCreateIngredient()} className="gap-2">
					<PackagePlus className="size-4" />
					Novo Insumo
				</Button>
			</PageHeader>
			<IngredientsTreeManager ref={managerRef} />
		</div>
	)
}
