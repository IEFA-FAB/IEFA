import { cn } from "@iefa/ui"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { useEffect } from "react"
import { userPermissionsQueryOptions } from "@/auth/pbac"
import { OnboardingDialogs } from "@/components/common/dialogs/OnboardingDialogs"
import { useAuth } from "@/hooks/auth/useAuth"
import { useSyncUserEmail } from "@/hooks/ui/useUserSync"

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		if (!context.auth.isAuthenticated) {
			throw redirect({
				to: "/auth",
				search: { redirect: location.href },
			})
		}
		// Pré-carrega permissões no cache do React Query.
		// Garante que requirePermission() funcione sincronamente em qualquer rota filha.
		await context.queryClient.ensureQueryData(userPermissionsQueryOptions(context.auth.user?.id))
	},
	component: ProtectedLayout,
})

function ProtectedLayout() {
	const { user } = useAuth()
	const syncEmailMutation = useSyncUserEmail()

	useEffect(() => {
		if (user) syncEmailMutation.mutate(user)
		// syncEmailMutation.mutate is stable (TanStack Query); user?.id guards against repeated calls
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.id, syncEmailMutation.mutate, user])

	return (
		<>
			<OnboardingDialogs />

			<div
				className={cn(
					"relative h-screen w-full bg-background overflow-hidden isolate",
					"before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none",
					"before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]",
					"dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]",
					"before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]",
					"after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10",
					"after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]",
					"after:bg-[length:12px_12px] after:opacity-[0.02]",
					"dark:after:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.4)_1px,transparent_1px)]",
					"dark:after:opacity-[0.04]"
				)}
			>
				<Outlet />
			</div>
		</>
	)
}
