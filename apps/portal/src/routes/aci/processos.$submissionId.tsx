import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Page, Undo, WarningTriangle, Xmark } from "iconoir-react"
import { useEffect, useMemo, useState } from "react"
import { AciNav } from "@/components/aci/AciNav"
import { StageStepper } from "@/components/aci/StageStepper"
import { ExtractionFieldsView } from "@/components/alpha/SubmissionIntake"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/useAuth"
import {
	DECISION_LABEL,
	DECISIONS,
	type Decision,
	type Review,
	type Stage,
	submissionDetailQueryOptions,
	useIssueReview,
	useTriageFinding,
} from "@/lib/alpha/aci"
import { type ComplianceRun, complianceRunQueryOptions, type Finding, SEVERITY_ORDER, type Severity, useRunCompliance } from "@/lib/alpha/compliance"
import { alphaRole, canDecide } from "@/lib/alpha/role"
import { extractionsQueryOptions, useRunExtraction } from "@/lib/alpha/submissions"

export const Route = createFileRoute("/aci/processos/$submissionId")({
	loader: ({ context, params }) => {
		// Só no cliente: `alphaRequest` fala com outro serviço e não tem timeout —
		// no SSR uma chamada pendurada prenderia a resposta do documento.
		if (typeof document === "undefined") return

		const token = context.auth.session?.access_token
		if (!token) return

		void context.queryClient.query({ ...submissionDetailQueryOptions(token, params.submissionId), staleTime: "static" }).catch(() => {})
	},
	component: ProcessoPage,
	head: () => ({ meta: [{ title: "Processo · Plataforma ACI" }] }),
})

type Tab = "achados" | "extracao" | "parecer"

function formatDate(value: string | null | undefined) {
	if (!value) return "—"
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

/** Mesma derivação do α (`deriveStage`), sobre o que a tela já tem em mãos. */
function stageOf(hasExtraction: boolean, run: ComplianceRun | null, review: Review | null): Stage {
	if (run?.status === "succeeded") return review ? "parecer" : "verificado"
	if (hasExtraction) return "extraido"
	return "enviado"
}

/**
 * Tonalidade de fundo por severidade — etiqueta + fundo, sem faixa lateral
 * (proibida no monorepo) e sem raio (contrato do portal).
 */
const SEVERITY_TINT: Record<Severity, string> = {
	BLOQUEANTE: "bg-destructive/10",
	GRAVE: "bg-destructive/5",
	MEDIA: "bg-muted",
	INFORMATIVA: "bg-transparent",
}

function TriageControls({ finding, runId, submissionId }: { finding: Finding; runId: string; submissionId: string }) {
	const triage = useTriageFinding()
	const [discarding, setDiscarding] = useState(false)
	const [note, setNote] = useState("")

	const current = finding.triage ?? null

	if (current) {
		return (
			<div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
				<Badge variant={current === "acatado" ? "default" : "outline"} className="text-[10px] uppercase tracking-[0.1em]">
					{current}
				</Badge>
				{current === "descartado" && finding.triage_note ? <span className="text-muted-foreground">motivo: {finding.triage_note}</span> : null}
				<button
					type="button"
					disabled={triage.isPending}
					onClick={() => triage.mutate({ findingId: finding.id, runId, submissionId, triage: null })}
					className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
				>
					<Undo className="size-3" />
					desfazer
				</button>
			</div>
		)
	}

	return (
		<div className="mt-3">
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					disabled={triage.isPending}
					onClick={() => triage.mutate({ findingId: finding.id, runId, submissionId, triage: "acatado" })}
				>
					<Check className="size-4" />
					acatar
				</Button>
				<Button size="sm" variant="outline" disabled={triage.isPending} onClick={() => setDiscarding((value) => !value)}>
					<Xmark className="size-4" />
					descartar
				</Button>
			</div>

			{discarding ? (
				<div className="mt-2 space-y-2">
					<Textarea
						value={note}
						onChange={(event) => setNote(event.target.value)}
						rows={2}
						placeholder="Motivo do descarte — vai para o relatório"
						aria-label="Motivo do descarte"
					/>
					<Button
						size="sm"
						disabled={note.trim().length === 0 || triage.isPending}
						onClick={() => triage.mutate({ findingId: finding.id, runId, submissionId, triage: "descartado", note }, { onSuccess: () => setDiscarding(false) })}
					>
						confirmar descarte
					</Button>
				</div>
			) : null}

			{triage.isError ? <p className="mt-2 text-xs">{(triage.error as Error).message}</p> : null}
		</div>
	)
}

function FindingCard({ finding, runId, submissionId, decider }: { finding: Finding; runId: string; submissionId: string; decider: boolean }) {
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

			{decider ? (
				<TriageControls finding={finding} runId={runId} submissionId={submissionId} />
			) : finding.triage ? (
				<p className="mt-3 text-xs">
					<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
						{finding.triage}
					</Badge>
				</p>
			) : null}
		</article>
	)
}

