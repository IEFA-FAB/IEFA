import { createFileRoute, Link } from "@tanstack/react-router"
import { ReportView } from "@/components/process/ReportView"
import { requesterEyebrow } from "@/components/requisitante/RequesterNav"
import { finalReportQueryOptions } from "@/lib/alpha/aci"

/**
 * Relatório final visto do módulo Requisitante — o mesmo da ACI. Existe aqui para o link do
 * parecer não levar quem enviou para dentro de outro módulo.
 */
export const Route = createFileRoute("/requisitante/$unitId/relatorio/$runId")({
	loader: ({ context, params }) => {
		const token = context.auth.session?.access_token
		if (!token) return

		void context.queryClient.query({ ...finalReportQueryOptions(token, params.runId), staleTime: "static" }).catch(() => {})
	},
	component: RelatorioPage,
	head: () => ({ meta: [{ title: "Relatório final · Requisitante" }] }),
})

function RelatorioPage() {
	const { unitId, runId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()

	return (
		<ReportView
			runId={runId}
			eyebrow={requesterEyebrow(scopeContext.label)}
			processLink={(submissionId) => <Link to="/requisitante/$unitId/processos/$submissionId" params={{ unitId, submissionId }} />}
		/>
	)
}
