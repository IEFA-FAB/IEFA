import { useQuery } from "@tanstack/react-query"
import { AlertCircle, CheckCircle2, Clock, Loader2, Play, RefreshCw, Square } from "lucide-react"
import { type ReactNode, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatSyncDate, statusColor, statusLabel } from "@/lib/compras-sync"
import type { SyncLog } from "@/types/domain/compras-sync"

/** Per-domain configuration for a sync runner (Compras.gov, Tabelas Nutricionais, …). */
export type SyncPanelConfig = {
	/** Unique key for the react-query cache namespace, e.g. "compras" | "nutrition". */
	domainKey: string
	/** Latest sync log preloaded by the route loader (or null if none ran yet). */
	initial: SyncLog | null
	/** Optional informational banner rendered above the sync card. */
	infoBanner?: ReactNode
	/** Label for the progress unit, e.g. "steps concluídos" | "fontes verificadas". */
	progressUnit: string
	/** Header for the step-name column, e.g. "Step" | "Fonte". */
	stepColumnHeader: string
	/** Whether the step table shows the "Página" column (paginated syncs only). */
	showPageColumn: boolean
	/** Maps a raw step_name to a display label (+ optional mono subtitle). */
	stepLabel: (stepName: string) => { primary: string; secondary?: string }
	/** The 4 metric tiles derived from the sync log. */
	metrics: (sync: SyncLog) => [string, number][]
	/** Optional extra description shown on the "stop requested" toast. */
	stopDescription?: string
	fns: {
		trigger: () => Promise<{ error: string | null; sync_id: number | null }>
		status: (args: { data: { id: number } }) => Promise<SyncLog>
		stop: (args: { data: { id: number } }) => Promise<{ error: string | null }>
		latest: () => Promise<SyncLog | null>
	}
}

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

export function SyncRunnerPanel({ config }: { config: SyncPanelConfig }) {
	const { initial, fns } = config
	const [activeSyncId, setActiveSyncId] = useState<number | null>(initial?.status === "running" ? initial.id : null)
	const [isTriggering, setIsTriggering] = useState(false)
	const [isStopping, setIsStopping] = useState(false)

	const { data: polledSync, refetch } = useQuery({
		queryKey: [`${config.domainKey}-sync`, activeSyncId],
		queryFn: () => (activeSyncId ? fns.status({ data: { id: activeSyncId } }) : fns.latest()),
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
			const result = await fns.stop({ data: { id: sync.id } })
			if (result.error) toast.error(result.error)
			else toast.info("Parada solicitada", config.stopDescription ? { description: config.stopDescription } : undefined)
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
			const result = await fns.trigger()
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
			<div className="flex items-center justify-end gap-2">
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

			{config.infoBanner}

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
										{sync.completed_steps} / {sync.total_steps} {config.progressUnit}
									</span>
									<span>{progressPct}%</span>
								</div>
								<Progress value={progressPct} className="h-2" />
							</div>

							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								{config.metrics(sync).map(([label, val]) => (
									<div key={label} className="rounded-lg border bg-muted/30 px-4 py-3">
										<p className="text-xs text-muted-foreground">{label}</p>
										<p className="mt-0.5 text-xl text-display tabular-nums">{val.toLocaleString("pt-BR")}</p>
									</div>
								))}
							</div>

							{sync.error_message && (
								<p className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{sync.error_message}</p>
							)}
						</CardContent>
					</Card>

					{sync.steps.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Progresso por {config.stepColumnHeader}</CardTitle>
							</CardHeader>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
												<th className="px-4 py-2.5 text-left text-subheading">{config.stepColumnHeader}</th>
												<th className="px-4 py-2.5 text-left text-subheading">Status</th>
												{config.showPageColumn && <th className="px-4 py-2.5 text-right text-subheading">Página</th>}
												<th className="px-4 py-2.5 text-right text-subheading">Registros</th>
												<th className="px-4 py-2.5 text-left text-subheading">Erro</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{sync.steps.map((step) => {
												const label = config.stepLabel(step.step_name)
												return (
													<tr key={step.id} className={step.status === "running" ? "bg-info/5" : step.status === "error" ? "bg-destructive/5" : undefined}>
														<td className="px-4 py-2.5">
															{label.secondary ? (
																<>
																	<p className="font-medium">{label.primary}</p>
																	<p className="font-mono text-xs text-muted-foreground">{label.secondary}</p>
																</>
															) : (
																<p className="font-mono text-xs">{label.primary}</p>
															)}
														</td>
														<td className="px-4 py-2.5">
															<span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption ${statusColor(step.status)}`}>
																<StatusIcon status={step.status} />
																{statusLabel(step.status)}
															</span>
														</td>
														{config.showPageColumn && (
															<td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
																{step.total_pages != null ? `${step.current_page} / ${step.total_pages}` : step.current_page > 0 ? step.current_page : "—"}
															</td>
														)}
														<td className="px-4 py-2.5 text-right tabular-nums">{step.records_upserted.toLocaleString("pt-BR")}</td>
														<td className="max-w-xs truncate px-4 py-2.5 text-xs text-muted-foreground">{step.error_message ?? "—"}</td>
													</tr>
												)
											})}
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
