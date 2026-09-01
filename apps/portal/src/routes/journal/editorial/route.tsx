import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { userProfileQueryOptions } from "@/lib/journal/hooks"

export const Route = createFileRoute("/journal/editorial")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })

		if (!auth.isAuthenticated || !auth.user) {
			throw redirect({
				to: "/auth",
				search: { redirect: location.href },
			})
		}

		const profile = await context.queryClient.query({ ...userProfileQueryOptions(auth.user.id), staleTime: "static" })

		if (profile?.role !== "editor") {
			throw redirect({
				to: "/journal",
			})
		}

		return { profile }
	},
	component: EditorialLayout,
})

function EditorialLayout() {
	return (
		<div className="container mx-auto max-w-7xl px-4 py-8">
			<Outlet />
		</div>
	)
}
