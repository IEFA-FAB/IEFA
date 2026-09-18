import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { ModuleShell } from "@/components/layout/ModuleShell"

/**
 * Plataforma ACI (Etapa 1.8 do Projeto α).
 *
 * A persona é quem revisa: a seção de licitações e o analista de controle interno — fila de
 * processos, verificação integrada e parecer. O console técnico (`/alpha/*`) continua
 * existindo para calibração; esta área é o produto sobre ele.
 *
 * Tudo aqui é recortado por OM (`/aci/$unitId/...`): a fila mostra só os processos das OMs
 * que o papel de licitações ou de ACI cobre, já expandido pela hierarquia de apoio. O hub
 * (`/aci/`) escolhe a OM — ou leva direto a ela, quando só há uma.
 *
 * Aqui mora só o guard de SESSÃO. O de papel e OM fica no hub e no `$unitId`, que leem o
 * perfil do α; quem decide de verdade é a API do α.
 */
export const Route = createFileRoute("/aci")({
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: () => (
		<ModuleShell moduleId="aci">
			<Outlet />
		</ModuleShell>
	),
})
