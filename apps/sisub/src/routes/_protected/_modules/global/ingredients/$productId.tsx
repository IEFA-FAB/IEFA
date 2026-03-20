import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { ProductDetailForm } from "@/components/features/global/ProductDetailForm"
import { ceafaQueryOptions, foldersQueryOptions, nutrientsQueryOptions, productNutrientsQueryOptions, productQueryOptions } from "@/services/ProductsService"

/**
 * Rota: /global/ingredients/$productId
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 * Responsabilidade: Visualizar e editar dados completos de um insumo
 */
export const Route = createFileRoute("/_protected/_modules/global/ingredients/$productId")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	loader: ({ context, params }) => {
		return Promise.all([
			context.queryClient.ensureQueryData(productQueryOptions(params.productId)),
			context.queryClient.ensureQueryData(foldersQueryOptions()),
			context.queryClient.ensureQueryData(nutrientsQueryOptions()),
			context.queryClient.ensureQueryData(productNutrientsQueryOptions(params.productId)),
			context.queryClient.ensureQueryData(ceafaQueryOptions("")),
		])
	},
	component: ProductDetailPage,
	head: () => ({
		meta: [{ title: "Insumo - SISUB" }],
	}),
})

function ProductDetailPage() {
	const { productId } = Route.useParams()

	const { data: product } = useSuspenseQuery(productQueryOptions(productId))
	const { data: folders } = useSuspenseQuery(foldersQueryOptions())

	return <ProductDetailForm product={product} folders={folders} />
}
