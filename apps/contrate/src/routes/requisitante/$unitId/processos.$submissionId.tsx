import { createFileRoute, Link } from "@tanstack/react-router"
import { ProcessView } from "@/components/process/ProcessView"
import { requesterEyebrow } from "@/components/requisitante/RequesterNav"
import { processDetailQueryOptions } from "@/lib/alpha/aci"

export const Route = createFileRoute("/requisitante/$unitId/processos/$submissionId")({
	loader: ({ context, params }) => {
		const token = context.auth.session?.access_token
		if (!token) return

		void context.queryClient.query({ ...processDetailQueryOptions(token, params.submissionId), staleTime: "static" }).catch(() => {})
	},
	component: ProcessoPage,
	head: () => ({ meta: [{ title: "Processo · Requisitante" }] }),
})

/**
 * O processo, visto por quem enviou (ou pelo requisitante da OM): extrair e verificar de novo
 * estão abertos a quem lê o processo; triagem e parecer, só ao ACI da OM — o `can_decide` do
 * α esconde os controles dos demais.
 */
function ProcessoPage() {
	const { unitId, submissionId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()

	return (
		<ProcessView
			submissionId={submissionId}
			eyebrow={requesterEyebrow(scopeContext.label)}
			reportLink={(runId) => <Link to="/requisitante/$unitId/relatorio/$runId" params={{ unitId, runId }} />}
		/>
	)
}
