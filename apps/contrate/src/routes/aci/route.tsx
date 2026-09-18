import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
import { Lock } from "iconoir-react"
import { authQueryOptions } from "@/auth/service"
import { ModuleShell } from "@/components/layout/ModuleShell"
import { useAuth } from "@/hooks/useAuth"
import { type AlphaLevel, alphaAccessQueryOptions, LEVEL_LABEL } from "@/lib/alpha/role"

/**
 * Plataforma ACI (Etapa 1.8 do Projeto α).
 *
 * A persona é o analista de controle interno: fila de processos, verificação
 * integrada e parecer. O console técnico (`/alpha/*`) continua existindo para
 * calibração — esta área é o produto sobre ele.
 *
 * O guard de sessão redireciona; o guard de PERFIL não. Quem entrou mas não
 * tem perfil amplo vê a explicação e a quem pedir — mandar para a home
 * esconderia o motivo. O perfil é o módulo `alpha` do PBAC, resolvido pelo α.
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

function AccessDenied({ level }: { level: AlphaLevel }) {
	return (
		<div className="mx-auto max-w-xl border border-border p-8">
			<Lock className="size-6 text-muted-foreground" aria-hidden="true" />
			<h1 className="mt-4 font-semibold text-2xl tracking-tighter">Plataforma ACI</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Esta área é do analista de controle interno e da seção de licitações: ela lista os processos de todos os requisitantes. Seu perfil atual é{" "}
				<span className="font-medium text-foreground">{LEVEL_LABEL[level]}</span>.
			</p>
			<p className="mt-4 text-sm">
				O perfil é concedido pela administração do copiloto. Enquanto isso, o envio do seu próprio documento segue disponível, e o ChatRADA continua no Portal
				IEFA.
			</p>
			<div className="mt-6 flex flex-wrap gap-4 text-sm">
				<a href="https://portal.iefa.com.br/chatRada" className="underline underline-offset-4">
					Abrir o ChatRADA
				</a>
				<Link to="/alpha/analise/nova" className="underline underline-offset-4">
					Enviar um documento
				</Link>
			</div>
		</div>
	)
}

function AciLayout() {
	const { session } = useAuth()
	const access = useQuery(alphaAccessQueryOptions(session?.access_token))

	// A casca sai em todos os estados: enquanto o perfil é conferido (ou se a
	// conferência falha) a barra já está ali, e o seletor segue levando a outro módulo.
	if (access.isPending) {
		return (
			<ModuleShell moduleId="aci">
				<p className="text-muted-foreground text-sm">Conferindo seu perfil…</p>
			</ModuleShell>
		)
	}
	if (access.isError) {
		return (
			<ModuleShell moduleId="aci">
				<p className="text-sm">Não foi possível conferir seu perfil no Projeto α: {access.error.message}</p>
			</ModuleShell>
		)
	}

	return <ModuleShell moduleId="aci">{access.data.can_see_all ? <Outlet /> : <AccessDenied level={access.data.level} />}</ModuleShell>
}
