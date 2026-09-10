import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { ExtractionFieldsView, type IntakeResult, SubmissionIntakeForm } from "@/components/alpha/SubmissionIntake"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useRunCompliance } from "@/lib/alpha/compliance"
import { CAMPO_LABELS } from "@/lib/alpha/submissions"

export const Route = createFileRoute("/alpha/analise/nova")({
	component: NovaAnalisePage,
})

function NovaAnalisePage() {
	const [result, setResult] = useState<IntakeResult | null>(null)
	const navigate = useNavigate()
	const runCompliance = useRunCompliance()

	const extraction = result?.extraction ?? null
	const total = Object.keys(CAMPO_LABELS).length
	const preenchidos = extraction ? Object.values(extraction.payload).filter((value) => value !== null).length : 0

	return (
		<div>
			<ConsoleNav
				title="Nova análise"
				subtitle="Envie um ETP ou Termo de Referência para extrair o JSON canônico da contratação. Todo campo preenchido carrega o trecho do documento que o originou."
			/>

			<div className="mb-8">
				<SubmissionIntakeForm onExtracted={setResult} />
			</div>

			{result && extraction ? (
				<>
					<div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
						<Button
							size="sm"
							variant="outline"
							disabled={runCompliance.isPending}
							onClick={async () => {
								const run = await runCompliance.mutateAsync({ submission_id: result.submissionId, extraction_id: extraction.id })
								navigate({ to: "/alpha/analise/$runId", params: { runId: run.run_id } })
							}}
						>
							{runCompliance.isPending ? "verificando…" : "verificar conformidade"}
						</Button>
						<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
							{preenchidos}/{total} campos
						</Badge>
						<span className="text-muted-foreground">modelo: {extraction.model}</span>
						{extraction.dropped.length > 0 ? (
							<span className="text-muted-foreground">{extraction.dropped.length} campo(s) descartado(s) por evidência não localizada</span>
						) : null}
					</div>

					<ExtractionFieldsView submissionId={result.submissionId} payload={extraction.payload} spans={extraction.spans} />
				</>
			) : null}
		</div>
	)
}
