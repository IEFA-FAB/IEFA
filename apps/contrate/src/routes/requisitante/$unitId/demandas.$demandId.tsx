import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { z } from "zod"
import { DemandEditor, EDITOR_STEPS, type EditorStep } from "@/components/demand/DemandEditor"
import { RequesterNav } from "@/components/requisitante/RequesterNav"
import { demandQueryOptions } from "@/lib/alpha/demands"
import { formatDateTime } from "@/lib/alpha/format"
import { unitsQueryOptions } from "@/lib/alpha/units"
import { formatUnit } from "@/lib/scope"

const SearchSchema = z.object({ passo: z.enum(EDITOR_STEPS).optional().catch(undefined) })

export const Route = createFileRoute("/requisitante/$unitId/demandas/$demandId")({
	validateSearch: (search: Record<string, unknown>) => SearchSchema.parse(search),
	loader: ({ context, params }) => {
		if (!context.auth.isAuthenticated) return
		void context.queryClient.query({ ...demandQueryOptions(params.demandId), staleTime: "static" }).catch(() => {})
	},
	component: DemandaPage,
	head: () => ({ meta: [{ title: "Demanda · Requisitante" }] }),
})

function DemandaPage() {
	const queryClient = useQueryClient()
	const navigate = useNavigate({ from: Route.fullPath })
	const { unitId, demandId } = Route.useParams()
	const { passo } = Route.useSearch()
	const { scopeContext } = Route.useRouteContext()
	const detail = useQuery(demandQueryOptions(demandId))
	const units = useQuery(unitsQueryOptions())
	const unit = units.data?.find((candidate) => candidate.id === detail.data?.unit_id)
	// Recarregar depois de um conflito remonta o editor com a versão do banco.
	const [generation, setGeneration] = useState(0)

	const step: EditorStep = passo ?? "contexto"

	return (
		<div>
			<RequesterNav
				scope={scopeContext.label}
				title={detail.data?.title ?? "Demanda"}
				subtitle={
					detail.data ? `${detail.data.status === "enviada" ? "Enviada à ACI" : "Rascunho"} · atualizada ${formatDateTime(detail.data.updated_at)}` : undefined
				}
			/>

			{detail.isLoading ? <p className="text-muted-foreground text-sm">carregando a demanda…</p> : null}
			{detail.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" aria-hidden="true" />
					{(detail.error as Error).message}
				</p>
			) : null}

			{detail.data ? (
				<DemandEditor
					key={`${detail.data.id}-${generation}`}
					detail={detail.data}
					step={step}
					onStep={(next) => {
						navigate({ search: { passo: next }, replace: true })
						window.scrollTo({ top: 0 })
					}}
					unitLabel={unit ? formatUnit(unit) : scopeContext.label}
					scopeId={unitId}
					onReload={async () => {
						await queryClient.refetchQueries({ queryKey: ["alpha", "demands", demandId], exact: true })
						setGeneration((current) => current + 1)
					}}
				/>
			) : null}
		</div>
	)
}
