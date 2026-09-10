import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CloudUpload, WarningTriangle } from "iconoir-react"
import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/hooks/useAuth"
import {
	CAMPO_LABELS,
	type CampoKey,
	campoTexto,
	type ExtractionPayload,
	type ExtractionResponse,
	OBJETO_TIPOS,
	type ObjetoTipo,
	type SourceSpan,
	submissionTextQueryOptions,
	useCreateSubmission,
	useRunExtraction,
} from "@/lib/alpha/submissions"

const DOC_KINDS = ["ETP", "TR", "EDITAL"] as const

export type DocKind = (typeof DOC_KINDS)[number]

export interface IntakeResult {
	submissionId: string
	extraction: ExtractionResponse
}

/**
 * Formulário de envio + extração.
 *
 * Compartilhado entre o console (`/alpha/analise/nova`) e a plataforma
 * (`/aci/nova`): o que muda é o que cada tela faz com o resultado, não o envio.
 *
 * São dois avisos porque são dois fatos: `onSubmitted` dispara assim que o
 * documento existe no α, e `onExtracted` só depois da extração. A extração
 * falha de verdade (PDF sem texto, teto do modelo), e sem o primeiro aviso o
 * processo recém-criado ficava invisível — a tela não tinha o id para levar o
 * analista até ele, e reenviar o mesmo arquivo criava um processo duplicado
 * parado em "enviado".
 */
export function SubmissionIntakeForm({
	onSubmitted,
	onExtracted,
}: {
	onSubmitted?: (submissionId: string) => void
	onExtracted: (result: IntakeResult) => void
}) {
	const queryClient = useQueryClient()
	const fileRef = useRef<HTMLInputElement>(null)

	const [docKind, setDocKind] = useState<DocKind>("TR")
	const [objeto, setObjeto] = useState<ObjetoTipo | null>(null)

	const createSubmission = useCreateSubmission()
	const runExtraction = useRunExtraction()

	const upload = useMutation({
		mutationFn: async () => {
			const file = fileRef.current?.files?.[0]
			if (!file) throw new Error("selecione um arquivo .docx ou .pdf")

			const submission = await createSubmission.mutateAsync({ file, doc_kind: docKind, objeto: objeto ?? undefined })
			// O processo já existe: a fila precisa saber disso mesmo que a extração
			// falhe logo abaixo.
			queryClient.invalidateQueries({ queryKey: ["alpha", "submissions"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "queue"], refetchType: "none" })
			onSubmitted?.(submission.id)

			const extraction = await runExtraction.mutateAsync(submission.id)
			onExtracted({ submissionId: submission.id, extraction })
		},
	})

	return (
		<div className="border border-border p-4">
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
					<Select value={docKind} onValueChange={(value) => setDocKind(value as DocKind)}>
						<SelectTrigger id="alpha-kind" className="w-32">
							<SelectValue>{docKind}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{DOC_KINDS.map((kind) => (
								<SelectItem key={kind} value={kind}>
									{kind}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div>
					<label htmlFor="alpha-objeto" className="mb-1 block text-muted-foreground text-xs uppercase tracking-[0.1em]">
						Objeto
					</label>
					<Select value={objeto} onValueChange={(value) => setObjeto(value as ObjetoTipo | null)}>
						<SelectTrigger id="alpha-objeto" className="w-40">
							<SelectValue>{objeto ?? "não informado"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={null}>não informado</SelectItem>
							{OBJETO_TIPOS.map((value) => (
								<SelectItem key={value} value={value}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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
	)
}

/** Recorte do texto com o trecho de origem destacado. */
export function SpanPreview({ text, span }: { text: string; span: SourceSpan | undefined }) {
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

/**
 * Campos extraídos lado a lado com o trecho do documento que os originou.
 *
 * Recebe só o que a extração tem em qualquer forma (payload + spans) — serve
 * tanto para a extração recém-criada quanto para uma reaberta pelo histórico.
 */
export function ExtractionFieldsView({
	submissionId,
	payload,
	spans,
}: {
	submissionId: string
	payload: ExtractionPayload
	spans: Partial<Record<CampoKey, SourceSpan>>
}) {
	const { session } = useAuth()
	const [selectedField, setSelectedField] = useState<CampoKey | null>(null)
	const documentText = useQuery({ ...submissionTextQueryOptions(session?.access_token, submissionId), enabled: selectedField !== null })

	const fields = useMemo(
		() =>
			(Object.keys(CAMPO_LABELS) as CampoKey[]).map((key) => ({
				key,
				label: CAMPO_LABELS[key],
				value: payload[key],
				span: spans[key],
			})),
		[payload, spans]
	)

	return (
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
							<span className="block truncate text-muted-foreground text-xs">{campoTexto(field.value) ?? "ausente no documento"}</span>
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
				) : documentText.isError ? (
					<p className="text-sm">{(documentText.error as Error).message}</p>
				) : (
					<SpanPreview text={documentText.data?.text ?? ""} span={spans[selectedField]} />
				)}
			</div>
		</div>
	)
}
