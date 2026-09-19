import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { ModuleShell } from "@/components/layout/ModuleShell"

/**
 * Módulo Requisitante do Projeto α — onde qualquer pessoa autenticada envia o ETP, o TR ou o
 * edital e acompanha a verificação.
 *
 * Enviar não exige papel. O papel de requisitante (`alpha-requester`, por OM) só amplia o que
 * se enxerga: todas as submissões das OMs que ele cobre, para o trabalho não parar quando o
 * colega que enviou sai de férias. Quem não tem o papel trabalha em `minhas` — os documentos
 * que ele mesmo enviou.
 *
 * Aqui mora só o guard de SESSÃO; o de OM fica no hub e no `$unitId`.
 */
export const Route = createFileRoute("/requisitante")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: () => (
		<ModuleShell moduleId="requisitante">
			<Outlet />
		</ModuleShell>
	),
})
