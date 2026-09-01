import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { RotateCcw, TriangleAlert } from "lucide-react"
import * as React from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { TrainingRoster } from "@/components/features/global/TrainingRoster"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import { fetchTrainingResetsFn, fetchTrainingScopeFn, resetTrainingScopeFn } from "@/server/training.fn"

/**
 * Rota: /admin/training
 * ACL: módulo "admin" nível 1 para ver; nível 2 para resetar (gate no domínio).
 */
export const Route = createFileRoute("/_protected/_modules/admin/training")({
	beforeLoad: (opts) => requirePermission(opts, "admin", 1),
	component: TrainingPage,
	head: () => ({ meta: [{ title: "Ambiente de Treino — SISUB" }] }),
})

/** Digitação exigida para confirmar — a ação é irreversível. */
const CONFIRM_WORD = "RESETAR"

function formatStamp(value: string | null) {
	if (!value) return "—"
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

function totalDeleted(counts: Record<string, number>) {
	return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

/**
 * Duração do trabalho, com a espera na fila ao lado quando ela foi relevante.
 *
 * As duas eram uma coluna só: o registro nasce antes do advisory lock, então uma execução
 * que esperou a vez creditava a espera à limpeza. Segundos de fila aparecem; os milissegundos
 * do caso normal, não — seriam ruído em toda linha. Execução anterior a 2026-08-25 tem
 * `queued_ms` nulo e continua mostrando só o total de antes.
 */
function formatDuration(durationMs: number | null, queuedMs: number | null) {
	const work = durationMs != null ? `${durationMs} ms` : "—"
	if (queuedMs == null || queuedMs < 1000) return work
	return `${work} + ${Math.round(queuedMs / 1000)} s em fila`
}

/**
 * Desfecho da execução, em português.
 *
 * "Em andamento" é reservado ao `running`: antes, ele era o texto de QUALQUER status
 * desconhecido, e as 6 execuções que o processo abandonou (container derrubado no meio)
 * apareciam como se ainda estivessem rodando — desde julho. Status que o app não conhece
 * aparece cru, que é honesto e depura sozinho.
 */
function resetOutcome(status: string, errorMessage: string | null): string {
	switch (status) {
		case "succeeded":
			return "Concluído"
		case "failed":
			return `Falhou — ${errorMessage ?? "sem detalhe"}`
		case "abandoned":
			return "Sem desfecho — o processo parou antes de registrar o resultado"
		case "running":
			return "Em andamento"
		default:
			return status
	}
}

function TrainingPage() {
	const queryClient = useQueryClient()
	const { can } = usePBAC()
	const canWrite = can("admin", 2)
	const [confirmOpen, setConfirmOpen] = React.useState(false)
	const [confirmText, setConfirmText] = React.useState("")

	const {
		data: scope,
		isLoading: scopeLoading,
		error: scopeError,
	} = useQuery({
		queryKey: queryKeys.training.scope(),
		queryFn: () => fetchTrainingScopeFn(),
	})

	const {
		data: resets = [],
		isLoading: resetsLoading,
		error: resetsError,
	} = useQuery({
		queryKey: queryKeys.training.resets(),
		queryFn: () => fetchTrainingResetsFn({ data: { limit: 20 } }),
	})

	const resetMutation = useMutation({
		mutationFn: () => resetTrainingScopeFn(),
		onSuccess: (result) => {
			toast.success(`Ambiente de treino resetado — ${totalDeleted(result.deleted_counts)} registros removidos`)
			setConfirmOpen(false)
			setConfirmText("")
			queryClient.invalidateQueries({ queryKey: queryKeys.training.scope() })
			queryClient.invalidateQueries({ queryKey: queryKeys.training.resets() })
		},
		onError: (error: Error) => toast.error("Falha ao resetar", { description: error.message }),
	})

	return (
		<div className="space-y-6">
			<PageHeader title="Ambiente de Treino">
				{canWrite && (
					<Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)} className="gap-2">
						<RotateCcw className="size-4" />
						Resetar ambiente de treino
					</Button>
				)}
			</PageHeader>

			{scopeError ? (
				<Alert variant="destructive">
					<TriangleAlert className="size-4" />
					<AlertTitle>Ambiente de treino indisponível</AlertTitle>
					<AlertDescription>{(scopeError as Error).message}</AlertDescription>
				</Alert>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>Escopo</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{scopeLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-5 w-64" />
							<Skeleton className="h-5 w-64" />
							<Skeleton className="h-5 w-64" />
						</div>
					) : scope ? (
						<>
							<dl className="grid gap-2 sm:grid-cols-3">
								<div>
									<dt className="text-caption text-muted-foreground">Unidade</dt>
									<dd className="text-sm">{scope.unit_name ?? `#${scope.unit_id}`}</dd>
								</div>
								<div>
									<dt className="text-caption text-muted-foreground">Cozinha</dt>
									<dd className="text-sm">{scope.kitchen_name ?? `#${scope.kitchen_id}`}</dd>
								</div>
								<div>
									<dt className="text-caption text-muted-foreground">Refeitório</dt>
									<dd className="text-sm">{scope.mess_hall_name ?? `#${scope.mess_hall_id}`}</dd>
								</div>
							</dl>

							<div>
								<p className="text-caption text-muted-foreground mb-1">Dados atualmente no ambiente</p>
								<ul className="text-sm space-y-0.5">
									{Object.entries(scope.pending_counts).map(([table, total]) => (
										<li key={table} className="flex justify-between max-w-md">
											<span className="text-muted-foreground font-mono text-xs">{table}</span>
											<span className="font-mono">{total}</span>
										</li>
									))}
								</ul>
							</div>
						</>
					) : null}
				</CardContent>
			</Card>

			<TrainingRoster />

			<Card>
				<CardHeader>
					<CardTitle>Histórico de resets</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader className="border-b border-foreground">
							<TableRow>
								<TableHead className="text-foreground text-subheading">Início</TableHead>
								<TableHead className="text-foreground text-subheading">Situação</TableHead>
								<TableHead className="text-foreground text-subheading">Duração</TableHead>
								<TableHead className="text-foreground text-subheading">Registros removidos</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{resetsLoading ? (
								<TableRow>
									<TableCell colSpan={4}>
										<Skeleton className="h-5 w-full" />
									</TableCell>
								</TableRow>
							) : resetsError ? (
								// Sem isto a falha virava "nenhum reset executado ainda" — a tela afirmaria
								// que o ambiente nunca foi resetado quando na verdade não conseguiu ler.
								<TableRow>
									<TableCell colSpan={4} className="h-20 text-center text-sm text-destructive">
										Não foi possível carregar o histórico: {(resetsError as Error).message}
									</TableCell>
								</TableRow>
							) : resets.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
										Nenhum reset executado ainda.
									</TableCell>
								</TableRow>
							) : (
								resets.map((run) => (
									<TableRow key={run.id}>
										<TableCell className="text-sm">{formatStamp(run.started_at)}</TableCell>
										<TableCell className="text-sm">{resetOutcome(run.status, run.error_message)}</TableCell>
										<TableCell className="text-sm font-mono">{formatDuration(run.duration_ms, run.queued_ms)}</TableCell>
										<TableCell className="text-sm font-mono">{totalDeleted(run.deleted_counts)}</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Dialog
				open={confirmOpen}
				onOpenChange={(open) => {
					if (!open) {
						setConfirmOpen(false)
						setConfirmText("")
					}
				}}
			>
				<DialogContent className="sm:max-w-[480px]">
					<DialogHeader>
						<DialogTitle>Resetar ambiente de treino</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<Alert variant="destructive">
							<TriangleAlert className="size-4" />
							<AlertTitle>Esta ação é irreversível</AlertTitle>
							<AlertDescription>
								Todo o conteúdo criado no ambiente de treino — cardápios, planos, produção, presenças e cópias locais de preparações — será apagado e
								substituído pelo modelo inicial. Nenhuma unidade real é afetada.
							</AlertDescription>
						</Alert>

						<div className="space-y-1.5">
							<Label htmlFor="confirm-reset" className="text-sm">
								Digite <span className="font-mono text-subheading">{CONFIRM_WORD}</span> para confirmar
							</Label>
							<Input id="confirm-reset" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
						</div>
					</div>

					<DialogFooter className="flex justify-between">
						<Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={resetMutation.isPending}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={() => resetMutation.mutate()} disabled={confirmText !== CONFIRM_WORD || resetMutation.isPending}>
							{resetMutation.isPending ? "Resetando..." : "Resetar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
