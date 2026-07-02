import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertCircle, CheckCircle2, Clock, Database, Loader2, Play, RefreshCw, Square } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatSyncDate, statusColor, statusLabel } from "@/lib/compras-sync"
import { getLatestNutritionSyncFn, getNutritionSyncStatusFn, stopNutritionSyncFn, triggerNutritionSyncFn } from "@/server/nutrition-sync.fn"

export const Route = createFileRoute("/_protected/_modules/global/nutrition-sync")({
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	loader: async () => getLatestNutritionSyncFn(),
	component: NutritionSyncPage,
	head: () => ({
		meta: [{ title: "Sync Tabelas Nutricionais — SISUB" }],
	}),
})

function StatusIcon({ status }: { status: string }) {
	switch (status) {
		case "running":
			return <Loader2 className="size-3.5 animate-spin" />
		case "success":
			return <CheckCircle2 className="size-3.5" />
		case "error":
		case "partial":
			return <AlertCircle className="size-3.5" />
		case "pending":
			return <Clock className="size-3.5" />
		default:
			return null
	}
}

function sourceLabel(stepName: string) {
	const source = stepName.replace(/^source\./, "")
	const labels: Record<string, string> = {
		taco: "TACO",
		ibge_pof_2008_2009: "IBGE POF 2008-2009",
		usda_fdc: "USDA FoodData Central",
		tbca: "TBCA",
		tucunduva: "Tucunduva",
	}
	return labels[source] ?? stepName
}

