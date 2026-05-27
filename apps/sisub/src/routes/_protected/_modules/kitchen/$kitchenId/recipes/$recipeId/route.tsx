import { createFileRoute, Outlet } from "@tanstack/react-router"
import { ModuleNotFound } from "@/components/layout/errors/ModuleNotFound"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId")({
	component: () => <Outlet />,
	notFoundComponent: ModuleNotFound,
})
