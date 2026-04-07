import type { RouteNavMeta } from "@/lib/command-palette"

declare module "@tanstack/router-core" {
	interface StaticDataRouteOption {
		nav?: RouteNavMeta
	}
}
