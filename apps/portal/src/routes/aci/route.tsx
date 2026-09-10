import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
import { Lock } from "iconoir-react"
import { authQueryOptions } from "@/auth/service"
import { AppLayout } from "@/components/AppLayout"
import { useAuth } from "@/hooks/useAuth"
import { type AlphaRole, alphaRole, hasAciAccess, ROLE_LABEL } from "@/lib/alpha/role"

/**
 * Plataforma ACI (Etapa 1.8 do Projeto α).
 *
 * A persona é o analista de controle interno: fila de processos, verificação
 * integrada e parecer. O console técnico (`/alpha/*`) continua existindo para
 * calibração — esta área é o produto sobre ele.
 *
 * O guard de sessão redireciona; o guard de PERFIL não. Quem entrou mas não
 * tem perfil amplo vê a explicação e a quem pedir — mandar para a home
 * esconderia o motivo, e o perfil é concedido fora do app.
 */
export const Route = createFileRoute("/aci")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: AciLayout,
})

function AccessDenied({ role }: { role: AlphaRole | null }) {
	return (
		<div className="mx-auto max-w-xl border border-border p-8">
			<Lock className="size-6 text-muted-foreground" aria-hidden="true" />
			<h1 className="mt-4 font-semibold text-2xl tracking-tighter">Plataforma ACI</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Esta área é do analista de controle interno e da seção de licitações: ela lista os processos de todos os requisitantes. Seu perfil atual é{" "}
				<span className="font-medium text-foreground">{role ? ROLE_LABEL[role] : "sem perfil"}</span>.
			</p>
			<p className="mt-4 text-sm">
				O perfil é concedido pela administração do Projeto α. Enquanto isso, o ChatRADA e o envio do seu próprio documento seguem disponíveis.
			</p>
			<div className="mt-6 flex flex-wrap gap-4 text-sm">
				<Link to="/chatRada" className="underline underline-offset-4">
					Abrir o ChatRADA
				</Link>
				<Link to="/alpha/analise/nova" className="underline underline-offset-4">
					Enviar um documento
				</Link>
			</div>
		</div>
	)
}

function AciLayout() {
	const { user } = useAuth()
	const role = alphaRole(user)

	return <AppLayout>{hasAciAccess(role) ? <Outlet /> : <AccessDenied role={role} />}</AppLayout>
}
