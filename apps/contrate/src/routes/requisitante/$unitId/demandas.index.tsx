import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Plus, Trash, WarningTriangle } from "iconoir-react"
import { useMemo, useState } from "react"
import { UnitSelect } from "@/components/alpha/UnitSelect"
import { RequesterNav } from "@/components/requisitante/RequesterNav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/useAuth"
import { DEMAND_LIST_LIMIT, demandsQueryOptions, useCreateDemand, useDeleteDemand } from "@/lib/alpha/demands"
import { formatDateTime } from "@/lib/alpha/format"
import { alphaAccessQueryOptions } from "@/lib/alpha/role"
import { unitsQueryOptions } from "@/lib/alpha/units"

export const Route = createFileRoute("/requisitante/$unitId/demandas/")({
	// Só no cliente (a rota-mãe é `ssr: false`): `alphaRequest` fala com outro serviço.
	loader: ({ context }) => {
		if (!context.auth.isAuthenticated) return
		void context.queryClient.query({ ...demandsQueryOptions(context.scopeContext), staleTime: "static" }).catch(() => {})
	},
	component: DemandasPage,
	head: () => ({ meta: [{ title: "Demandas · Requisitante" }] }),
})

const STATUS_LABEL = { rascunho: "Rascunho", enviada: "Enviada à ACI" } as const

/**
 * A demanda antes do documento. Quem nunca fez um processo começa aqui: descreve o problema,
 * os objetivos e as alternativas, e o contrate gera DFD, ETP, Mapa de Riscos e TR, com o guia
 * de preenchimento do Compras.gov.br.
 */
function DemandasPage() {
	const navigate = useNavigate()
	const { unitId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()
	const demands = useQuery(demandsQueryOptions(scopeContext))
	const units = useQuery(unitsQueryOptions())
	const access = useQuery(alphaAccessQueryOptions())
	const unitCodes = useMemo(() => new Map((units.data ?? []).map((unit) => [unit.id, unit.code])), [units.data])
	const create = useCreateDemand()
	const remove = useDeleteDemand()
	const { user } = useAuth()
	const userId = user?.id

	const [creating, setCreating] = useState(false)
	const [title, setTitle] = useState("")
	const [unit, setUnit] = useState<number | null>(scopeContext.unitId)
	const canSubmit = access.data?.can_submit !== false

	return (
		<div>
			<RequesterNav
				scope={scopeContext.label}
				title="Demandas"
				subtitle="Comece pelo problema: o contrate conduz a estruturação da demanda e gera as peças para o Compras.gov.br, campo a campo."
				actions={
					canSubmit ? (
						<Button size="sm" onClick={() => setCreating((value) => !value)}>
							<Plus className="size-4" />
							nova demanda
						</Button>
					) : null
				}
			/>

			{creating ? (
				<form
					className="mb-8 grid gap-4 border border-border p-4 sm:grid-cols-[minmax(0,1fr)_18rem_auto] sm:items-end"
					onSubmit={(event) => {
						event.preventDefault()
						if (unit === null || !title.trim()) return
						create.mutate(
							{ unit_id: unit, title: title.trim() },
							{ onSuccess: (demand) => navigate({ to: "/requisitante/$unitId/demandas/$demandId", params: { unitId, demandId: demand.id } }) }
						)
					}}
				>
					<div>
						<label htmlFor="demand-title" className="mb-1 block font-medium text-sm">
							Título
						</label>
						<Input
							id="demand-title"
							value={title}
							maxLength={200}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Janelas do prédio E-102"
							autoFocus
						/>
					</div>
					<div>
						<label htmlFor="demand-unit" className="mb-1 block font-medium text-sm">
							OM da demanda
						</label>
						<UnitSelect
							id="demand-unit"
							units={units.data ?? []}
							value={unit}
							onChange={(value) => setUnit(typeof value === "number" ? value : null)}
							disabled={units.isLoading}
						/>
					</div>
					<Button type="submit" disabled={unit === null || !title.trim() || create.isPending}>
						{create.isPending ? "abrindo…" : "começar"}
					</Button>
					{create.isError ? <p className="text-sm sm:col-span-3">{(create.error as Error).message}</p> : null}
				</form>
			) : null}

			{remove.isError ? <p className="mb-4 text-sm">{(remove.error as Error).message}</p> : null}

			{demands.isLoading ? <p className="text-muted-foreground text-sm">carregando as demandas…</p> : null}
			{demands.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" aria-hidden="true" />
					{(demands.error as Error).message}
				</p>
			) : null}

			{demands.data?.length === 0 ? (
				<div className="border border-border p-8">
					<p className="font-medium text-sm">Nenhuma demanda ainda</p>
					<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
						Uma demanda leva do problema às peças em nove passos: problema, objetivos, alternativas, solução, itens, preços, riscos, dados do processo e, por
						fim, os documentos com o guia de preenchimento e o envio à ACI. Se o ETP ou o TR já estão prontos, use "Enviar documento".
					</p>
				</div>
			) : null}

			{demands.data && demands.data.length > 0 ? (
				<>
					<div className="overflow-x-auto border border-border">
						<table className="w-full min-w-[640px] text-left">
							<thead>
								<tr className="border-border border-b bg-muted/40">
									<th className="text-label px-3 py-2 font-medium text-muted-foreground">Demanda</th>
									<th className="text-label px-3 py-2 font-medium text-muted-foreground">Situação</th>
									<th className="text-label px-3 py-2 font-medium text-muted-foreground">OM</th>
									<th className="text-label px-3 py-2 font-medium text-muted-foreground">Atualizada</th>
									<th className="px-3 py-2">
										<span className="sr-only">Ações</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{demands.data.map((demand) => (
									<tr key={demand.id} className="border-border border-b last:border-b-0 hover:bg-muted/40">
										<td className="px-3 py-3 align-top">
											<Link
												to="/requisitante/$unitId/demandas/$demandId"
												params={{ unitId, demandId: demand.id }}
												className="block truncate font-medium text-sm hover:underline"
											>
												{demand.title}
											</Link>
										</td>
										<td className="px-3 py-3 align-top text-sm">{STATUS_LABEL[demand.status]}</td>
										<td className="px-3 py-3 align-top text-sm">{unitCodes.get(demand.unit_id) ?? `OM ${demand.unit_id}`}</td>
										<td className="px-3 py-3 align-top text-muted-foreground text-xs tabular-nums">{formatDateTime(demand.updated_at)}</td>
										<td className="px-3 py-2 text-right align-top">
											{demand.status === "rascunho" && demand.user_id === userId ? (
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Apagar o rascunho ${demand.title}`}
													disabled={remove.isPending}
													onClick={() => {
														if (window.confirm(`Apagar o rascunho "${demand.title}"? Não há como desfazer.`)) remove.mutate(demand.id)
													}}
												>
													<Trash />
												</Button>
											) : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{demands.data.length >= DEMAND_LIST_LIMIT ? (
						<p className="mt-3 text-muted-foreground text-xs">Mostrando as {DEMAND_LIST_LIMIT} mais recentes.</p>
					) : null}
				</>
			) : null}
		</div>
	)
}
