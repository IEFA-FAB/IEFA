/**
 * Último passo: enquadramento, pendências, as peças campo a campo, o guia de preenchimento e
 * o envio do ETP e do TR à ACI.
 */

import {
	buildDocuments,
	checkDemand,
	DEMAND_STEP_LABEL,
	DEMAND_STEPS,
	type DemandCheck,
	type DemandPayload,
	type DemandStep,
	type FormField,
	fieldContentHtml,
	fieldContentText,
	formatBRL,
	renderFillingGuide,
	type SystemForm,
} from "@iefa/alpha-client/demand"
import { Link } from "@tanstack/react-router"
import { Check, Copy, Download, Send, WarningTriangle } from "iconoir-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlphaRequestError } from "@/lib/alpha/client"
import { useRunCompliance } from "@/lib/alpha/compliance"
import { type DemandDetail, useSubmitDemand } from "@/lib/alpha/demands"
import { formatDateTime } from "@/lib/alpha/format"
import { useRunExtraction } from "@/lib/alpha/submissions"
import { CheckList, StepIntro } from "./fields"

// ─────────────────────────────────────────────────────────────────────────────
// Copiar campo
// ─────────────────────────────────────────────────────────────────────────────

async function copyField(field: FormField): Promise<void> {
	const html = fieldContentHtml(field)
	const text = fieldContentText(field)
	if (typeof ClipboardItem !== "undefined") {
		await navigator.clipboard.write([
			new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
		])
		return
	}
	await navigator.clipboard.writeText(text)
}

function CopyFieldButton({ field }: { field: FormField }) {
	const [state, setState] = useState<"idle" | "done" | "failed">("idle")
	return (
		<Button
			variant="outline"
			size="xs"
			onClick={() =>
				copyField(field).then(
					() => {
						setState("done")
						setTimeout(() => setState("idle"), 1500)
					},
					() => setState("failed")
				)
			}
		>
			{state === "done" ? <Check /> : <Copy />}
			{state === "done" ? "copiado" : state === "failed" ? "falhou" : "copiar"}
		</Button>
	)
}

const KIND_LABEL: Record<FormField["kind"], string> = {
	texto: "texto",
	texto_rico: "texto com formatação",
	numero: "número",
	data: "data",
	selecao: "seleção",
	tabela: "tabela",
	radio: "opção",
	manter: "manter o modelo",
}

