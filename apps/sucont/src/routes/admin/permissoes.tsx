import { createFileRoute } from "@tanstack/react-router"
import { sucontGrantsQueryOptions } from "#/auth/pbac"
import { SucontPermissionsManager } from "#/components/admin/permissions-manager"
import { HubLayout } from "#/components/hub-layout"

export const Route = createFileRoute("/admin/permissoes")({
	loader: ({ context }) => {
		// Disparada sem espera: a lista tem o próprio estado de carregamento, e o
		// `.catch` deixa a falha no cache para a tela mostrá-la — em vez de trocar a
		// tela inteira pelo error boundary.
		void context.queryClient.query({ ...sucontGrantsQueryOptions(), staleTime: "static" }).catch(() => {})
	},
	component: PermissoesRoute,
})

function PermissoesRoute() {
	return (
		<HubLayout
			title="Permissões"
			description="Quem entra no SUCONT e em que nível. O acesso vale para as três divisões — não há grant por divisão nem por seção."
		>
			<SucontPermissionsManager />
		</HubLayout>
	)
}
