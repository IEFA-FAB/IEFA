import { createFileRoute, Link } from "@tanstack/react-router"
import { ProcessView } from "@/components/process/ProcessView"
import { processDetailQueryOptions } from "@/lib/alpha/aci"

export const Route = createFileRoute("/aci/$unitId/processos/$submissionId")({
	loader: ({ context, params }) => {
		const token = context.auth.session?.access_token
		if (!token) return

		// Dispara sem esperar: a tela usa `useQuery` e tem estado de carregamento próprio.
		void context.queryClient.query({ ...processDetailQueryOptions(token, params.submissionId), staleTime: "static" }).catch(() => {})
	},
	component: ProcessoPage,
	head: () => ({ meta: [{ title: "Processo · Plataforma ACI" }] }),
})

function ProcessoPage() {
	const { unitId, submissionId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()

	return (
		<ProcessView
			submissionId={submissionId}
			eyebrow={`Projeto α · Plataforma ACI · ${scopeContext.label}`}
			reportLink={(runId) => <Link to="/aci/$unitId/relatorio/$runId" params={{ unitId, runId }} />}
		/>
	)
}
