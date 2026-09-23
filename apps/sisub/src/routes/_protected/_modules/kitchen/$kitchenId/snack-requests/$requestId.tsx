import { createFileRoute, useParams } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { KitchenSnackRequestDetail } from "@/components/features/local/snack-requests/KitchenSnackRequestDetail"

/**
 * KITCHEN — Detalhe de um pedido de Lanche de Bordo/Apoio.
 * URL: /kitchen/:kitchenId/snack-requests/:requestId
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/snack-requests/$requestId")({
	beforeLoad: (opts) => requirePermission(opts, "kitchen", 1),
	component: KitchenSnackRequestPage,
	head: () => ({
		meta: [{ title: "Pedido de Lanche - SISUB" }],
	}),
})

function KitchenSnackRequestPage() {
	const { kitchenId: kitchenIdStr, requestId } = useParams({ strict: false })
	return <KitchenSnackRequestDetail kitchenId={Number(kitchenIdStr)} kitchenIdStr={kitchenIdStr as string} requestId={requestId as string} />
}
