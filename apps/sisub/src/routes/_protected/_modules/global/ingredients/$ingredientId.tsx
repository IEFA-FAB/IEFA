import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { IngredientDetailForm } from "@/components/features/global/IngredientDetailForm"
import {
	ceafaQueryOptions,
	foldersQueryOptions,
	ingredientNutrientsQueryOptions,
	ingredientQueryOptions,
	nutrientsQueryOptions,
} from "@/services/IngredientsService"

/**
 * Rota: /global/ingredients/$ingredientId
 * ACL: módulo "global" nível 1+ (GLOBAL-01)
 * Responsabilidade: Visualizar e editar dados completos de um insumo
 */
// Aba ativa do formulário de detalhe (?tab=) — persistida na URL, compartilhável.
const searchSchema = z.object({
	tab: z.string().optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/ingredients/$ingredientId")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	loader: ({ context, params }) => {
		return Promise.all([
			context.queryClient.ensureQueryData(ingredientQueryOptions(params.ingredientId)),
			context.queryClient.ensureQueryData(foldersQueryOptions()),
			context.queryClient.ensureQueryData(nutrientsQueryOptions()),
			context.queryClient.ensureQueryData(ingredientNutrientsQueryOptions(params.ingredientId)),
			context.queryClient.ensureQueryData(ceafaQueryOptions("")),
		])
	},
	component: IngredientDetailPage,
	head: () => ({
		meta: [{ title: "Insumo - SISUB" }],
	}),
})

function IngredientDetailPage() {
	const { ingredientId } = Route.useParams()

	const { data: ingredient } = useSuspenseQuery(ingredientQueryOptions(ingredientId))
	const { data: folders } = useSuspenseQuery(foldersQueryOptions())

	return <IngredientDetailForm ingredient={ingredient} folders={folders} />
}
