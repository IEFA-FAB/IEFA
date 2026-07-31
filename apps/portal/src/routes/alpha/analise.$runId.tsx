import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { WarningTriangle } from "iconoir-react"
import { useMemo, useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/useAuth"
import { complianceRunQueryOptions, type Finding, SEVERITY_ORDER, type Severity } from "@/lib/alpha/compliance"

export const Route = createFileRoute("/alpha/analise/$runId")({
	component: RelatorioPage,
})

type Tab = "estrutural" | "conformidade" | "execucao"

/**
 * Tonalidade de fundo por severidade.
 *
 * Sem faixa lateral colorida — proibida no monorepo — e sem raio, conforme o
 * contrato de estilo do portal. A distinção é etiqueta + fundo.
 */
const SEVERITY_TINT: Record<Severity, string> = {
	BLOQUEANTE: "bg-destructive/10",
	GRAVE: "bg-destructive/5",
	MEDIA: "bg-muted",
	INFORMATIVA: "bg-transparent",
}

function FindingCard({ finding }: { finding: Finding }) {
	return (
		<article className={`border border-border border-b-0 p-4 last:border-b ${SEVERITY_TINT[finding.severity]}`}>
			<div className="mb-2 flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
					{finding.severity}
				</Badge>
				<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
					{finding.category}
				</Badge>
				{finding.section_path ? <span className="font-mono text-muted-foreground text-xs">{finding.section_path}</span> : null}
				{finding.confidence !== null ? <span className="text-muted-foreground text-xs">confiança {finding.confidence.toFixed(2)}</span> : null}
			</div>

			<p className="text-sm">{finding.message}</p>

			{finding.legal_ref.length > 0 ? (
				<ul className="mt-2 space-y-0.5">
					{finding.legal_ref.map((ref) => (
						<li key={`${ref.norma}-${ref.dispositivo}`} className="font-mono text-[11px] text-muted-foreground">
							{ref.dispositivo} — {ref.norma}
						</li>
					))}
				</ul>
			) : null}

			{finding.evidence_span?.text ? <p className="mt-3 bg-background/60 p-2 text-muted-foreground text-xs italic">“{finding.evidence_span.text}”</p> : null}

			{finding.suggestion ? (
				<p className="mt-3 text-sm">
					<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Sugestão · </span>
					{finding.suggestion}
				</p>
			) : null}
		</article>
	)
}

function RelatorioPage() {
	const { runId } = Route.useParams()
	const { session } = useAuth()
	const report = useQuery(complianceRunQueryOptions(session?.access_token, runId))

	const [tab, setTab] = useState<Tab>("conformidade")
	const [severityFilter, setSeverityFilter] = useState<Severity | "todas">("todas")

	const findings = useMemo(() => {
		const all = report.data?.findings ?? []
		const byTab = all.filter((finding) => (tab === "estrutural" ? finding.category === "ESTRUTURAL" : finding.category !== "ESTRUTURAL"))
		const filtered = severityFilter === "todas" ? byTab : byTab.filter((finding) => finding.severity === severityFilter)

		return [...filtered].sort((left, right) => SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity))
	}, [report.data, tab, severityFilter])

	const run = report.data?.run

	return (
		<div>
			<ConsoleNav
				title="Relatório de conformidade"
				subtitle="O relatório declara a cobertura da análise — quantas regras foram aplicadas, quantas não puderam ser avaliadas e quantos achados foram descartados pelo guard de citação."
			/>

			{report.isLoading ? <p className="text-muted-foreground text-sm">carregando relatório…</p> : null}

			{report.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" />
					{(report.error as Error).message}
				</p>
			) : null}

			{run ? (
				<>
					<dl className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
						{[
							["regras aplicadas", run.rules_applied],
							["não avaliadas", run.rules_not_assessed],
							["achados descartados", run.discarded_findings],
							["normas usadas", run.law_document_ids.length],
						].map(([label, value]) => (
							<div key={label as string} className="bg-background p-4">
								<dt className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{label}</dt>
								<dd className="mt-1 font-semibold text-2xl tabular-nums">{value}</dd>
							</div>
						))}
					</dl>

					{!run.model_document_id ? (
						<p className="mb-6 border border-border p-3 text-sm">
							Nenhum modelo AGU aplicável foi encontrado para esta submissão — a comparação estrutural não foi executada.
						</p>
					) : null}

					<div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-border border-b">
						<nav className="-mb-px flex gap-6">
							{(["conformidade", "estrutural", "execucao"] as Tab[]).map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setTab(value)}
									className={`border-b-2 pb-3 text-sm ${tab === value ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
								>
									{value === "conformidade" ? "Conformidade" : value === "estrutural" ? "Estrutural" : "Execução"}
								</button>
							))}
						</nav>

						{tab !== "execucao" ? (
							<select
								value={severityFilter}
								onChange={(event) => setSeverityFilter(event.target.value as Severity | "todas")}
								className="mb-2 border border-border bg-background px-2 py-1 text-sm"
								aria-label="Filtrar por severidade"
							>
								<option value="todas">todas as severidades</option>
								{SEVERITY_ORDER.map((severity) => (
									<option key={severity} value={severity}>
										{severity}
									</option>
								))}
							</select>
						) : null}
					</div>

					{tab === "execucao" ? (
						<dl className="space-y-2 border border-border p-4 text-sm">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">execução</dt>
								<dd className="font-mono text-xs">{run.id}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">extração</dt>
								<dd className="font-mono text-xs">{run.extraction_id}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">modelo AGU</dt>
								<dd className="font-mono text-xs">{run.model_document_id ?? "—"}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">normas</dt>
								<dd className="font-mono text-xs">{run.law_document_ids.join(", ") || "—"}</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">status</dt>
								<dd>{run.status}</dd>
							</div>
						</dl>
					) : findings.length === 0 ? (
						<p className="border border-border p-8 text-center text-muted-foreground text-sm">Nenhum achado nesta aba com o filtro atual.</p>
					) : (
						<div>
							{findings.map((finding) => (
								<FindingCard key={finding.id} finding={finding} />
							))}
						</div>
					)}
				</>
			) : null}
		</div>
	)
}
