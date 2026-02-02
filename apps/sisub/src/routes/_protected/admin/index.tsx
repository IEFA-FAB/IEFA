import { Card, CardDescription, CardHeader, CardTitle } from "@iefa/ui"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Calendar, ChefHat, ShoppingCart } from "lucide-react"
import { useEffect, useState } from "react"
import { PageHeader } from "@/components/common/layout/PageHeader"
import DashboardCard from "@/components/features/admin/DashboardCard"
import QRAutoCheckinCard from "@/components/features/admin/QRAutoCheckinCard"
import { useAuth } from "@/hooks/auth/useAuth"
import { adminProfileQueryOptions } from "@/services/AdminService"

export const Route = createFileRoute("/_protected/admin/")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			// Should be handled by parent _protected, but safe guard
			throw redirect({ to: "/auth" })
		}

		const profile = await context.queryClient.ensureQueryData(adminProfileQueryOptions(user.id))

		const isAuthorized = profile?.role === "admin" || profile?.role === "superadmin"

		if (!isAuthorized) {
			throw redirect({ to: "/forecast" })
		}
	},
	component: AdminPanel,
	head: () => ({
		meta: [{ title: "Painel Admin" }, { name: "description", content: "Controle sua unidade" }],
	}),
})

function AdminPanel() {
	const { user } = useAuth()

	// Suspense Query: dado estará disponível e tipado
	// beforeLoad já garantiu a existência e autorização
	const { data: profile } = useSuspenseQuery(adminProfileQueryOptions(user?.id ?? ""))

	// Unidade selecionada no QR
	const [selectedOm, setSelectedOm] = useState<string>("")

	// Entrada com fade-in
	const [mounted, setMounted] = useState(false)
	useEffect(() => {
		const t = setTimeout(() => setMounted(true), 10)
		return () => clearTimeout(t)
	}, [])

	if (!user || !profile) {
		return null
	}

	return (
		<div className="min-h-screen">
			{/* Hero */}
			<section
				id="hero"
				className={`container mx-auto max-w-screen-2xl px-4 pt-10 transition-all duration-500 ${
					mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
				}`}
			>
				<PageHeader title="Painel Administrativo" description="Controles da sua OM" />
				{/* AdminHero might serve as a sub-banner or alert if needed, but per plan we remove it mostly */}
			</section>

			<section
				id="content"
				className={`container mx-auto max-w-screen-2xl px-4 py-10 md:py-14 transition-all duration-500 delay-100 ${
					mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
				}`}
			>
				<div className="grid grid-cols-1 gap-6 lg:gap-8">
					{/* Gestão */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
						<Link to="/admin/recipes">
							<Card className="hover:bg-muted/50 transition-colors cursor-pointer border-2 h-full">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<ChefHat className="h-5 w-5 text-primary" />
										Catálogo de Receitas
									</CardTitle>
									<CardDescription>
										Gerencie fichas técnicas, versões e ingredientes.
									</CardDescription>
								</CardHeader>
							</Card>
						</Link>
						<Link to="/admin/planning">
							<Card className="hover:bg-muted/50 transition-colors cursor-pointer border-2 h-full">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Calendar className="h-5 w-5 text-primary" />
										Planejamento de Cardápio
									</CardTitle>
									<CardDescription>Monte cardápios semanais e diários.</CardDescription>
								</CardHeader>
							</Card>
						</Link>
						<Link to="/admin/procurement">
							<Card className="hover:bg-muted/50 transition-colors cursor-pointer border-2 h-full">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<ShoppingCart className="h-5 w-5 text-primary" />
										Lista de Compras
									</CardTitle>
									<CardDescription>Calcule necessidades de aquisição.</CardDescription>
								</CardHeader>
							</Card>
						</Link>
					</div>

					<DashboardCard profile={profile} />
					<QRAutoCheckinCard
						selectedOm={selectedOm}
						onChangeSelectedOm={setSelectedOm}
						status="authorized"
					/>
				</div>
			</section>
		</div>
	)
}
