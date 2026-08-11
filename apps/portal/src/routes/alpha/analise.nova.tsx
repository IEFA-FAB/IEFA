import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { CloudUpload, WarningTriangle } from "iconoir-react"
import { useMemo, useRef, useState } from "react"
import { ConsoleNav } from "@/components/alpha/ConsoleNav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { useRunCompliance } from "@/lib/alpha/compliance"
import { CAMPO_LABELS, type ExtractionResponse, submissionTextQueryOptions, useCreateSubmission, useRunExtraction } from "@/lib/alpha/submissions"

export const Route = createFileRoute("/alpha/analise/nova")({
	component: NovaAnalisePage,
})

const DOC_KINDS = ["ETP", "TR", "EDITAL"] as const
const OBJETOS = ["COMPRAS", "SERVICOS", "OBRAS", "TIC"] as const

/** Recorte do texto com o trecho de origem destacado. */
function SpanPreview({ text, span }: { text: string; span: { start: number; end: number } | undefined }) {
	if (!span) return <p className="text-muted-foreground text-sm">Campo sem trecho de origem — não foi encontrado no documento.</p>

	const contextStart = Math.max(0, span.start - 320)
	const contextEnd = Math.min(text.length, span.end + 320)

	return (
		<p className="whitespace-pre-wrap text-sm leading-relaxed">
			<span className="text-muted-foreground">{text.slice(contextStart, span.start)}</span>
			<mark className="bg-foreground px-0.5 text-background">{text.slice(span.start, span.end)}</mark>
			<span className="text-muted-foreground">{text.slice(span.end, contextEnd)}</span>
		</p>
	)
}

function NovaAnalisePage() {
	const { session } = useAuth()
	const token = session?.access_token
	const queryClient = useQueryClient()
	const fileRef = useRef<HTMLInputElement>(null)

	const [docKind, setDocKind] = useState<(typeof DOC_KINDS)[number]>("TR")
	const [objeto, setObjeto] = useState<(typeof OBJETOS)[number] | "">("")
	const [submissionId, setSubmissionId] = useState<string | null>(null)
	const [extraction, setExtraction] = useState<ExtractionResponse | null>(null)
	const [selectedField, setSelectedField] = useState<string | null>(null)

	const navigate = useNavigate()
	const createSubmission = useCreateSubmission()
	const runExtraction = useRunExtraction()
	const runCompliance = useRunCompliance()
	const documentText = useQuery({ ...submissionTextQueryOptions(token, submissionId ?? ""), enabled: Boolean(submissionId) })

	const fields = useMemo(() => {
		if (!extraction) return []
		return (Object.keys(CAMPO_LABELS) as Array<keyof typeof CAMPO_LABELS>).map((key) => ({
			key,
			label: CAMPO_LABELS[key],
			value: extraction.payload[key],
			span: extraction.spans[key],
		}))
	}, [extraction])

	const upload = useMutation({
		mutationFn: async () => {
			const file = fileRef.current?.files?.[0]
			if (!file) throw new Error("selecione um arquivo .docx ou .pdf")

			const submission = await createSubmission.mutateAsync({ file, doc_kind: docKind, objeto: objeto || undefined })
			setSubmissionId(submission.id)
			setExtraction(null)

			const result = await runExtraction.mutateAsync(submission.id)
			setExtraction(result)
			queryClient.invalidateQueries({ queryKey: ["alpha", "submissions"] })
			return result
		},
	})

	const preenchidos = fields.filter((field) => field.value !== null).length

	return (
		<div>
			<ConsoleNav
				title="Nova análise"
				subtitle="Envie um ETP ou Termo de Referência para extrair o JSON canônico da contratação. Todo campo preenchido carrega o trecho do documento que o originou."
			/>

			<div className="mb-8 border border-border p-4">
				<div className="flex flex-wrap items-end gap-4">
					<div>
						<label htmlFor="alpha-file" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
							Documento
						</label>
						<input id="alpha-file" ref={fileRef} type="file" accept=".docx,.pdf" className="text-sm" />
					</div>

					<div>
						<label htmlFor="alpha-kind" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
							Tipo
						</label>
						<select
							id="alpha-kind"
							value={docKind}
							onChange={(event) => setDocKind(event.target.value as (typeof DOC_KINDS)[number])}
							className="border border-border bg-background px-2 py-1.5 text-sm"
						>
							{DOC_KINDS.map((kind) => (
								<option key={kind} value={kind}>
									{kind}
								</option>
							))}
						</select>
					</div>

					<div>
						<label htmlFor="alpha-objeto" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
							Objeto
						</label>
						<select
							id="alpha-objeto"
							value={objeto}
							onChange={(event) => setObjeto(event.target.value as (typeof OBJETOS)[number] | "")}
							className="border border-border bg-background px-2 py-1.5 text-sm"
						>
							<option value="">não informado</option>
							{OBJETOS.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</div>

					<Button onClick={() => upload.mutate()} disabled={upload.isPending}>
						<CloudUpload className="size-4" />
						{upload.isPending ? "extraindo…" : "enviar e extrair"}
					</Button>
				</div>

				{upload.isError ? (
					<p className="mt-3 flex items-start gap-2 text-sm">
						<WarningTriangle className="mt-0.5 size-4 shrink-0" />
						{(upload.error as Error).message}
					</p>
				) : null}
			</div>

			{extraction ? (
				<>
					<div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
						<Button
							size="sm"
							variant="outline"
							disabled={!submissionId || runCompliance.isPending}
							onClick={async () => {
								if (!submissionId) return
								const run = await runCompliance.mutateAsync({ submission_id: submissionId, extraction_id: extraction.id })
								navigate({ to: "/alpha/analise/$runId", params: { runId: run.run_id } })
							}}
						>
							{runCompliance.isPending ? "verificando…" : "verificar conformidade"}
						</Button>
						<Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
							{preenchidos}/{fields.length} campos
						</Badge>
						<span className="text-muted-foreground">modelo: {extraction.model}</span>
						{extraction.dropped.length > 0 ? (
							<span className="text-muted-foreground">{extraction.dropped.length} campo(s) descartado(s) por evidência não localizada</span>
						) : null}
					</div>

					<div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
						<div className="border border-border">
							{fields.map((field) => (
								<button
									key={field.key}
									type="button"
									onClick={() => setSelectedField(field.key)}
									className={`flex w-full items-baseline justify-between gap-3 border-border border-b px-3 py-2 text-left text-sm hover:bg-muted/60 ${
										selectedField === field.key ? "bg-muted" : ""
									}`}
								>
									<span className="min-w-0">
										<span className="block truncate">{field.label}</span>
										<span className="block truncate text-muted-foreground text-xs">{field.value ? field.value.value : "ausente no documento"}</span>
									</span>
									{field.value ? null : <span className="shrink-0 text-muted-foreground text-xs">—</span>}
								</button>
							))}
						</div>

						<div className="border border-border p-4">
							{!selectedField ? (
								<p className="text-muted-foreground text-sm">Selecione um campo para ver o trecho do documento que o originou.</p>
							) : documentText.isLoading ? (
								<p className="text-muted-foreground text-sm">carregando documento…</p>
							) : (
								<SpanPreview text={documentText.data?.text ?? ""} span={extraction.spans[selectedField as keyof typeof extraction.spans]} />
							)}
						</div>
					</div>
				</>
			) : null}
		</div>
	)
}
