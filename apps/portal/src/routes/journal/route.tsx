import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppLayout } from "@/components/AppLayout"

export const Route = createFileRoute("/journal")({
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<AppLayout>
			<Outlet />
		</AppLayout>
	)
}
