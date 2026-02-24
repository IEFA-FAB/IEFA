import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import DashboardCard from "@/components/features/admin/DashboardCard"
import { useAuth } from "@/hooks/auth/useAuth"
import { adminProfileQueryOptions } from "@/services/AdminService"

export const Route = createFileRoute("/_protected/_modules/analytics/local")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}

		const profile = await context.queryClient.ensureQueryData(adminProfileQueryOptions(user.id))

		const isAuthorized = profile?.role === "admin" || profile?.role === "superadmin"

		if (!isAuthorized) {
			throw redirect({ to: "/hub" })
		}
	},
	component: LocalAnalyticsPage,
	head: () => ({
		meta: [{ title: "Análise Local" }, { name: "description", content: "Análises da sua unidade" }],
	}),
})

function LocalAnalyticsPage() {
	const { user } = useAuth()
	const { data: profile } = useSuspenseQuery(adminProfileQueryOptions(user?.id ?? ""))

	return (
		<div className="p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">Análise Local</h1>
				<p className="text-muted-foreground">Visão geral de métricas e indicadores da sua unidade.</p>
			</div>

			<DashboardCard profile={profile} />
		</div>
	)
}
