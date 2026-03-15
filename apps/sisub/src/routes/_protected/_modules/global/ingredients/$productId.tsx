import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Package } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { ProductItemsManager } from "@/components/features/global/ProductItemsManager"
import { Button } from "@/components/ui/button"
import { productItemsQueryOptions, productQueryOptions } from "@/services/ProductsService"

/**
 * Rota: /global/ingredients/$productId
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 * Responsabilidade: Gerenciar itens de compra de um insumo específico
 */
export const Route = createFileRoute("/_protected/_modules/global/ingredients/$productId")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 1),
	loader: ({ context, params }) => {
		return Promise.all([
			context.queryClient.ensureQueryData(productQueryOptions(params.productId)),
			context.queryClient.ensureQueryData(productItemsQueryOptions(params.productId)),
		])
	},
	component: ProductDetailPage,
	head: () => ({
		meta: [{ title: "Itens de Compra - SISUB" }],
	}),
})

function ProductDetailPage() {
	const { productId } = Route.useParams()
	const navigate = useNavigate()

	const { data: product } = useSuspenseQuery(productQueryOptions(productId))

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start gap-4">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => navigate({ to: "/global/ingredients" })}
					className="mt-0.5 gap-2 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="w-4 h-4" />
					Insumos
				</Button>
			</div>

			<div className="flex items-center gap-3">
				<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20">
					<Package className="w-5 h-5 text-blue-600 dark:text-blue-500" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold">{product.description}</h1>
					<p className="text-sm text-muted-foreground">
						Unidade: <span className="font-mono">{product.measure_unit}</span>
						{product.correction_factor && Number(product.correction_factor) !== 1 && (
							<>
								{" · "}Fator de correção:{" "}
								<span className="font-mono">{product.correction_factor}</span>
							</>
						)}
					</p>
				</div>
			</div>

			{/* Itens de compra */}
			<ProductItemsManager productId={productId} />
		</div>
	)
}
