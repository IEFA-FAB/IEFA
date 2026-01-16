import { Button } from "@iefa/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { ProductsTreeManager } from "@/components/features/super-admin/ProductsTreeManager";
import { useAuth } from "@/hooks/auth/useAuth";
import { useExportProductsCSV } from "@/hooks/business/useExportProductsCSV";
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
		);

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
	const { exportCSV } = useExportProductsCSV();

	// Ensure data é carregado (suspense query via loader)
	useSuspenseQuery(productsTreeQueryOptions());

	if (!user) {
		return null;
	}

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section
				id="hero"
				className="relative border-b bg-gradient-to-br from-muted/30 via-background to-muted/20 overflow-hidden"
			>
				{/* Subtle dot pattern background */}
				<div className="absolute inset-0 bg-dot-pattern opacity-[0.03] -z-10" />

				<div className="container mx-auto max-w-screen-2xl px-4 py-8 md:py-12 lg:py-16">
					<div className="flex flex-col gap-4 md:gap-6">
						<div className="space-y-2 md:space-y-3">
							<h1 className="font-sans font-bold text-3xl md:text-4xl lg:text-5xl tracking-tight">
								Gestão de Insumos
							</h1>
							<p className="mt-2 text-base md:text-lg leading-relaxed text-muted-foreground max-w-3xl">
								Gerenciar a hierarquia de produtos: pastas, produtos genéricos e
								itens de compra
							</p>
						</div>
						<div className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
							<span className="font-sans font-medium">Acesso:</span>
							<span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/10 text-primary font-mono text-xs md:text-sm tracking-wide border border-primary/20">
								Superadmin (SDAB)
							</span>
						</div>
					</div>
				</div>
			</section>

			{/* Conteúdo */}
			<section
				id="content"
				className="container mx-auto max-w-screen-2xl px-4 py-10 md:py-14"
			>
				{/* Toolbar */}
				<div className="mb-6 flex justify-end">
					{/* Export Button */}
					<Button
						variant="outline"
						size="sm"
						onClick={exportCSV}
						className="gap-2 transition-all active:scale-[0.98]"
					>
						<DownloadIcon className="h-4 w-4" />
						Exportar CSV
					</Button>
				</div>

				{/* Tree View */}
				<ProductsTreeManager />
			</section>
		</div>
	);
}
