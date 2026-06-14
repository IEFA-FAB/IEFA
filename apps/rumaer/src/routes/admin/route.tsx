import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { AppLayout } from "@/components/AppLayout"

export const Route = createFileRoute("/admin")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: () => (
		<AppLayout>
			<Outlet />
		</AppLayout>
	),
})