function FieldPreview({ field }: { field: FormField }) {
	const length = field.value.trim().length
	const over = field.maxLength !== undefined && length > field.maxLength
	const hasPending = field.value.includes("[PREENCHER:") || (field.table?.rows.some((row) => row.some((cell) => cell.includes("[PREENCHER:"))) ?? false)
	return (
		<div className={`border ${hasPending ? "border-foreground" : "border-border"}`}>
			<div className="flex flex-wrap items-center gap-2 border-border border-b bg-muted/40 px-3 py-1.5">
				<span className="font-medium text-sm">{field.label}</span>
				<span className="text-label text-muted-foreground">{KIND_LABEL[field.kind]}</span>
				{field.maxLength !== undefined ? (
					<span className={`text-xs tabular-nums ${over ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
						{length}/{field.maxLength}
					</span>
				) : null}
				<span className="flex-1" />
				{field.kind !== "manter" && (field.value || field.table) ? <CopyFieldButton field={field} /> : null}
			</div>
			{field.note ? <p className="px-3 pt-2 text-muted-foreground text-xs">{field.note}</p> : null}
			{field.value ? <div className="whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed">{field.value}</div> : null}
			{field.table ? (
				<div className="overflow-x-auto px-3 pb-3">
					<table className="w-full text-left text-xs">
						<thead>
							<tr>
								{field.table.columns.map((column) => (
									<th key={column} className="border border-border bg-muted/40 px-2 py-1 font-medium">
										{column}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{field.table.rows.map((row, rowIndex) => (
								<tr key={rowIndex}>
									{row.map((cell, cellIndex) => (
										<td key={cellIndex} className="border border-border px-2 py-1 align-top">
											{cell}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}
		</div>
	)
}

export function FormPreview({ form }: { form: SystemForm }) {
	return (
		<div className="space-y-4">
			<div className="border border-border p-3 text-sm">
				<p>
					<span className="text-label text-muted-foreground">Onde</span> {form.system}
				</p>
				<p className="mt-1">
					<span className="text-label text-muted-foreground">Caminho</span> {form.path}
				</p>
				{form.tips.length ? (
					<ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-xs">
						{form.tips.map((tip) => (
							<li key={tip}>{tip}</li>
						))}
					</ul>
				) : null}
			</div>
			{form.sections.map((section) => (
				<section key={section.title} className="space-y-2">
					<h4 className="font-semibold text-sm">{section.title}</h4>
					{section.fields.map((field) => (
						<FieldPreview key={field.key} field={field} />
					))}
				</section>
			))}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Envio à ACI
// ─────────────────────────────────────────────────────────────────────────────

type PipelineStage = "extraindo" | "verificando" | "pronto" | "falhou"

interface PipelineEntry {
	submissionId: string
	docKind: string
	stage: PipelineStage
	error?: string
}

function useSendToAci(demandId: string, updatedAt: () => string, onSubmitted: (updatedAt: string) => void) {
	const submit = useSubmitDemand(demandId)
	const extract = useRunExtraction()
	const verify = useRunCompliance()
	const [entries, setEntries] = useState<PipelineEntry[]>([])
	const [blocked, setBlocked] = useState<Array<{ step: DemandStep; message: string }>>([])

	const patch = (submissionId: string, next: Partial<PipelineEntry>) =>
		setEntries((current) => current.map((entry) => (entry.submissionId === submissionId ? { ...entry, ...next } : entry)))

	const run = async () => {
		setBlocked([])
		try {
			const { submissions, updated_at } = await submit.mutateAsync({ expected_updated_at: updatedAt() })
			onSubmitted(updated_at)
			setEntries(submissions.map((submission) => ({ submissionId: submission.id, docKind: submission.doc_kind, stage: "extraindo" })))
			// Em sequência: a extração e a verificação chamam o modelo, e o teto por usuário vale
			// para as duas peças juntas.
			for (const submission of submissions) {
				try {
					const extraction = await extract.mutateAsync(submission.id)
					patch(submission.id, { stage: "verificando" })
					await verify.mutateAsync({ submission_id: submission.id, extraction_id: extraction.id })
					patch(submission.id, { stage: "pronto" })
				} catch (error) {
					patch(submission.id, { stage: "falhou", error: (error as Error).message })
				}
			}
		} catch (error) {
			// Envio desfeito no α: a versão mudou na reversão, e a gravação seguinte precisa dela.
			if (error instanceof AlphaRequestError && typeof error.body?.updated_at === "string") onSubmitted(error.body.updated_at)
			if (error instanceof AlphaRequestError && error.code === "DEMAND_BLOCKED") {
				setBlocked((error.body?.checks as Array<{ step: DemandStep; message: string }> | undefined) ?? [])
			}
			throw error
		}
	}

	return { run, entries, blocked, submit }
}

const STAGE_LABEL: Record<PipelineStage, string> = {
	extraindo: "extraindo os campos…",
	verificando: "verificando a conformidade (leva alguns minutos)…",
	pronto: "na fila da ACI, verificado",
	falhou: "falhou",
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo
// ─────────────────────────────────────────────────────────────────────────────

function groupByStep(checks: readonly DemandCheck[]): Array<[DemandStep, DemandCheck[]]> {
	return DEMAND_STEPS.map((step) => [step, checks.filter((check) => check.step === step)] as [DemandStep, DemandCheck[]]).filter(([, list]) => list.length > 0)
}

function downloadGuide(html: string, title: string) {
	const slug =
		title
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60) || "demanda"
	const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = `guia-compras-${slug}.html`
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ReviewStep({
	demand,
	detail,
	title,
	unitLabel,
	scopeId,
	isSaved,
	updatedAt,
	onSubmitted,
	onGoto,
}: {
	demand: DemandPayload
	detail: DemandDetail
	title: string
	unitLabel: string
	scopeId: string
	/** Envio só com tudo gravado: o α gera as peças do que está no banco. */
	isSaved: boolean
	/** `updated_at` da última gravação: o envio só vale sobre a versão que a pessoa está vendo. */
	updatedAt: () => string
	onSubmitted: (updatedAt: string) => void
	onGoto: (step: DemandStep) => void
}) {
	const documents = useMemo(() => buildDocuments(demand), [demand])
	const checks = useMemo(() => checkDemand(demand), [demand])
	const blocking = checks.filter((check) => check.severity === "bloqueia")
	const { framing, prices } = documents
	const send = useSendToAci(detail.id, updatedAt, onSubmitted)
	const [tab, setTab] = useState<string>("dfd")

	return (
		<div className="space-y-8">
			<StepIntro title="Documentos e envio">
				<p>
					As peças abaixo saem da demanda, campo a campo e na ordem dos formulários do Compras.gov.br: DFD no PGC, ETP Digital, Mapa de Riscos, Termo de
					Referência e as peças dos autos. Como todas vêm da mesma fonte, objeto, itens e valores são os mesmos em todas.
				</p>
				<p>
					O guia de preenchimento é um arquivo HTML para abrir ao lado do sistema, com um botão Copiar em cada campo. O ETP e o TR vão também à ACI, para a
					conferência.
				</p>
			</StepIntro>

			<section className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
				<div className="bg-background p-4">
					<p className="text-label text-muted-foreground">Enquadramento</p>
					<p className="mt-1 font-medium text-sm">{framing.label}</p>
					{framing.legalBasis ? <p className="mt-1 text-muted-foreground text-xs">{framing.legalBasis}</p> : null}
				</div>
				<div className="bg-background p-4">
					<p className="text-label text-muted-foreground">Valor estimado</p>
					<p className="mt-1 font-medium text-sm tabular-nums">{prices.total === null ? "pendente" : formatBRL(prices.total)}</p>
					{framing.limit !== null && framing.route !== "inexigibilidade_74_I" ? (
						<p className="mt-1 text-muted-foreground text-xs">
							limite da dispensa {formatBRL(framing.limit)} ({framing.limitsDecree})
						</p>
					) : null}
				</div>
				<div className="bg-background p-4 sm:col-span-2">
					<p className="text-label text-muted-foreground">Modelo de TR no sistema</p>
					<p className="mt-1 text-sm">{framing.trModel || "defina a natureza do objeto"}</p>
				</div>
			</section>

			<section className="space-y-3">
				<h3 className="font-semibold text-lg tracking-tight">Pendências</h3>
				{checks.length === 0 ? <p className="text-muted-foreground text-sm">Nenhuma pendência.</p> : null}
				{groupByStep(checks).map(([step, list]) => (
					<div key={step} className="space-y-2">
						<button type="button" onClick={() => onGoto(step)} className="text-label text-muted-foreground underline-offset-4 hover:underline">
							{DEMAND_STEP_LABEL[step]} · ir ao passo
						</button>
						<CheckList checks={list} />
					</div>
				))}
			</section>

			<section className="flex flex-wrap items-start gap-3 border border-border p-4">
				<div className="min-w-0 flex-1">
					<p className="font-medium text-sm">Guia de preenchimento do Compras.gov.br</p>
					<p className="mt-1 text-muted-foreground text-xs">
						Arquivo HTML autônomo: abre no navegador, imprime e pode ir por e-mail a quem vai cadastrar. Não inclui CPF.
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() =>
						downloadGuide(renderFillingGuide(demand, documents, checks, { title: title || "Demanda", unit: unitLabel, generatedAt: new Date() }), title)
					}
				>
					<Download />
					baixar o guia
				</Button>
			</section>

			<section className="space-y-3 border border-border p-4">
				<div className="flex flex-wrap items-start gap-3">
					<div className="min-w-0 flex-1">
						<p className="font-medium text-sm">Enviar o ETP e o TR à ACI</p>
						<p className="mt-1 text-muted-foreground text-xs">
							O α gera as duas peças em .docx a partir do que está gravado, extrai os campos e verifica a conformidade contra a Lei nº 14.133/2021 e os modelos
							da AGU. O controle interno da OM tria os achados e emite o parecer.
						</p>
					</div>
					<Button disabled={!detail.can_edit || blocking.length > 0 || !isSaved || send.submit.isPending} onClick={() => send.run().catch(() => {})}>
						<Send />
						{send.submit.isPending ? "gerando…" : detail.submissions.length > 0 ? "enviar nova versão" : "enviar à ACI"}
					</Button>
				</div>
				{blocking.length > 0 ? (
					<p className="flex items-start gap-2 text-sm">
						<WarningTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						Resolva as {blocking.length} pendências que bloqueiam o envio.
					</p>
				) : null}
				{!isSaved ? <p className="text-muted-foreground text-xs">Aguardando a gravação das últimas alterações.</p> : null}
				{send.submit.isError && send.blocked.length === 0 ? <p className="text-sm">{(send.submit.error as Error).message}</p> : null}
				{send.blocked.length > 0 ? (
					<ul className="space-y-1 text-sm">
						{send.blocked.map((check) => (
							<li key={check.message}>
								{DEMAND_STEP_LABEL[check.step]}: {check.message}
							</li>
						))}
					</ul>
				) : null}

				{send.entries.length > 0 ? (
					<ul className="divide-y divide-border border border-border">
						{send.entries.map((entry) => (
							<li key={entry.submissionId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
								<span className="font-mono text-xs">{entry.docKind}</span>
								<span className={entry.stage === "falhou" ? "text-destructive" : "text-muted-foreground"}>
									{STAGE_LABEL[entry.stage]}
									{entry.error ? `: ${entry.error}` : ""}
								</span>
								<span className="flex-1" />
								<Link
									to="/requisitante/$unitId/processos/$submissionId"
									params={{ unitId: scopeId, submissionId: entry.submissionId }}
									className="underline underline-offset-4"
								>
									abrir o processo
								</Link>
							</li>
						))}
					</ul>
				) : null}

				{detail.submissions.length > 0 ? (
					<div className="space-y-1">
						<p className="text-label text-muted-foreground">Enviadas antes</p>
						<ul className="space-y-1 text-sm">
							{detail.submissions.map((submission) => (
								<li key={submission.id} className="flex flex-wrap gap-2">
									<span className="font-mono text-xs">{submission.doc_kind}</span>
									<Link
										to="/requisitante/$unitId/processos/$submissionId"
										params={{ unitId: scopeId, submissionId: submission.id }}
										className="underline underline-offset-4"
									>
										{submission.filename}
									</Link>
									<span className="text-muted-foreground text-xs">{formatDateTime(submission.created_at)}</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
			</section>

			<section className="space-y-3">
				<h3 className="font-semibold text-lg tracking-tight">Peças, campo a campo</h3>
				<Tabs value={tab} onValueChange={(value) => setTab(value as string)}>
					<TabsList>
						{documents.forms.map((form) => (
							<TabsTrigger key={form.id} value={form.id}>
								{form.id === "memoria" ? "Memória" : form.id === "pesquisa" ? "Preços" : form.id.toUpperCase()}
							</TabsTrigger>
						))}
					</TabsList>
					{documents.forms.map((form) => (
						<TabsContent key={form.id} value={form.id} className="pt-4">
							<FormPreview form={form} />
						</TabsContent>
					))}
				</Tabs>
			</section>
		</div>
	)
}
