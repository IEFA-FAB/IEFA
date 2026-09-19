import { createFileRoute, redirect } from "@tanstack/react-router"
import { CheckingAccess } from "@/components/layout/ScopeHub"
import { processDetailQueryOptions } from "@/lib/alpha/aci"
import { resolveLegacyProcessPath } from "@/lib/legacy-routes"
import { loadAlphaAccess } from "@/lib/scope-route"

/**
 * URL antiga do processo, de antes da OM na URL. Lê a OM do processo no α e leva ao caminho
 * novo (`/aci/<OM>/processos/<id>`, ou o do Requisitante para quem não revisa). É estático, e
 * por isso vence o `$unitId`: `/aci/processos/…` nunca é lido como uma OM chamada "processos".
 *
 * Falhou a leitura (processo alheio, α fora do ar)? O hub da ACI explica o que houver.
 */
export const Route = createFileRoute("/aci/processos/$submissionId")({
	ssr: false,
	beforeLoad: async ({ context, params, preload }) => {
		if (preload) return
		let target: string
		try {
			const [access, detail] = await Promise.all([
				loadAlphaAccess(context),
				context.queryClient.query({ ...processDetailQueryOptions(context.auth.session?.access_token, params.submissionId), staleTime: 30_000 }),
			])
			target = resolveLegacyProcessPath(access, detail.unit_id, "processos", params.submissionId)
		} catch {
			target = "/aci"
		}
		throw redirect({ to: target, replace: true })
	},
	pendingComponent: CheckingAccess,
})
