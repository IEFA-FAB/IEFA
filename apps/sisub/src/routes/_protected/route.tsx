import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { userPermissionsQueryOptions } from "@/auth/pbac"
import { OnboardingDialogs } from "@/components/providers/OnboardingDialogs"
import { cn } from "@/lib/cn"
import { syncUserEmailFn } from "@/server/user.fn"
import type { UserPermission } from "@/types/domain/permissions"

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
		await Promise.all([
			// Falha na busca de permissões NÃO pode derrubar todo o _protected (tela branca).
			// Fallback: semeia o cache com o implicit allow (Comensal) para o app seguir
			// utilizável e a sidebar/hub renderizarem ao menos o módulo básico.
			context.queryClient.ensureQueryData(userPermissionsQueryOptions(id)).catch((err) => {
				// biome-ignore lint/suspicious/noConsole: intentional — surface permission load failure
				console.error("Falha ao carregar permissões; aplicando fallback Comensal:", err)
				context.queryClient.setQueryData<UserPermission[]>(userPermissionsQueryOptions(id).queryKey, [
					{ module: "diner", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null },
				])
			}),
			// Non-critical upsert — failure (e.g. HMR module cache miss in dev) must
			// not crash beforeLoad and block navigation. A colisão de email já é
			// reconciliada na operation (reclaim do registro órfão); o que chega aqui
			// é genuinamente irrecuperável, então logamos uma mensagem clara em vez
			// de propagar o erro cru do Postgres.
			syncUserEmailFn({ data: { userId: id, email: email ?? "" } }).catch((err) => {
				// biome-ignore lint/suspicious/noConsole: intentional — non-critical sync failure
				console.warn("Não foi possível sincronizar o perfil do usuário (não bloqueante):", err instanceof Error ? err.message : err)
			}),
		])
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
