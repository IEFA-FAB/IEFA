import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"

/**
 * Layout transparente para o módulo de anexos quantitativos do Termo de Referência (TR) da
 * unidade. Não é ata: a Ata de Registro de Preços (ARP) só existe depois da licitação
 * publicada e homologada, já com fornecedor, e é vinculada ao anexo na tela de detalhe.
 * Todas as sub-rotas (index, new, $quantityEstimateId) são renderizadas via Outlet.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/quantity-estimates")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: () => <Outlet />,
})
