import type { UserPermission } from "@iefa/pbac"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { mySisprovPermissionsQueryOptions } from "@/auth/pbac"
import { LegalNotice } from "@/components/LegalNotice"

/**
 * Área autenticada. Aquece o cache das permissões dos três módulos do SISPROV: os guards de
 * rota (`requireModules`) e os hooks de tela leem daqui, de forma síncrona.
 *
 * Falha na leitura das permissões NÃO derruba o `_protected` (tela branca): grava um conjunto
 * vazio marcado como imediatamente stale, e o hub diz que a leitura falhou, em vez de "sem
 * acesso". A próxima navegação tenta de novo.
 */
export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		if (!context.auth.isAuthenticated || !context.auth.user?.id) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		await context.queryClient.query({ ...mySisprovPermissionsQueryOptions(), staleTime: "static" }).catch((error) => {
			// biome-ignore lint/suspicious/noConsole: falha de leitura de permissões precisa aparecer no log do servidor
			console.error("Permissões do SISPROV indisponíveis; a tela informa a falha:", error instanceof Error ? error.message : error)
			context.queryClient.setQueryData<UserPermission[]>(mySisprovPermissionsQueryOptions().queryKey, [], { updatedAt: 0 })
		})
	},
	component: ProtectedLayout,
})

function ProtectedLayout() {
	return (
		<>
			<LegalNotice />
			<div className="relative isolate h-screen w-full overflow-hidden bg-background">
				<Outlet />
			</div>
		</>
	)
}
