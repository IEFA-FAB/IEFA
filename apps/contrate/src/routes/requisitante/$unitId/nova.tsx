import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { ExtractionFieldsView, type IntakeResult, SubmissionIntakeForm } from "@/components/alpha/SubmissionIntake"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useRunCompliance } from "@/lib/alpha/compliance"
import { CAMPO_LABELS, useRunExtraction } from "@/lib/alpha/submissions"

export const Route = createFileRoute("/alpha/analise/nova")({
	component: NovaAnalisePage,
})

function NovaAnalisePage() {
	// O resultado é limpo assim que um envio novo começa: deixar a extração
	// anterior na tela com o botão de verificar ativo faria o analista rodar a
	// conformidade do documento errado.
	const [result, setResult] = useState<IntakeResult | null>(null)
	const [submissionId, setSubmissionId] = useState<string | null>(null)
	const navigate = useNavigate()
	const runCompliance = useRunCompliance()
	const retryExtraction = useRunExtraction()

	const total = Object.keys(CAMPO_LABELS).length
	const filled = result ? Object.values(result.extraction.payload).filter((value) => value !== null).length : 0

	return (
		<div>
			<ConsoleNav
				title="Nova análise"
				subtitle="Envie um ETP ou Termo de Referência para extrair o JSON canônico da contratação. Todo campo preenchido carrega o trecho do documento que o originou."
			/>

			<div className="mb-8">
				<SubmissionIntakeForm
					onSubmitted={(id) => {
						setResult(null)
						setSubmissionId(id)
					}}
					onExtracted={setResult}
				/>

				{submissionId && !result ? (
					<div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
						<span>O documento foi enviado, mas a extração não concluiu.</span>
						<Button
							size="sm"
							variant="outline"
							disabled={retryExtraction.isPending}
							onClick={() => retryExtraction.mutate(submissionId, { onSuccess: (extraction) => setResult({ submissionId, extraction }) })}
						>
							{retryExtraction.isPending ? "extraindo…" : "tentar extrair de novo"}
						</Button>
						{retryExtraction.isError ? <span className="text-muted-foreground">{(retryExtraction.error as Error).message}</span> : null}
					</div>
				) : null}
			</div>

			{result ? (
				<>
					<div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
						<Button
							size="sm"
							variant="outline"
							disabled={runCompliance.isPending}
							onClick={async () => {
								const run = await runCompliance.mutateAsync({ submission_id: result.submissionId, extraction_id: result.extraction.id })
								navigate({ to: "/alpha/analise/$runId", params: { runId: run.run_id } })
							}}
						>
							{runCompliance.isPending ? "verificando…" : "verificar conformidade"}
						</Button>
						<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
							{filled}/{total} campos
						</Badge>
						<span className="text-muted-foreground">modelo: {result.extraction.model}</span>
						{result.extraction.dropped.length > 0 ? (
							<span className="text-muted-foreground">{result.extraction.dropped.length} campo(s) descartado(s) por evidência não localizada</span>
						) : null}
					</div>

					<ExtractionFieldsView submissionId={result.submissionId} payload={result.extraction.payload} spans={result.extraction.spans} />
				</>
			) : null}
		</div>
	)
}
