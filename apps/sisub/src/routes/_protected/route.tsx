import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { userPermissionsQueryOptions } from "@/auth/pbac"
import { OnboardingDialogs } from "@/components/common/dialogs/OnboardingDialogs"
import { cn } from "@/lib/cn"
import { syncUserEmailFn } from "@/server/user.fn"

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		if (!context.auth.isAuthenticated || !context.auth.user?.id) {
			throw redirect({
				to: "/auth",
				search: { redirect: location.href },
			})
		}
		const { id, email } = context.auth.user
		// Pré-carrega permissões no cache do React Query.
		// Garante que requirePermission() funcione sincronamente em qualquer rota filha.
		await Promise.all([context.queryClient.ensureQueryData(userPermissionsQueryOptions(id)), syncUserEmailFn({ data: { userId: id, email: email ?? "" } })])
	},
	component: ProtectedLayout,
})

function ProtectedLayout() {
	return (
		<>
			<OnboardingDialogs />

			{/* Fundo padronizado sólido e sóbrio com uma suave retícula técnica sem animações/glow */}
			<div
				className={cn(
					"relative h-screen w-full bg-background overflow-hidden isolate",
					"after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10",
					"after:bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_1px)]",
					"after:bg-[length:24px_24px] after:opacity-50"
				)}
			>
				<Outlet />
			</div>
		</>
	)
}
