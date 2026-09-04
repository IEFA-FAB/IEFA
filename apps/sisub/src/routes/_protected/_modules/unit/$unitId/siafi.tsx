import { createFileRoute, useRouter } from "@tanstack/react-router"
import { FileUp, RefreshCw } from "lucide-react"
import { useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { applyCreditBatchFn } from "@/server/budget.fn"
import { applyDocumentBatchFn } from "@/server/reconciliation.fn"
import { type ImportBatchRow, listImportBatchesFn, REPORT_TYPE_LABEL, uploadSiafiReportFn } from "@/server/siafi-import.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/siafi")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: ({ params }) => listImportBatchesFn({ data: { unitId: Number(params.unitId) } }),
	component: SiafiPage,
	head: () => ({
		meta: [{ title: "SIAFI — Importação — SISUB" }],
	}),
})

const REPORT_TYPES = ["credito", "ne", "ns", "ob"] as const

/** ArrayBuffer → base64 sem estourar a pilha em arquivos grandes. */
function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ""
	for (let i = 0; i < bytes.length; i += 8192) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
	}
	return btoa(binary)
}

function SiafiPage() {
	const batches = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()
	const fileInput = useRef<HTMLInputElement>(null)
	const [reportType, setReportType] = useState<(typeof REPORT_TYPES)[number]>("credito")
	const [busy, setBusy] = useState(false)

	async function handleFile(file: File) {
		setBusy(true)
		try {
			const result = await uploadSiafiReportFn({
				data: {
					unitId: Number(unitId),
					reportType,
					fileName: file.name,
					contentBase64: toBase64(await file.arrayBuffer()),
				},
			})
			toast.success(
				`Lote importado: ${result.recognizedRows}/${result.totalRows} linhas reconhecidas${result.invalidRows > 0 ? ` (${result.invalidRows} com problema)` : ""}`
			)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao importar relatório")
		} finally {
			setBusy(false)
			if (fileInput.current) fileInput.current.value = ""
		}
	}

	async function applyBatch(batch: ImportBatchRow) {
		setBusy(true)
		try {
			if (batch.report_type === "credito") {
				const result = await applyCreditBatchFn({ data: { batchId: batch.id } })
				toast.success(`${result.applied} classificação(ões) de crédito atualizadas`)
			} else {
				const result = await applyDocumentBatchFn({ data: { batchId: batch.id } })
				toast.success(
					`${result.created} documento(s) criado(s), ${result.enriched} enriquecido(s)${result.divergent > 0 ? ` — ${result.divergent} divergência(s) na conciliação` : ""}`
				)
			}
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao aplicar lote")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="SIAFI — Importação"
				description="O SIAFI não tem API pública de escrita: os dados entram por relatório exportado do Tesouro Gerencial. O lote fica estacionado com as linhas cruas até você revisar e aplicar."
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Importar relatório</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="space-y-1">
						<Label className="text-xs">Tipo de relatório</Label>
						<div className="flex flex-wrap gap-1">
							{REPORT_TYPES.map((type) => (
								<Button
									key={type}
									type="button"
									size="sm"
									variant={reportType === type ? "default" : "outline"}
									className="h-7 text-xs"
									onClick={() => setReportType(type)}
								>
									{REPORT_TYPE_LABEL[type]}
								</Button>
							))}
						</div>
					</div>
					<input
						ref={fileInput}
						type="file"
						accept=".csv,.xlsx,.xls,text/csv"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0]
							if (file) handleFile(file)
						}}
					/>
					<Button onClick={() => fileInput.current?.click()} disabled={busy} className="gap-2">
						{busy ? <Spinner className="size-4" /> : <FileUp className="size-4" />}
						Selecionar arquivo (CSV ou XLSX)
					</Button>
					<p className="text-xs text-muted-foreground">
						O parser reconhece as colunas por sinônimo — se o layout do seu relatório for diferente, as linhas cruas ficam salvas e podem ser reprocessadas sem
						novo upload.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Lotes importados</CardTitle>
				</CardHeader>
				<CardContent className="px-0 pb-0">
					{batches.length === 0 ? (
						<p className="text-sm text-muted-foreground py-8 text-center">Nenhum relatório importado ainda.</p>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label w-40">Tipo</th>
									<th className="py-2 px-2 text-left text-label">Arquivo</th>
									<th className="py-2 px-2 text-right text-label w-32">Reconhecidas</th>
									<th className="py-2 px-2 text-center text-label w-28">Situação</th>
									<th className="py-2 px-2 w-28" />
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{batches.map((batch) => (
									<tr key={batch.id}>
										<td className="py-2.5 px-3 text-xs">{REPORT_TYPE_LABEL[batch.report_type] ?? batch.report_type}</td>
										<td className="py-2.5 px-2 text-xs truncate max-w-[280px]">{batch.file_name}</td>
										<td className="py-2.5 px-2 text-xs text-right tabular-nums">
											{batch.recognized_rows}/{batch.total_rows}
										</td>
										<td className="py-2.5 px-2 text-center">
											<Badge variant={batch.status === "applied" ? "secondary" : "outline"} className="text-[10px]">
												{batch.status === "applied" ? "aplicado" : "estacionado"}
											</Badge>
										</td>
										<td className="py-2.5 px-2 text-right">
											{batch.status !== "applied" && (
												<Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" disabled={busy} onClick={() => applyBatch(batch)}>
													<RefreshCw className="size-3.5" />
													Aplicar
												</Button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
