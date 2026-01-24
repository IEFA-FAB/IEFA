import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/common/layout/PageHeader";
import { RecipesManager } from "@/components/features/admin/RecipesManager";

const recipesSearchSchema = z.object({
	search: z.string().optional(),
	type: z.enum(["all", "global", "local"]).optional(),
});

function RecipesPage() {
	return (
		<div className="min-h-screen">
			{/* Header */}
			<section className="container mx-auto max-w-screen-2xl px-4 py-8">
				<PageHeader
					title="Catálogo de Receitas"
					description="Gerencie fichas técnicas e insumos."
				/>
			</section>

			{/* Content Section with consistent padding matching admin index */}
			<section
				id="content"
				className="container mx-auto max-w-screen-2xl px-4 pb-10"
			>
				<RecipesManager />
			</section>
		</div>
	);
}

export const Route = createFileRoute("/_protected/admin/recipes/")({
	component: RecipesPage,
	validateSearch: recipesSearchSchema,
});
