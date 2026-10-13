import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { authQueryOptions } from "@/auth/service"
import { ProfileForm } from "@/components/journal/ProfileForm"
import { Alert } from "@/components/ui/alert"
import { userProfileQueryOptions } from "@/lib/journal/hooks"
import { resolveProfileNext } from "@/lib/journal/profile"

export const Route = createFileRoute("/journal/profile")({
	// `next`: para onde voltar depois de salvar (a submissão manda quem ainda não tem perfil para
	// cá). Só caminho do journal; o resto é ignorado em `resolveProfileNext`.
	validateSearch: z.object({ next: z.string().optional().catch(undefined) }),
	staticData: {
		nav: {
			title: "Meu perfil",
			section: "Minha área",
			subtitle: "Dados pessoais, ORCID e preferências do sistema",
			keywords: ["perfil", "usuario", "orcid", "afiliacao"],
			access: "authenticated",
			order: 100,
		},
	},
	beforeLoad: async ({ context, location }) => {
		// Ensure user is authenticated
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	loader: async ({ context }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (auth.user) {
			// Pre-load user profile
			try {
				await context.queryClient.query({ ...userProfileQueryOptions(auth.user.id), staleTime: "static" })
			} catch {
				// Profile doesn't exist yet, will be created on first save
			}
		}
	},
	component: ProfilePage,
})

function ProfilePage() {
	const { auth } = Route.useRouteContext()
	const { user } = auth
	const next = resolveProfileNext(Route.useSearch().next)
	const navigate = useNavigate()

	// Always call hooks at the top level
	const { data: profile } = useSuspenseQuery(userProfileQueryOptions(user?.id || ""))

	if (!user) {
		return null
	}

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold tracking-tight">Perfil do Usuário</h1>
				<p className="mt-2 text-muted-foreground">Gerencie suas informações pessoais e preferências do sistema de publicações.</p>
			</div>

			<div className="rounded-lg border bg-card p-6">
				<ProfileForm userId={user.id} profile={profile} userEmail={user.email} onSaved={next ? () => navigate({ href: next }) : undefined} />
			</div>

			<Alert variant="info" role="note" className="mt-6">
				<h3 className="text-base font-semibold">ℹ️ Sobre seu perfil</h3>
				<p className="mt-2">
					As informações preenchidas aqui serão utilizadas automaticamente ao submeter artigos. Certifique-se de manter seus dados atualizados, especialmente
					seu ORCID e afiliação institucional.
				</p>
			</Alert>
		</div>
	)
}
