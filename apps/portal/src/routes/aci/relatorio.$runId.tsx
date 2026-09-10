import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Download, Printer, WarningTriangle } from "iconoir-react"
import { AciNav } from "@/components/aci/AciNav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { DECISION_LABEL, downloadReportMarkdown, type FinalReport, finalReportQueryOptions } from "@/lib/alpha/aci"
import { type Finding, SEVERITY_ORDER } from "@/lib/alpha/compliance"

export const Route = createFileRoute("/aci/relatorio/$runId")({
	loader: ({ context, params }) => {
		// Só no cliente: `alphaRequest` fala com outro serviço e não tem timeout —
		// no SSR uma chamada pendurada prenderia a resposta do documento.
		if (typeof document === "undefined") return

		const token = context.auth.session?.access_token
		if (!token) return

		void context.queryClient.query({ ...finalReportQueryOptions(token, params.runId), staleTime: "static" }).catch(() => {})
	},
	component: RelatorioPage,
	head: () => ({ meta: [{ title: "Relatório final · Plataforma ACI" }] }),
})

function formatDate(value: string | null | undefined) {
	if (!value) return "—"
	return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

const CATEGORY_LABEL: Record<string, string> = {
	ESTRUTURAL: "Estrutura",
	CONTEUDO: "Conteúdo",
	CRUZADA: "Checagem cruzada",
}

function sortBySeverity(findings: Finding[]): Finding[] {
	return [...findings].sort((left, right) => {
		const bySeverity = SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity)
		if (bySeverity !== 0) return bySeverity
		return (left.section_path ?? "").localeCompare(right.section_path ?? "")
	})
}

function ReportFinding({ finding }: { finding: Finding }) {
	return (
		<article className="border-border border-b py-4 last:border-b-0 print:break-inside-avoid">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
					{finding.severity}
				</Badge>
				<span className="text-xs uppercase tracking-[0.1em]">{CATEGORY_LABEL[finding.category] ?? finding.category}</span>
				{finding.section_path ? <span className="font-mono text-muted-foreground text-xs">seção {finding.section_path}</span> : null}
			</div>
			<p className="mt-2 text-sm">{finding.message}</p>
			{finding.legal_ref.length > 0 ? (
				<p className="mt-1 font-mono text-[11px] text-muted-foreground">
					Fundamento: {finding.legal_ref.map((ref) => `${ref.dispositivo} — ${ref.norma}`).join("; ")}
				</p>
			) : null}
			{finding.evidence_span?.text ? (
				<p className="mt-2 border-border border-l-2 pl-3 text-muted-foreground text-xs italic">“{finding.evidence_span.text}”</p>
			) : null}
			{finding.suggestion ? (
				<p className="mt-2 text-sm">
					<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Sugestão · </span>
					{finding.suggestion}
				</p>
			) : null}
			{finding.triage === "descartado" && finding.triage_note ? (
				<p className="mt-2 text-sm">
					<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Motivo do descarte · </span>
					{finding.triage_note}
				</p>
			) : null}
		</article>
	)
}

function FindingGroup({ title, findings, empty }: { title: string; findings: Finding[]; empty: string }) {
	return (
		<section className="mt-8">
			<h2 className="border-border border-b pb-2 font-semibold text-lg tracking-tight">
				{title} <span className="font-normal text-muted-foreground tabular-nums">({findings.length})</span>
			</h2>
			{findings.length === 0 ? (
				<p className="mt-3 text-muted-foreground text-sm">{empty}</p>
			) : (
				findings.map((finding) => <ReportFinding key={finding.id} finding={finding} />)
			)}
		</section>
	)
}