function NutritionSyncPage() {
	const initial = Route.useLoaderData()
	const [activeSyncId, setActiveSyncId] = useState<number | null>(initial?.status === "running" ? initial.id : null)
	const [isTriggering, setIsTriggering] = useState(false)
	const [isStopping, setIsStopping] = useState(false)

	const { data: polledSync, refetch } = useQuery({
		queryKey: ["nutrition-sync", activeSyncId],
		queryFn: () => {
			if (activeSyncId) return getNutritionSyncStatusFn({ data: { id: activeSyncId } })
			return getLatestNutritionSyncFn()
		},
		initialData: initial ?? undefined,
		refetchInterval: (query) => (query.state.data?.status === "running" ? 3_000 : false),
		staleTime: 0,
	})

	const sync = polledSync ?? initial
	const isRunning = sync?.status === "running"
	const progressPct = sync && sync.total_steps > 0 ? Math.round((sync.completed_steps / sync.total_steps) * 100) : 0

	async function handleStop() {
		if (!sync?.id) return
		setIsStopping(true)
		try {
			const result = await stopNutritionSyncFn({ data: { id: sync.id } })
			if (result.error) toast.error(result.error)
			else toast.info("Parada solicitada")
		} catch (err) {
			toast.error("Falha ao solicitar parada", {
				description: err instanceof Error ? err.message : "Erro desconhecido",
			})
		} finally {
			setIsStopping(false)
		}
	}

	async function handleTrigger() {
		setIsTriggering(true)
		try {
			const result = await triggerNutritionSyncFn()
			if (result.error) {
				toast.error(result.error)
			} else if (result.sync_id) {
				toast.success("Sync iniciada", { description: `ID #${result.sync_id}` })
				setActiveSyncId(result.sync_id)
			}
		} catch (err) {
			toast.error("Falha ao iniciar sync", {
				description: err instanceof Error ? err.message : "Erro desconhecido",
			})
		} finally {
			setIsTriggering(false)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title="Sync Tabelas Nutricionais">
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRunning} className="gap-2">
						<RefreshCw className="size-4" />
						Atualizar
					</Button>
					{isRunning && (
						<Button size="sm" variant="destructive" onClick={handleStop} disabled={isStopping} className="gap-2">
							{isStopping ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
							Parar Sync
						</Button>
					)}
					<Button size="sm" onClick={handleTrigger} disabled={isTriggering || isRunning} className="gap-2">
						{isTriggering ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
						{isRunning ? "Sync em andamento…" : "Iniciar Sync"}
					</Button>
				</div>
			</PageHeader>

			<Card>
				<CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
					<Database className="mt-0.5 size-4 shrink-0 text-foreground" />
					<p>
						Verifica releases das bases TACO, IBGE e USDA. TBCA e Tucunduva ficam bloqueadas até haver arquivo autorizado. O worker roda na API toda terça-feira
						às 03:00 BRT.
					</p>
				</CardContent>
			</Card>

			{!sync ? (
				<Card>
					<CardContent className="py-12 text-center text-muted-foreground">
						Nenhuma sincronização realizada. Clique em <strong>Iniciar Sync</strong> para começar.
					</CardContent>
				</Card>
			) : (
				<>
					<Card>
						<CardHeader>
							<div className="flex items-start justify-between gap-4">
								<div>
									<CardTitle className="text-base">
										Sync #{sync.id}
										<span className="ml-2 text-sm font-normal text-muted-foreground">— disparada por {sync.triggered_by}</span>
									</CardTitle>
									<CardDescription>
										Iniciada em {formatSyncDate(sync.started_at)}
										{sync.finished_at && ` · Finalizada em ${formatSyncDate(sync.finished_at)}`}
									</CardDescription>
								</div>
								<Badge className={`inline-flex items-center gap-1.5 ${statusColor(sync.status)}`}>
									<StatusIcon status={sync.status} />
									{statusLabel(sync.status)}
								</Badge>
							</div>
						</CardHeader>

						<CardContent className="space-y-4">
							<div className="space-y-1.5">
								<div className="flex justify-between text-sm text-muted-foreground">
									<span>
										{sync.completed_steps} / {sync.total_steps} fontes verificadas
									</span>
									<span>{progressPct}%</span>
								</div>
								<Progress value={progressPct} className="h-2" />
							</div>

							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								{(
									[
										["Releases verificados", sync.total_upserted],
										["Desativados", sync.total_deactivated],
										["Fontes OK", sync.successful_steps],
										["Fontes com erro", sync.failed_steps],
									] as [string, number][]
								).map(([label, val]) => (
									<div key={label} className="rounded-lg border bg-muted/30 px-4 py-3">
										<p className="text-xs text-muted-foreground">{label}</p>
										<p className="mt-0.5 text-xl text-display tabular-nums">{val.toLocaleString("pt-BR")}</p>
									</div>
								))}
							</div>

							{sync.error_message && (
								<p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
									{sync.error_message}
								</p>
							)}
						</CardContent>
					</Card>

					{sync.steps.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Progresso por Fonte</CardTitle>
							</CardHeader>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
												<th className="px-4 py-2.5 text-left text-subheading">Fonte</th>
												<th className="px-4 py-2.5 text-left text-subheading">Status</th>
												<th className="px-4 py-2.5 text-right text-subheading">Registros</th>
												<th className="px-4 py-2.5 text-left text-subheading">Erro</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{sync.steps.map((step) => (
												<tr key={step.id} className={step.status === "running" ? "bg-blue-500/5" : step.status === "error" ? "bg-red-500/5" : undefined}>
													<td className="px-4 py-2.5">
														<p className="font-medium">{sourceLabel(step.step_name)}</p>
														<p className="font-mono text-xs text-muted-foreground">{step.step_name}</p>
													</td>
													<td className="px-4 py-2.5">
														<span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption ${statusColor(step.status)}`}>
															<StatusIcon status={step.status} />
															{statusLabel(step.status)}
														</span>
													</td>
													<td className="px-4 py-2.5 text-right tabular-nums">{step.records_upserted.toLocaleString("pt-BR")}</td>
													<td className="max-w-xs truncate px-4 py-2.5 text-xs text-muted-foreground">{step.error_message ?? "—"}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</CardContent>
						</Card>
					)}
				</>
			)}
		</div>
	)
}
