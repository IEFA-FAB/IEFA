import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RecipesManager } from "@/components/features/admin/RecipesManager";

const recipesSearchSchema = z.object({
	search: z.string().optional(),
	type: z.enum(["all", "global", "local"]).optional(),
});

export const Route = createFileRoute("/_protected/admin/recipes/")({
	component: RecipesManager,
	validateSearch: recipesSearchSchema,
});
