import { AlertTriangle, CheckCircle, Clock, FileText } from "lucide-react"

export function MetricsPanel() {
	// Placeholder - will be connected to real data later
	const metrics = {
		totalSubmissions: 0,
		averageTimeToDecision: "-",
		acceptanceRate: "-",
		underReview: 0,
		pendingReviews: 0,
	}

	return (
		<div className="space-y-4">
			<h2 className="font-semibold text-lg">Estatísticas Rápidas</h2>

			<div className="space-y-3">
				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Total de Submissões</span>
							<FileText className="size-4 text-muted-foreground" aria-hidden="true" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{metrics.totalSubmissions}</div>
						<p className="text-xs text-muted-foreground mt-1">Este ano</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Tempo Médio p/ Decisão</span>
							<Clock className="size-4 text-muted-foreground" aria-hidden="true" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{metrics.averageTimeToDecision}</div>
						<p className="text-xs text-muted-foreground mt-1">Dias</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Taxa de Aceitação</span>
							<CheckCircle className="size-4 text-muted-foreground" aria-hidden="true" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{metrics.acceptanceRate}</div>
						<p className="text-xs text-muted-foreground mt-1">Últimos 12 meses</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Em Revisão</span>
							<AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{metrics.underReview}</div>
						<p className="text-xs text-muted-foreground mt-1">Artigos ativos</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Revisões Pendentes</span>
							<AlertTriangle className="size-4 text-red-600 dark:text-red-400" aria-hidden="true" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{metrics.pendingReviews}</div>
						<p className="text-xs text-muted-foreground mt-1">Aguardando</p>
					</CardContent>
				</Card>
			</div>

			<p className="text-xs text-muted-foreground italic">📊 Estatísticas serão calculadas automaticamente</p>
		</div>
	)
}
