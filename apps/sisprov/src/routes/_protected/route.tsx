import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { mySisprovPermissionsQueryOptions } from "@/auth/pbac"
import { LegalNotice } from "@/components/LegalNotice"

/**
 * Área autenticada. Aquece o cache das permissões dos três módulos do SISPROV: os guards de
 * rota (`requireModules`) e os hooks de tela leem daqui, de forma síncrona.
 *
 * Falha na leitura das permissões NÃO derruba o `_protected` (tela branca) e NÃO vira conjunto
 * vazio: a query fica em erro, o hub diz que a leitura falhou (não "sem acesso") e os guards de
 * rota, que leem o cache, redirecionam ao hub. A próxima leitura tenta de novo.
 */
export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		if (!context.auth.isAuthenticated || !context.auth.user?.id) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		await context.queryClient.query({ ...mySisprovPermissionsQueryOptions(), staleTime: "static" }).catch((error) => {
			// biome-ignore lint/suspicious/noConsole: falha de leitura de permissões precisa aparecer no log do servidor
			console.error("Permissões do SISPROV indisponíveis; a tela informa a falha:", error instanceof Error ? error.message : error)
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
