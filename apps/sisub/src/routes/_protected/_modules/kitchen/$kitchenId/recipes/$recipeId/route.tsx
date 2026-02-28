import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/$recipeId")({
	component: () => <Outlet />,
})