function ReportBody({ report }: { report: FinalReport }) {
	const review = report.reviews[0] ?? null
	const sorted = sortBySeverity(report.findings)
	const accepted = sorted.filter((finding) => finding.triage === "acatado")
	const discarded = sorted.filter((finding) => finding.triage === "descartado")
	const pending = sorted.filter((finding) => !finding.triage)

	return (
		<div className="border border-border bg-card p-6 print:border-0 print:p-0 sm:p-10">
			<p className="text-muted-foreground text-xs uppercase tracking-[0.12em]">Relatório de conformidade</p>
			<h1 className="mt-2 font-semibold text-2xl tracking-tighter">
				{report.submission.doc_kind} · {report.submission.filename}
			</h1>

			<div className="mt-4 flex flex-wrap items-center gap-3">
				<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Parecer</span>
				{review ? (
					<>
						<Badge className="text-[10px] uppercase tracking-[0.1em]">{DECISION_LABEL[review.decision]}</Badge>
						<span className="text-muted-foreground text-xs">{formatDate(review.created_at)}</span>
					</>
				) : (
					<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
						não emitido
					</Badge>
				)}
			</div>
			{review?.notes ? <p className="mt-3 whitespace-pre-wrap text-sm">{review.notes}</p> : null}

			<dl className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2">
				{[
					["Documento", `${report.submission.filename} (${report.submission.doc_kind})`],
					["Natureza do objeto", report.submission.objeto ?? "—"],
					["Modalidade", report.submission.modalidade ?? "—"],
					["Submetido em", formatDate(report.submission.created_at)],
					["Execução", `${formatDate(report.run.started_at)} · ${report.run.id}`],
					["Extração", report.extraction ? `${report.extraction.model} · ${report.extraction.id}` : "—"],
				].map(([label, value]) => (
					<div key={label} className="bg-card p-3">
						<dt className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{label}</dt>
						<dd className="mt-0.5 break-all text-sm">{value}</dd>
					</div>
				))}
			</dl>

			<section className="mt-8">
				<h2 className="border-border border-b pb-2 font-semibold text-lg tracking-tight">Referências usadas</h2>
				<ul className="mt-3 space-y-1 text-sm">
					<li>
						<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">Modelo AGU · </span>
						{report.model_document
							? `${report.model_document.title}${report.model_document.version_label ? ` (${report.model_document.version_label})` : ""}`
							: "nenhum modelo aplicável — comparação estrutural não executada"}
					</li>
					{report.law_documents.length === 0 ? <li className="text-muted-foreground">Nenhuma norma vigente registrada na execução.</li> : null}
					{report.law_documents.map((law) => (
						<li key={law.id}>
							<span className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{law.document_type} · </span>
							{law.title}
							{law.version_label ? ` (${law.version_label})` : ""}
						</li>
					))}
				</ul>
			</section>

			<section className="mt-8">
				<h2 className="border-border border-b pb-2 font-semibold text-lg tracking-tight">Cobertura da análise</h2>
				<dl className="mt-3 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
					{[
						["regras aplicadas", report.run.rules_applied],
						["não avaliadas", report.run.rules_not_assessed],
						["descartados pelo guard", report.run.discarded_findings],
						["achados apresentados", sorted.length],
					].map(([label, value]) => (
						<div key={label as string} className="bg-card p-3">
							<dt className="text-muted-foreground text-xs uppercase tracking-[0.1em]">{label}</dt>
							<dd className="mt-0.5 font-semibold text-xl tabular-nums">{value}</dd>
						</div>
					))}
				</dl>
			</section>

			<FindingGroup title="Achados acatados" findings={accepted} empty="Nenhum achado acatado." />
			{pending.length > 0 ? <FindingGroup title="Achados sem triagem" findings={pending} empty="" /> : null}
			<FindingGroup title="Achados descartados pelo analista" findings={discarded} empty="Nenhum." />

			{report.reviews.length > 1 ? (
				<section className="mt-8">
					<h2 className="border-border border-b pb-2 font-semibold text-lg tracking-tight">Histórico de pareceres</h2>
					<ul className="mt-3 space-y-2 text-sm">
						{report.reviews.map((item) => (
							<li key={item.id}>
								<span className="text-muted-foreground text-xs tabular-nums">{formatDate(item.created_at)}</span> — {DECISION_LABEL[item.decision]}
								{item.notes ? <span className="text-muted-foreground">: {item.notes}</span> : null}
							</li>
						))}
					</ul>
				</section>
			) : null}

			<p className="mt-10 border-border border-t pt-4 text-muted-foreground text-xs">
				A verificação automática aponta; a palavra final é do gestor. Este relatório reflete a legislação e os modelos vigentes na data da execução.
			</p>
		</div>
	)
}

function RelatorioPage() {
	const { runId } = Route.useParams()
	const { session } = useAuth()
	const token = session?.access_token
	const report = useQuery(finalReportQueryOptions(token, runId))
	const download = useMutation({ mutationFn: () => downloadReportMarkdown(token, runId) })

	return (
		<div>
			<AciNav
				title="Relatório final"
				subtitle="O que a máquina achou, o que o analista acatou ou descartou, e o parecer. Pronto para imprimir ou levar ao processo em Markdown."
				actions={
					<>
						{report.data ? (
							<Button
								render={<Link to="/aci/processos/$submissionId" params={{ submissionId: report.data.submission.id }} />}
								nativeButton={false}
								size="sm"
								variant="outline"
							>
								voltar ao processo
							</Button>
						) : null}
						<Button size="sm" variant="outline" disabled={!report.data || download.isPending} onClick={() => download.mutate()}>
							<Download className="size-4" />
							baixar .md
						</Button>
						<Button size="sm" disabled={!report.data} onClick={() => window.print()}>
							<Printer className="size-4" />
							imprimir
						</Button>
					</>
				}
			/>

			{report.isLoading ? <p className="text-muted-foreground text-sm">montando o relatório…</p> : null}
			{report.isError ? (
				<p className="flex items-center gap-2 text-sm">
					<WarningTriangle className="size-4" />
					{(report.error as Error).message}
				</p>
			) : null}
			{download.isError ? <p className="mb-4 text-sm">{(download.error as Error).message}</p> : null}

			{report.data ? <ReportBody report={report.data} /> : null}
		</div>
	)
}
