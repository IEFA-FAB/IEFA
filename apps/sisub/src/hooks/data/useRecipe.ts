import { useQuery } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import type { RecipeWithIngredients } from "@/types/domain/recipes";

export function useRecipe(id: string | undefined) {
	return useQuery({
		queryKey: ["recipe", id],
		queryFn: async () => {
			if (!id) return null;

			const { data, error } = await supabase
				.from("recipes")
				.select(`
          *,
          ingredients:recipe_ingredients(
            *,
            product:product(*),
            alternatives:recipe_ingredient_alternatives(
              *,
              product:product(*)
            )
          )
        `)
				.eq("id", id)
				.single();

			if (error) throw error;
			return data as RecipeWithIngredients;
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}
