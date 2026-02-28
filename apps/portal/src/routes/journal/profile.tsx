import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { ProfileForm } from "@/components/journal/ProfileForm"
import { userProfileQueryOptions } from "@/lib/journal/hooks"

export const Route = createFileRoute("/journal/profile")({
	beforeLoad: async ({ context }) => {
		// Ensure user is authenticated
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth" })
		}
		return { auth }
	},
	loader: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (auth.user) {
			// Pre-load user profile
			try {
				await context.queryClient.ensureQueryData(userProfileQueryOptions(auth.user.id))
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

	// Always call hooks at the top level
	const { data: profile } = useSuspenseQuery(userProfileQueryOptions(user?.id || ""))

	if (!user) {
		return null
	}

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<div className="mb-8">
				<h1 className="text-3xl font-bold tracking-tight">Perfil do Usuário</h1>
				<p className="mt-2 text-muted-foreground">
					Gerencie suas informações pessoais e preferências do sistema de publicações.
				</p>
			</div>

			<div className="rounded-lg border bg-card p-6">
				<ProfileForm userId={user.id} profile={profile} userEmail={user.email} />
			</div>

			<div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
				<h3 className="font-semibold text-blue-900 dark:text-blue-100">ℹ️ Sobre seu perfil</h3>
				<p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
					As informações preenchidas aqui serão utilizadas automaticamente ao submeter artigos.
					Certifique-se de manter seus dados atualizados, especialmente seu ORCID e afiliação
					institucional.
				</p>
			</div>
		</div>
	)
}
