import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppLayout } from "@/components/AppLayout"

export const Route = createFileRoute("/_public")({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<AppLayout>
			<Outlet />
		</AppLayout>
	)
}
