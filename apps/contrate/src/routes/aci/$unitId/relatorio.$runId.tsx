import { createFileRoute, Link } from "@tanstack/react-router"
import { ReportView } from "@/components/process/ReportView"
import { finalReportQueryOptions } from "@/lib/alpha/aci"

export const Route = createFileRoute("/aci/$unitId/relatorio/$runId")({
	loader: ({ context, params }) => {
		const token = context.auth.session?.access_token
		if (!token) return

		void context.queryClient.query({ ...finalReportQueryOptions(token, params.runId), staleTime: "static" }).catch(() => {})
	},
	component: RelatorioPage,
	head: () => ({ meta: [{ title: "Relatório final · Plataforma ACI" }] }),
})

function RelatorioPage() {
	const { unitId, runId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()

	return (
		<ReportView
			runId={runId}
			eyebrow={`Projeto α · Plataforma ACI · ${scopeContext.label}`}
			processLink={(submissionId) => <Link to="/aci/$unitId/processos/$submissionId" params={{ unitId, submissionId }} />}
		/>
	)
}
