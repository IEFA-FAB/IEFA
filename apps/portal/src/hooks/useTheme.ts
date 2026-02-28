import { useRouteContext } from "@tanstack/react-router"
import { Route as RootRoute } from "@/routes/__root"

export function useTheme() {
	const context = useRouteContext({ from: RootRoute.id })
	return context.theme
}
