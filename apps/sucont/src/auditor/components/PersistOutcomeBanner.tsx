// Extraído de routes/auditor.tsx (port do SIAFI-x-SILOMS-Auditor): resultado da gravação da série.

import { formatCurrency } from "#/auditor/services/dataProcessor"
import type { PersistOutcome } from "#/auditor/services/upload"
import { Button } from "#/components/ui/button"

interface PersistOutcomeBannerProps {
	persistOutcome: PersistOutcome
	onClose: () => void
}

export function PersistOutcomeBanner({ persistOutcome, onClose }: PersistOutcomeBannerProps) {
	return (
		<div
			className={`mt-6 rounded-lg border p-4 text-body ${
				persistOutcome.status === "complete"
					? "border-border bg-card text-foreground"
					: persistOutcome.status === "partial"
						? "border-destructive/30 bg-destructive/10 text-destructive"
						: "border-warning/30 bg-warning/10 text-warning"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<p className="font-bold">
						{persistOutcome.status === "complete"
							? "Série gravada"
							: persistOutcome.status === "partial"
								? "Gravação INCOMPLETA — a série no banco está pela metade"
								: "Análise não gravada"}
						<span className="font-normal text-muted-foreground"> · {persistOutcome.filename}</span>
					</p>

					{persistOutcome.status === "failed" ? (
						<p>{persistOutcome.error} — os números abaixo vêm do arquivo em memória e serão perdidos ao recarregar a página.</p>
					) : (
						<>
							{persistOutcome.status === "partial" && (
								<p className="font-medium">
									{persistOutcome.rowsWritten} de {persistOutcome.rowsTotal} saldos entraram antes da falha ({persistOutcome.error}). Suba o arquivo de novo — a
									gravação é idempotente e completa o que faltou.
								</p>
							)}
							<p>
								{persistOutcome.inserted} saldos novos · {persistOutcome.unchanged} sem alteração · {persistOutcome.changed} com valor diferente do que já
								estava no banco
							</p>
							{persistOutcome.duplicateGrains > 0 && (
								<p>{persistOutcome.duplicateGrains} linha(s) do arquivo repetiam a mesma competência/UG/grupo — valeu a última ocorrência.</p>
							)}
						</>
					)}
				</div>
				<Button variant="link" size="sm" onClick={onClose} className="text-muted-foreground hover:text-foreground no-underline">
					Fechar
				</Button>
			</div>

			{persistOutcome.conflicts.length > 0 && (
				<details className="mt-3">
					<summary className="cursor-pointer text-label text-muted-foreground">
						Competências que já existiam com outro valor ({persistOutcome.changed}
						{persistOutcome.conflictsTruncated ? ", listando as primeiras" : ""})
					</summary>
					<div className="mt-2 max-h-64 overflow-y-auto font-mono text-caption">
						{persistOutcome.conflicts.map((c) => (
							<div key={`${c.period}-${c.ugCodigo}-${c.accountGroup}`} className="py-0.5">
								{c.period} · {c.ugCodigo} · {c.accountGroup}: SIAFI {formatCurrency(c.previous.siafiValue)} → {formatCurrency(c.next.siafiValue)} · SILOMS{" "}
								{formatCurrency(c.previous.silomsValue)} → {formatCurrency(c.next.silomsValue)}
							</div>
						))}
					</div>
				</details>
			)}
		</div>
	)
}
