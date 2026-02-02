import { Button } from "@iefa/ui"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { DownloadIcon } from "lucide-react"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { ProductsTreeManager } from "@/components/features/super-admin/ProductsTreeManager"
import { useAuth } from "@/hooks/auth/useAuth"
import { useExportProductsCSV } from "@/hooks/business/useExportProductsCSV"
import { adminProfileQueryOptions } from "@/services/AdminService"
import { productsTreeQueryOptions } from "@/services/ProductsService"

/**
 * Rota: /superadmin/ingredients
 * ACL: Apenas Superadmin
 * Módulo: Gestão de Insumos (Fase 3)
 */
export const Route = createFileRoute("/_protected/superAdmin/ingredients")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}

		const profile = await context.queryClient.ensureQueryData(adminProfileQueryOptions(user.id))

		if (profile?.role !== "superadmin") {
			throw redirect({ to: "/forecast" })
		}
	},
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
	const { user } = useAuth()
	const { exportCSV } = useExportProductsCSV()

	// Ensure data é carregado (suspense query via loader)
	useSuspenseQuery(productsTreeQueryOptions())

	if (!user) {
		return null
	}

	return (
		<div className="min-h-screen">
			{/* Header */}
			<section className="container mx-auto max-w-screen-2xl px-4 py-8 md:py-10">
				<PageHeader
					title="Gestão de Insumos"
					description="Gerenciar a hierarquia de produtos: pastas, produtos genéricos e itens de compra"
				>
					<Button
						variant="outline"
						size="sm"
						onClick={exportCSV}
						className="gap-2 transition-all active:scale-[0.98]"
					>
						<DownloadIcon className="h-4 w-4" />
						Exportar CSV
					</Button>
				</PageHeader>
			</section>

			{/* Conteúdo */}
			<section id="content" className="container mx-auto max-w-screen-2xl px-4 pb-10 md:pb-14">
				{/* Tree View */}
				<ProductsTreeManager />
			</section>
		</div>
	)
}