function FindingsTab({ run, submissionId, decider }: { run: ComplianceRun; submissionId: string; decider: boolean }) {
	const { session } = useAuth()
	const report = useQuery(complianceRunQueryOptions(session?.access_token, run.id))
	const [severityFilter, setSeverityFilter] = useState<Severity | "todas">("todas")
	const [onlyPending, setOnlyPending] = useState(false)

	const findings = useMemo(() => {
		const all = report.data?.findings ?? []
		const bySeverity = severityFilter === "todas" ? all : all.filter((finding) => finding.severity === severityFilter)
		const byTriage = onlyPending ? bySeverity.filter((finding) => !finding.triage) : bySeverity
		return [...byTriage].sort((left, right) => SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity))
	}, [report.data, severityFilter, onlyPending])

	const pending = (report.data?.findings ?? []).filter((finding) => !finding.triage).length

	if (report.isLoading) return <p className="text-muted-foreground text-sm">carregando achados…</p>
	if (report.isError) {
		return (
			<p className="flex items-center gap-2 text-sm">
				<WarningTriangle className="size-4" />
				{(report.error as Error).message}
			</p>
		)
	}

	return (
		<div>
			<dl className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
				{[
					["regras aplicadas", run.rules_applied],
					["não avaliadas", run.rules_not_assessed],
					["descartados pelo guard", run.discarded_findings],
					["sem triagem", pending],
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

			<div className="mb-4 flex flex-wrap items-center gap-3">
				<Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as Severity | "todas")}>
					<SelectTrigger className="w-52" aria-label="Filtrar por severidade">
						<SelectValue>{severityFilter === "todas" ? "todas as severidades" : severityFilter}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="todas">todas as severidades</SelectItem>
						{SEVERITY_ORDER.map((severity) => (
							<SelectItem key={severity} value={severity}>
								{severity}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} />
					só sem triagem
				</label>
			</div>

			{findings.length === 0 ? (
				<p className="border border-border p-8 text-center text-muted-foreground text-sm">Nenhum achado com o filtro atual.</p>
			) : (
				<div>
					{findings.map((finding) => (
						<FindingCard key={finding.id} finding={finding} runId={run.id} submissionId={submissionId} decider={decider} />
					))}
				</div>
			)}
		</div>
	)
}

function ExtractionTab({ submissionId }: { submissionId: string }) {
	const { session } = useAuth()
	const extractions = useQuery(extractionsQueryOptions(session?.access_token, submissionId))
	const latest = extractions.data?.[0]

	if (extractions.isLoading) return <p className="text-muted-foreground text-sm">carregando extração…</p>
	if (extractions.isError) return <p className="text-sm">{(extractions.error as Error).message}</p>
	if (!latest) return <p className="border border-border p-8 text-center text-muted-foreground text-sm">Este processo ainda não foi extraído.</p>

	return (
		<div>
			<p className="mb-4 text-muted-foreground text-xs">
				extração {formatDate(latest.created_at)} · modelo {latest.model}
				{extractions.data && extractions.data.length > 1 ? ` · ${extractions.data.length - 1} anterior(es)` : ""}
			</p>
			<ExtractionFieldsView submissionId={submissionId} payload={latest.payload} spans={latest.spans} />
		</div>
	)
}

function ReviewTab({ run, submissionId, reviews, decider }: { run: ComplianceRun; submissionId: string; reviews: Review[]; decider: boolean }) {
	const { session } = useAuth()
	const report = useQuery(complianceRunQueryOptions(session?.access_token, run.id))
	const issue = useIssueReview()

	const [decision, setDecision] = useState<Decision | null>(null)
	const [notes, setNotes] = useState("")

	const current = reviews[0] ?? null

	// Resumo do que o α vai checar ao emitir — para o analista ver ANTES de clicar.
	const summary = useMemo(() => {
		const all = report.data?.findings ?? []
		const critical = all.filter((finding) => finding.severity === "BLOQUEANTE" || finding.severity === "GRAVE")
		return {
			criticalPending: critical.filter((finding) => !finding.triage).length,
			blockingAccepted: all.filter((finding) => finding.severity === "BLOQUEANTE" && finding.triage === "acatado").length,
			graveAccepted: all.filter((finding) => finding.severity === "GRAVE" && finding.triage === "acatado").length,
			accepted: all.filter((finding) => finding.triage === "acatado").length,
			discarded: all.filter((finding) => finding.triage === "descartado").length,
		}
	}, [report.data])

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
			<div>
				{current ? (
					<div className="border border-border p-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge className="text-[10px] uppercase tracking-[0.1em]">{DECISION_LABEL[current.decision]}</Badge>
							<span className="text-muted-foreground text-xs">{formatDate(current.created_at)}</span>
						</div>
						{current.notes ? <p className="mt-3 whitespace-pre-wrap text-sm">{current.notes}</p> : null}
						<div className="mt-4">
							<Button render={<Link to="/aci/relatorio/$runId" params={{ runId: run.id }} />} nativeButton={false} size="sm" variant="outline">
								<Page className="size-4" />
								relatório final
							</Button>
						</div>
					</div>
				) : (
					<div className="border border-border p-6">
						<p className="font-medium text-sm">Nenhum parecer emitido para esta execução.</p>
						<p className="mt-1 text-muted-foreground text-sm">Trie os achados críticos na aba Achados e emita o parecer ao lado.</p>
					</div>
				)}

				{reviews.length > 1 ? (
					<div className="mt-6">
						<h3 className="mb-2 text-muted-foreground text-xs uppercase tracking-[0.12em]">Pareceres anteriores</h3>
						<ul className="border border-border">
							{reviews.slice(1).map((review) => (
								<li key={review.id} className="border-border border-b px-4 py-3 text-sm last:border-b-0">
									<span className="font-medium">{DECISION_LABEL[review.decision]}</span>
									<span className="text-muted-foreground text-xs"> · {formatDate(review.created_at)}</span>
									{review.notes ? <p className="mt-1 text-muted-foreground">{review.notes}</p> : null}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>

			<aside className="border border-border p-4 lg:sticky lg:top-6 lg:h-fit">
				<h3 className="text-xs uppercase tracking-[0.12em]">{current ? "Novo parecer" : "Emitir parecer"}</h3>
				<p className="mt-1 text-muted-foreground text-xs">Cada emissão é registro novo; a anterior fica no histórico.</p>

				<dl className="mt-4 space-y-1 text-xs">
					<div className="flex justify-between gap-2">
						<dt className="text-muted-foreground">acatados / descartados</dt>
						<dd className="tabular-nums">
							{summary.accepted} / {summary.discarded}
						</dd>
					</div>
					<div className="flex justify-between gap-2">
						<dt className="text-muted-foreground">críticos sem triagem</dt>
						<dd className={`tabular-nums ${summary.criticalPending > 0 ? "font-medium" : ""}`}>{summary.criticalPending}</dd>
					</div>
					<div className="flex justify-between gap-2">
						<dt className="text-muted-foreground">bloqueantes acatados</dt>
						<dd className="tabular-nums">{summary.blockingAccepted}</dd>
					</div>
					<div className="flex justify-between gap-2">
						<dt className="text-muted-foreground">graves acatados</dt>
						<dd className="tabular-nums">{summary.graveAccepted}</dd>
					</div>
				</dl>

				{!decider ? (
					<p className="mt-4 text-muted-foreground text-sm">Só o perfil ACI emite parecer.</p>
				) : (
					<div className="mt-4 space-y-3">
						<div>
							<label htmlFor="aci-decision" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
								Decisão
							</label>
							<Select value={decision} onValueChange={(value) => setDecision(value as Decision | null)}>
								<SelectTrigger id="aci-decision" className="w-full">
									<SelectValue>{decision ? DECISION_LABEL[decision] : "selecione"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{DECISIONS.map((value) => (
										<SelectItem key={value} value={value}>
											{DECISION_LABEL[value]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div>
							<label htmlFor="aci-notes" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
								Fundamentação
							</label>
							<Textarea
								id="aci-notes"
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								rows={6}
								placeholder="O que motiva a decisão — vai para o relatório."
							/>
						</div>

						<Button
							disabled={!decision || issue.isPending}
							onClick={() => {
								if (!decision) return
								issue.mutate(
									{ runId: run.id, submissionId, decision, notes: notes.trim() || undefined },
									{
										onSuccess: () => {
											setDecision(null)
											setNotes("")
										},
									}
								)
							}}
						>
							{issue.isPending ? "emitindo…" : "emitir parecer"}
						</Button>

						{issue.isError ? (
							<p className="flex items-start gap-2 text-sm">
								<WarningTriangle className="mt-0.5 size-4 shrink-0" />
								{(issue.error as Error).message}
							</p>
						) : null}
					</div>
				)}
			</aside>
		</div>
	)
}

function ProcessoPage() {
	const { submissionId } = Route.useParams()
	const { user, session } = useAuth()
	const token = session?.access_token
	const queryClient = useQueryClient()
	const decider = canDecide(alphaRole(user))

	const detail = useQuery(submissionDetailQueryOptions(token, submissionId))
	const runExtraction = useRunExtraction()
	const runCompliance = useRunCompliance()

	const [tab, setTab] = useState<Tab>("achados")
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

	const runs = detail.data?.runs ?? []
	const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null

	// Execução nova acabou de aparecer: selecioná-la é o que o analista espera.
	useEffect(() => {
		if (runs[0] && (selectedRunId === null || !runs.some((run) => run.id === selectedRunId))) setSelectedRunId(runs[0].id)
	}, [runs, selectedRunId])

	const latestExtraction = detail.data?.extractions[0] ?? null
	const reviewsOfRun = (detail.data?.reviews ?? []).filter((review) => review.run_id === selectedRun?.id)
	const stage = stageOf(Boolean(latestExtraction), runs[0] ?? null, (detail.data?.reviews ?? []).find((review) => review.run_id === runs[0]?.id) ?? null)

	const refresh = () => {
		queryClient.invalidateQueries({ queryKey: ["alpha", "submissions", submissionId] })
		queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "queue"] })
	}

	const submission = detail.data?.submission

	return (
		<div>
			<AciNav
				title={submission?.filename ?? "Processo"}
				subtitle={
					submission
						? `${submission.doc_kind}${submission.objeto ? ` · ${submission.objeto}` : ""}${submission.modalidade ? ` · ${submission.modalidade}` : ""} · enviado ${formatDate(submission.created_at)}`
						: undefined
				}
				actions={
					submission ? (
						<>
							<Button size="sm" variant="outline" disabled={runExtraction.isPending} onClick={() => runExtraction.mutate(submissionId, { onSuccess: refresh })}>
								{runExtraction.isPending ? "extraindo…" : latestExtraction ? "extrair novamente" : "extrair"}
							</Button>
							<Button
								size="sm"
								disabled={!latestExtraction || runCompliance.isPending}
								title={latestExtraction ? undefined : "extraia o documento antes de verificar"}
								onClick={() => {
									if (!latestExtraction) return
									runCompliance.mutate(
										{ submission_id: submissionId, extraction_id: latestExtraction.id },
										{
											onSuccess: (run) => {
												refresh()
												setSelectedRunId(run.run_id)
												setTab("achados")
											},
										}
									)
								}}
							>
								{runCompliance.isPending ? "verificando…" : runs.length > 0 ? "verificar novamente" : "verificar conformidade"}
							</Button>
						</>
					) : null
				}
			/>

			{detail.isLoading ? <p className="text-muted-foreground text-sm">carregando processo…</p> : null}
			{detail.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" />
					{(detail.error as Error).message}
				</p>
			) : null}
			{runExtraction.isError ? <p className="mb-4 text-sm">{(runExtraction.error as Error).message}</p> : null}
			{runCompliance.isError ? <p className="mb-4 text-sm">{(runCompliance.error as Error).message}</p> : null}
			{runCompliance.isPending ? (
				<p className="mb-4 border border-border p-3 text-muted-foreground text-sm">
					A verificação julga cada regra ativa contra a norma vigente — leva alguns minutos.
				</p>
			) : null}

			{detail.data ? (
				<>
					<div className="mb-6">
						<StageStepper stage={stage} />
					</div>

					{runs.length > 1 ? (
						<div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
							<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Execução</span>
							<Select value={selectedRun?.id ?? null} onValueChange={(value) => setSelectedRunId(value)}>
								<SelectTrigger className="w-72" aria-label="Escolher execução">
									<SelectValue>{selectedRun ? `${formatDate(selectedRun.started_at)} · ${selectedRun.status}` : "—"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{runs.map((run) => (
										<SelectItem key={run.id} value={run.id}>
											{formatDate(run.started_at)} · {run.status}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}

					<div className="mb-6 border-border border-b">
						<nav className="-mb-px flex gap-6">
							{(["achados", "extracao", "parecer"] as Tab[]).map((value) => (
								<button
									key={value}
									type="button"
									onClick={() => setTab(value)}
									className={`border-b-2 pb-3 text-sm ${tab === value ? "border-foreground font-medium" : "border-transparent text-muted-foreground"}`}
								>
									{value === "achados" ? "Achados" : value === "extracao" ? "Extração" : "Parecer"}
								</button>
							))}
						</nav>
					</div>

					{tab === "extracao" ? <ExtractionTab submissionId={submissionId} /> : null}

					{tab !== "extracao" && !selectedRun ? (
						<div className="border border-border p-8 text-center">
							<p className="font-medium text-sm">Este processo ainda não foi verificado.</p>
							<p className="mt-1 text-muted-foreground text-sm">
								{latestExtraction
									? "A extração está pronta — verifique a conformidade para ver os achados."
									: "Extraia o documento e depois verifique a conformidade."}
							</p>
						</div>
					) : null}

					{tab !== "extracao" && selectedRun && selectedRun.status !== "succeeded" ? (
						<p className="border border-border p-4 text-sm">
							Esta execução terminou como <span className="font-mono">{selectedRun.status}</span>. Verifique novamente para obter achados.
						</p>
					) : null}

					{tab === "achados" && selectedRun?.status === "succeeded" ? <FindingsTab run={selectedRun} submissionId={submissionId} decider={decider} /> : null}
					{tab === "parecer" && selectedRun?.status === "succeeded" ? (
						<ReviewTab run={selectedRun} submissionId={submissionId} reviews={reviewsOfRun} decider={decider} />
					) : null}
				</>
			) : null}
		</div>
	)
}
