import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { userPermissionsQueryOptions } from "@/auth/pbac"
import { OnboardingDialogs } from "@/components/providers/OnboardingDialogs"
import { cn } from "@/lib/cn"
import { syncUserEmailFn } from "@/server/user.fn"
import type { UserPermission } from "@/types/domain/permissions"

/**
 * Chaves `${userId}:${email}` já sincronizadas neste ciclo de vida do módulo.
 * O sync de email é um WRITE que praticamente nunca muda (email mexe raramente),
 * então repeti-lo a cada navegação só polui o DB e inflava o TTFB. Guard idempotente:
 * dispara no máximo uma vez por usuário/email por instância (cliente: por aba; servidor:
 * por processo). Re-sincroniza se o email mudar (chave diferente) ou após reinício/deploy.
 * Em falha, remove a chave para permitir nova tentativa na próxima navegação.
 */
const syncedEmailKeys = new Set<string>()

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		if (!context.auth.isAuthenticated || !context.auth.user?.id) {
			throw redirect({
				to: "/auth",
				search: { redirect: location.href },
			})
		}
		const { id, email } = context.auth.user

		// Permissões: requirePermission() das rotas filhas lê este cache de forma síncrona.
		// Falha NÃO pode derrubar todo o _protected (tela branca) → fallback com o implicit
		// allow (Comensal) para a sidebar/hub renderizarem ao menos o módulo básico.
		const ensurePermissions = context.queryClient.ensureQueryData(userPermissionsQueryOptions(id)).catch((err) => {
			// biome-ignore lint/suspicious/noConsole: intentional — surface permission load failure
			console.error("Falha ao carregar permissões; aplicando fallback Comensal:", err)
			context.queryClient.setQueryData<UserPermission[]>(userPermissionsQueryOptions(id).queryKey, [
				{ module: "diner", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null },
			])
		})

		// Bootstrap do perfil (upsert/reclaim de user_data). Roda em PARALELO com as
		// permissões — não em série, então não soma latência ao primeiro byte — mas é
		// AWAITED para que o registro esteja reconciliado antes de qualquer rota filha
		// ler/escrever user_data (ex.: persistDefaultMessHall no forecast não é
		// reclaim-aware e bateria 23505 se a linha órfã ainda existisse). O guard garante
		// que isso aconteça no máximo uma vez por sessão — as navegações seguintes pulam
		// o WRITE e pagam só as permissões, removendo-o do caminho crítico repetido.
		const tasks: Promise<unknown>[] = [ensurePermissions]
		const syncKey = `${id}:${email ?? ""}`
		if (!syncedEmailKeys.has(syncKey)) {
			syncedEmailKeys.add(syncKey)
			tasks.push(
				// Non-critical upsert — failure (e.g. HMR module cache miss in dev) must not
				// crash beforeLoad. A colisão de email já é reconciliada na operation (reclaim
				// do registro órfão); o que chega aqui é genuinamente irrecuperável.
				syncUserEmailFn({ data: { userId: id, email: email ?? "" } }).catch((err) => {
					syncedEmailKeys.delete(syncKey) // permite retry na próxima navegação
					// biome-ignore lint/suspicious/noConsole: intentional — non-critical sync failure
					console.warn("Não foi possível sincronizar o perfil do usuário (não bloqueante):", err instanceof Error ? err.message : err)
				})
			)
		}

		await Promise.all(tasks)
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
