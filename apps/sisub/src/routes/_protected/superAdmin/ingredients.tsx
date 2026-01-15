import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProductsTreeManager } from "@/components/features/super-admin/ProductsTreeManager";
import { useAuth } from "@/hooks/auth/useAuth";
import { adminProfileQueryOptions } from "@/services/AdminService";
import { productsTreeQueryOptions } from "@/services/ProductsService";

/**
 * Rota: /superadmin/ingredients
 * ACL: Apenas Superadmin
 * Módulo: Gestão de Insumos (Fase 3)
 */
export const Route = createFileRoute("/_protected/superAdmin/ingredients")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth;

		if (!user?.id) {
			throw redirect({ to: "/auth" });
		}

		const profile = await context.queryClient.ensureQueryData(
			adminProfileQueryOptions(user.id),
		)

		if (profile?.role !== "superadmin") {
			throw redirect({ to: "/forecast" });
		}
	},
	loader: ({ context }) => {
		return context.queryClient.ensureQueryData(productsTreeQueryOptions());
	},
	component: IngredientsPage,
	head: () => ({
		meta: [
			{ title: "Gestão de Insumos - SISUB" },
			{
				name: "description",
				content:
					"Gerenciar hierarquia de produtos: pastas, produtos e itens de compra",
			},
		],
	}),
});

function IngredientsPage() {
	const { user } = useAuth();

	// Ensure data é carregado (suspense query via loader)
	useSuspenseQuery(productsTreeQueryOptions());

	if (!user) {
		return null;
	}

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section id="hero" className="border-b bg-muted/20">
				<div className="container mx-auto max-w-screen-2xl px-4 py-8 md:py-12">
					<div className="flex flex-col gap-4">
						<div>
							<h1 className="text-3xl font-bold tracking-tight md:text-4xl">
								Gestão de Insumos
							</h1>
							<p className="mt-2 text-lg text-muted-foreground">
								Gerenciar a hierarquia de produtos: pastas, produtos genéricos e
								itens de compra
							</p>
						</div>
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<span className="font-semibold">Acesso:</span>
							<span>Superadmin (SDAB)</span>
						</div>
					</div>
				</div>
			</section>

			{/* Conteúdo */}
			<section
				id="content"
				className="container mx-auto max-w-screen-2xl px-4 py-10 md:py-14"
			>
				<ProductsTreeManager />
			</section>
		</div>
	)
}
