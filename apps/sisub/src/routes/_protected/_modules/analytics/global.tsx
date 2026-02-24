import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { PageHeader } from "@/components/common/layout/PageHeader"
import IndicatorsCard from "@/components/features/super-admin/IndicatorsCard"
import { useAuth } from "@/hooks/auth/useAuth"
import { adminProfileQueryOptions } from "@/services/AdminService"

export const Route = createFileRoute("/_protected/_modules/analytics/global")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}

		const profile = await context.queryClient.ensureQueryData(adminProfileQueryOptions(user.id))

		if (profile?.role !== "superadmin") {
			throw redirect({ to: "/hub" })
		}
	},
	component: SuperAdminPanel,
	head: () => ({
		meta: [
			{ title: "Painel SuperAdmin" },
			{
				name: "description",
				content: "Controle o sistema de subsistência",
			},
		],
	}),
})

function SuperAdminPanel() {
	const { user } = useAuth()

	useSuspenseQuery(adminProfileQueryOptions(user?.id ?? ""))

	if (!user) {
		return null
	}

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section id="hero" className="container mx-auto max-w-screen-2xl px-4 pt-10">
				<PageHeader title="Análise Sistêmica" description="Controle o sistema de subsistência" />
			</section>

			{/* Conteúdo */}
			<section id="content" className="container mx-auto max-w-screen-2xl px-4 py-10 md:py-14">
				<div className="grid grid-cols-1 gap-6 lg:gap-8">
					<IndicatorsCard />
				</div>
			</section>
		</div>
	)
}
