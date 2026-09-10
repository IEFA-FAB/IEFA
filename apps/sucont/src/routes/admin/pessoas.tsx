import { createFileRoute } from "@tanstack/react-router"
import { SucontPeopleManager } from "#/components/admin/people-manager"
import { HubLayout } from "#/components/hub-layout"
import { sectionPeopleQueryOptions } from "#/lib/notifications"

export const Route = createFileRoute("/admin/pessoas")({
	loader: ({ context }) => {
		// Disparada sem espera: a lista tem o próprio estado de carregamento, e o
		// `.catch` deixa a falha no cache para a tela mostrá-la.
		void context.queryClient.query({ ...sectionPeopleQueryOptions(), staleTime: "static" }).catch(() => {})
	},
	component: PessoasRoute,
})

function PessoasRoute() {
	return (
		<HubLayout
			title="Pessoas"
			description="Quem opera as Unidades Gestoras e responde pelo cronograma. O vínculo com o SARAM é feito aqui, à mão: nome e posto não identificam ninguém — “3S VANESSA” casa com quatorze militares do efetivo."
		>
			<SucontPeopleManager />
		</HubLayout>
	)
}
