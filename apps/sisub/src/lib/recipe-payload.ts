/**
 * Tradução da linha da ficha (forma do formulário, snake_case) para o corpo do server fn
 * (camelCase). Módulo PURO, sem import de `@/server/*`.
 *
 * Mora aqui, e não junto do hook de mutação, por causa do que ele arrasta: importar
 * `@/server/recipes.fn` puxa `env.server.ts`, que valida as variáveis de ambiente já na
 * carga do módulo. Um teste do mapeamento passava a exigir credencial do Supabase para
 * conferir renomeação de campo — e passava em silêncio na máquina de quem tem `.env` no
 * diretório do app, para quebrar no CI, que não tem.
 *
 * Este é o ponto cego entre o formulário e o domínio: campo novo esquecido aqui some sem
 * erro. O objeto vem de uma variável, então o TypeScript não faz checagem de propriedade
 * excedente, e teste de integração que chama a operation direto passa por cima. Foi assim
 * que os substitutos ficaram um PR inteiro sem chegar ao banco pela tela.
 */

import type { RecipeFormIngredient } from "@/types/domain/recipes"

export function mapIngredients(ingredients: RecipeFormIngredient[] | undefined) {
	return ingredients?.map((ing) => ({
		ingredientId: ing.ingredient_id,
		netQuantity: ing.net_quantity,
		isOptional: ing.is_optional,
		priorityOrder: ing.priority_order,
		correctionFactor: ing.correction_factor ?? null,
		rehydrationIndex: ing.rehydration_index ?? null,
		alternatives: ing.alternatives?.map((alt) => ({
			ingredientId: alt.ingredient_id,
			netQuantity: alt.net_quantity,
			priorityOrder: alt.priority_order,
		})),
	}))
}
