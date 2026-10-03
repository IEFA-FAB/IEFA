import { createFileRoute } from "@tanstack/react-router"
import { lazy, Suspense } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { SaramReviewConsole } from "@/components/features/military-record/SaramReviewConsole"
import { PageHeader } from "@/components/layout/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { useSaramAdminApi, useSaramReviewQueue } from "@/hooks/data/useSaramAdmin"

/** Pré-visualização com dados inventados (só em `vite dev`; some do build de produção). */
const SaramAdminPreview = import.meta.env.DEV ? lazy(() => import("@/components/features/military-record/SaramAdminPreview")) : null

/**
 * Rota: /admin/military-records — console do vínculo de SARAM.
 * ACL: `admin` nível 2, aqui E nas server functions (`saram-admin.fn.ts`), que também exigem
 * garantia `fresh` nas mudanças e as auditam na mesma transação.
 */
export const Route = createFileRoute("/_protected/_modules/admin/military-records")({
	// `catch`: `?preview=1` chega como número; parâmetro estranho nunca derruba a tela.
	validateSearch: z.object({ preview: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined) }),
	beforeLoad: (opts) => requirePermission(opts, "admin", 2),
	component: MilitaryRecordsPage,
	head: () => ({
		meta: [{ name: "description", content: "Pedidos e contestações de vínculo de SARAM, vínculos antigos e contas de seção" }],
	}),
})

function MilitaryRecordsPage() {
	const { preview } = Route.useSearch()
	const queue = useSaramReviewQueue({ enabled: !(SaramAdminPreview && preview) })
	const api = useSaramAdminApi()

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Cadastro Militar"
				description="Quem é quem no sistema: pedidos e contestações de vínculo de SARAM, vínculos antigos a revisar e contas de seção. Toda decisão pede motivo e fica no registro de operações sensíveis."
			/>
			{SaramAdminPreview && preview ? (
				<Suspense fallback={<Skeleton className="h-64 w-full" />}>
					<SaramAdminPreview />
				</Suspense>
			) : (
				<SaramReviewConsole queue={queue.data} isLoading={queue.isLoading} error={queue.error} api={api} />
			)}
		</div>
	)
}
