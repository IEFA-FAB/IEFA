import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AlertCircle, CheckCircle2, Clock, Loader2, Play, RefreshCw, Square } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getLatestSync, getSyncStatus, type SyncLog, type SyncStep, stopSync, triggerSync } from "@/server/compras-sync.fn"

export const Route = createFileRoute("/_protected/_modules/global/compras-sync")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	loader: async () => {
		return getLatestSync()
	},
	component: ComprasSyncPage,
	head: () => ({
		meta: [{ title: "Sync Compras.gov — SISUB" }],
	}),
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: SyncLog["status"] | SyncStep["status"]) {
	switch (status) {
		case "running":
			return "bg-blue-500/15 text-blue-700 dark:text-blue-400"
		case "success":
			return "bg-green-500/15 text-green-700 dark:text-green-400"
		case "partial":
			return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
		case "error":
			return "bg-red-500/15 text-red-700 dark:text-red-400"
		case "pending":
			return "bg-muted text-muted-foreground"
		default:
			return "bg-muted text-muted-foreground"
	}
}

function statusLabel(status: string) {
	const map: Record<string, string> = {
		running: "Rodando",
		success: "Concluído",
		partial: "Parcial",
		error: "Erro",
		pending: "Aguardando",
	}
	return map[status] ?? status
}

function StatusIcon({ status }: { status: string }) {
	switch (status) {
		case "running":
			return <Loader2 className="h-3.5 w-3.5 animate-spin" />
		case "success":
			return <CheckCircle2 className="h-3.5 w-3.5" />
		case "error":
		case "partial":
			return <AlertCircle className="h-3.5 w-3.5" />
		case "pending":
			return <Clock className="h-3.5 w-3.5" />
		default:
			return null
	}
}

function formatDate(iso: string | null) {
	if (!iso) return "—"
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(iso))
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ComprasSyncPage() {
	const initial = Route.useLoaderData()
	const [activeSyncId, setActiveSyncId] = useState<number | null>(initial?.status === "running" ? initial.id : null)
	const [isTriggering, setIsTriggering] = useState(false)
	const [isStopping, setIsStopping] = useState(false)

	// Polling query — ativo apenas quando há um sync running
	const { data: polledSync, refetch } = useQuery({
		queryKey: ["compras-sync", activeSyncId],
		queryFn: () => {
			if (activeSyncId) return getSyncStatus({ data: { id: activeSyncId } })
			return getLatestSync()
		},
		initialData: initial ?? undefined,
		refetchInterval: (query) => {
			const status = query.state.data?.status
			return status === "running" ? 3_000 : false
		},
		staleTime: 0,
	})

	const sync = polledSync ?? initial

	async function handleStop() {
		if (!sync?.id) return
		setIsStopping(true)
		try {
			const result = await stopSync({ data: { id: sync.id } })
			if (result.error) {
				toast.error(result.error)
			} else {
				toast.info("Parada solicitada", { description: "Será aplicada ao fim do step atual" })
			}
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
			const result = await triggerSync()
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

	const isRunning = sync?.status === "running"
	const progressPct = sync ? Math.round((sync.completed_steps / sync.total_steps) * 100) : 0

	return (
		<div className="space-y-6">
			<PageHeader title="Sync Compras.gov.br">
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRunning} className="gap-2">
						<RefreshCw className="h-4 w-4" />
						Atualizar
					</Button>
					{isRunning && (
						<Button size="sm" variant="destructive" onClick={handleStop} disabled={isStopping} className="gap-2">
							{isStopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
							Parar Sync
						</Button>
					)}
					<Button size="sm" onClick={handleTrigger} disabled={isTriggering || isRunning} className="gap-2">
						{isTriggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
						{isRunning ? "Sync em andamento…" : "Iniciar Sync"}
					</Button>
				</div>
			</PageHeader>

			{!sync ? (
				<Card>
					<CardContent className="py-12 text-center text-muted-foreground">
						Nenhuma sincronização realizada. Clique em <strong>Iniciar Sync</strong> para começar.
					</CardContent>
				</Card>
			) : (
				<>
					{/* Resumo geral */}
					<Card>
						<CardHeader>
							<div className="flex items-start justify-between gap-4">
								<div>
									<CardTitle className="text-base">
										Sync #{sync.id}
										<span className="ml-2 text-sm font-normal text-muted-foreground">— disparada por {sync.triggered_by}</span>
									</CardTitle>
									<CardDescription>
										Iniciada em {formatDate(sync.started_at)}
										{sync.finished_at && ` · Finalizada em ${formatDate(sync.finished_at)}`}
									</CardDescription>
								</div>
								<Badge className={`inline-flex items-center gap-1.5 ${statusColor(sync.status)}`}>
									<StatusIcon status={sync.status} />
									{statusLabel(sync.status)}
								</Badge>
							</div>
						</CardHeader>

						<CardContent className="space-y-4">
							{/* Barra de progresso geral */}
							<div className="space-y-1.5">
								<div className="flex justify-between text-sm text-muted-foreground">
									<span>
										{sync.completed_steps} / {sync.total_steps} steps concluídos
									</span>
									<span>{progressPct}%</span>
								</div>
								<Progress value={progressPct} className="h-2" />
							</div>

							{/* Métricas */}
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								{(
									[
										["Inseridos/Atualizados", sync.total_upserted],
										["Desativados", sync.total_deactivated],
										["Steps OK", sync.successful_steps],
										["Steps Falhos", sync.failed_steps],
									] as [string, number][]
								).map(([label, val]) => (
									<div key={label} className="rounded-lg border bg-muted/30 px-4 py-3">
										<p className="text-xs text-muted-foreground">{label}</p>
										<p className="mt-0.5 text-xl font-semibold tabular-nums">{val.toLocaleString("pt-BR")}</p>
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

					{/* Tabela de steps */}
					{sync.steps.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Progresso por Step</CardTitle>
							</CardHeader>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<table className="w-full text-sm">
										<thead>
											<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
												<th className="px-4 py-2.5 text-left font-medium">Step</th>
												<th className="px-4 py-2.5 text-left font-medium">Status</th>
												<th className="px-4 py-2.5 text-right font-medium">Página</th>
												<th className="px-4 py-2.5 text-right font-medium">Registros</th>
												<th className="px-4 py-2.5 text-left font-medium">Erro</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{sync.steps.map((step) => (
												<tr key={step.id} className={step.status === "running" ? "bg-blue-500/5" : step.status === "error" ? "bg-red-500/5" : undefined}>
													<td className="px-4 py-2.5 font-mono text-xs">{step.step_name}</td>
													<td className="px-4 py-2.5">
														<span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(step.status)}`}>
															<StatusIcon status={step.status} />
															{statusLabel(step.status)}
														</span>
													</td>
													<td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
														{step.total_pages != null ? `${step.current_page} / ${step.total_pages}` : step.current_page > 0 ? step.current_page : "—"}
													</td>
													<td className="px-4 py-2.5 text-right tabular-nums">{step.records_upserted.toLocaleString("pt-BR")}</td>
													<td className="px-4 py-2.5 max-w-xs truncate text-xs text-muted-foreground">{step.error_message ?? "—"}</td>
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
