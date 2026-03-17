import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Calendar, Package } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { ProductItemsManager } from "@/components/features/global/ProductItemsManager"
import { Badge } from "@/components/ui/badge"
import { foldersQueryOptions, productItemsQueryOptions, productQueryOptions } from "@/services/ProductsService"

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
			context.queryClient.ensureQueryData(foldersQueryOptions()),
		])
	},
	component: ProductDetailPage,
	head: () => ({
		meta: [{ title: "Itens de Compra - SISUB" }],
	}),
})

function ProductDetailPage() {
	const { productId } = Route.useParams()

	const { data: product } = useSuspenseQuery(productQueryOptions(productId))
	const { data: folders } = useSuspenseQuery(foldersQueryOptions())

	const folder = folders?.find((f) => f.id === product.folder_id)

	return (
		<div className="space-y-6">
			{/* Cabeçalho do produto */}
			<div className="flex items-start gap-3">
				<div className="flex items-center justify-center w-10 h-10 rounded-[var(--radius)] bg-primary/10 border border-primary/20 shrink-0 mt-0.5">
					<Package className="w-5 h-5 text-primary" />
				</div>
				<div className="min-w-0 space-y-2">
					<h1 className="text-2xl font-semibold">{product.description}</h1>
					<div className="flex items-center gap-1.5 flex-wrap">
						{product.measure_unit && (
							<Badge variant="outline">
								Unidade: <span className="font-mono ml-1">{product.measure_unit}</span>
							</Badge>
						)}
						{product.correction_factor && Number(product.correction_factor) !== 1 && (
							<Badge variant="outline">
								FC: <span className="font-mono ml-1">{product.correction_factor}</span>
							</Badge>
						)}
						{folder && <Badge variant="secondary">{folder.description}</Badge>}
					</div>
					<p className="text-xs text-muted-foreground flex items-center gap-1">
						<Calendar className="w-3 h-3" />
						Cadastrado em {new Date(product.created_at).toLocaleDateString("pt-BR")}
					</p>
				</div>
			</div>

			{/* Itens de compra */}
			<ProductItemsManager productId={productId} />
		</div>
	)
}
