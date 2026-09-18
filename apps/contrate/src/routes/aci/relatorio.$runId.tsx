import { createFileRoute, redirect } from "@tanstack/react-router"
import { CheckingAccess } from "@/components/layout/ScopeHub"
import { finalReportQueryOptions } from "@/lib/alpha/aci"
import { resolveLegacyProcessPath } from "@/lib/legacy-routes"
import { loadAlphaAccess } from "@/lib/scope-route"

/**
 * URL antiga do relatório final, de antes da OM na URL. Lê a OM do processo no relatório e
 * leva ao caminho novo — ver `processos.$submissionId.tsx`, ao lado.
 */
export const Route = createFileRoute("/aci/relatorio/$runId")({
	ssr: false,
	beforeLoad: async ({ context, params, preload }) => {
		if (preload) return
		let target: string
		try {
			const [access, report] = await Promise.all([
				loadAlphaAccess(context),
				context.queryClient.query({ ...finalReportQueryOptions(context.auth.session?.access_token, params.runId), staleTime: 60_000 }),
			])
			target = resolveLegacyProcessPath(access, report.submission.unit_id, "relatorio", params.runId)
		} catch {
			target = "/aci"
		}
		throw redirect({ to: target, replace: true })
	},
	pendingComponent: CheckingAccess,
})
