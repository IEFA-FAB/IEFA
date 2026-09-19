import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { Lock } from "iconoir-react"
import { authQueryOptions } from "@/auth/service"
import { ModuleShell } from "@/components/layout/ModuleShell"
import { AccessCheckFailed, CheckingAccess } from "@/components/layout/ScopeHub"
import { useAuth } from "@/hooks/useAuth"
import { alphaAccessQueryOptions } from "@/lib/alpha/role"

/**
 * Console interno do Projeto α.
 *
 * Ferramenta de calibração das fontes normativas e da bancada de regras — não é a
 * Plataforma ACI. É um módulo à parte no seletor, e só para o ACI GLOBAL: regra e fonte são
 * catálogo de TODAS as OMs, e promover uma regra muda o parecer de todas. O α exige o mesmo
 * (`requireRole("aci", { global: true })`); aqui a tela só não oferece o que daria 403.
 *
 * Sem OM na URL: o que se calibra não é de OM nenhuma.
 */
export const Route = createFileRoute("/alpha")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: AlphaConsoleLayout,
})

function AlphaConsoleLayout() {
	const { session } = useAuth()
	const access = useQuery(alphaAccessQueryOptions(session?.access_token))

	// A casca sai em todos os estados: enquanto o perfil é conferido (ou se a conferência
	// falha) a barra já está ali, e o seletor segue levando a outro módulo.
	return (
		<ModuleShell moduleId="alpha">
			{access.isPending ? (
				<CheckingAccess />
			) : access.isError ? (
				<AccessCheckFailed error={access.error} onRetry={() => access.refetch()} />
			) : access.data.roles.aci === "all" ? (
				<Outlet />
			) : (
				<div className="mx-auto max-w-xl border border-border p-8">
					<Lock className="size-6 text-muted-foreground" aria-hidden="true" />
					<h1 className="mt-4 font-semibold text-2xl tracking-tighter">Console α</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						A calibração de fontes e regras vale para todas as OMs, e por isso é do ACI com papel global. O ACI de uma OM tria e emite parecer na Plataforma
						ACI.
					</p>
				</div>
			)}
		</ModuleShell>
	)
}
