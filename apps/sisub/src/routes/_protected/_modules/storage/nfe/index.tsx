import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { FileUp, FileX2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { listNfeDocumentsFn, uploadNfeFn } from "@/server/nfe.fn"

export const Route = createFileRoute("/_protected/_modules/storage/nfe/")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: () => listNfeDocumentsFn(),
	component: NfeListPage,
	head: () => ({
		meta: [{ title: "Notas Fiscais — SISUB" }],
	}),
})

const CNPJ_FMT = (cnpj: string | null) => (cnpj ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "—")
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function fmtDate(iso: string | null): string {
	if (!iso) return "—"
	const [y, m, d] = iso.substring(0, 10).split("-")
	return `${d}/${m}/${y}`
}

function NfeListPage() {
	const documents = Route.useLoaderData()
	const router = useRouter()
	const fileInput = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)

	async function handleFile(file: File) {
		setUploading(true)
		try {
			const xml = await file.text()
			const result = await uploadNfeFn({ data: { xml } })
			toast.success(`NF-e importada: ${result.itemsCount} itens (${result.matching.matched} casados, ${result.matching.review} em revisão)`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao importar NF-e")
		} finally {
			setUploading(false)
			if (fileInput.current) fileInput.current.value = ""
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Notas Fiscais (NF-e)"
				description="Entrada de estoque nasce do XML da nota — importe, confira o matching item → insumo e resolva as pendências."
			>
				<input
					ref={fileInput}
					type="file"
					accept=".xml,text/xml,application/xml"
					className="hidden"
					onChange={(e) => {
						const file = e.target.files?.[0]
						if (file) handleFile(file)
					}}
				/>
				<Button onClick={() => fileInput.current?.click()} disabled={uploading} className="gap-2">
					{uploading ? <Spinner className="size-4" /> : <FileUp className="size-4" />}
					Importar XML
				</Button>
			</PageHeader>

			<Card>
				<CardContent className="pt-4">
					{documents.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<FileX2 className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhuma NF-e importada ainda. Importe o XML de uma nota autorizada.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-xs text-muted-foreground">
									<th className="py-2 pr-3 text-left text-label">Emissão</th>
									<th className="py-2 pr-3 text-left text-label">Fornecedor</th>
									<th className="py-2 pr-3 text-right text-label">Valor</th>
									<th className="py-2 pr-3 text-center text-label">Itens</th>
									<th className="py-2 text-center text-label">Situação</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{documents.map((doc) => {
									const counts = doc.itemCounts as Record<string, number>
									const pendentes = (counts.review ?? 0) + (counts.no_match ?? 0) + (counts.pending ?? 0)
									return (
										<tr key={doc.id} className="hover:bg-muted/40">
											<td className="py-2.5 pr-3 text-xs whitespace-nowrap">
												<Link to="/storage/nfe/$nfeId" params={{ nfeId: doc.id }} className="text-primary hover:underline">
													{fmtDate(doc.issued_at)}
												</Link>
											</td>
											<td className="py-2.5 pr-3 text-xs">
												<span className="block">{doc.supplier_name ?? "—"}</span>
												<span className="text-muted-foreground text-[10px] font-mono">{CNPJ_FMT(doc.supplier_cnpj)}</span>
											</td>
											<td className="py-2.5 pr-3 text-xs text-right tabular-nums">{doc.total_value != null ? BRL.format(doc.total_value) : "—"}</td>
											<td className="py-2.5 pr-3 text-xs text-center tabular-nums">{(counts.matched ?? 0) + pendentes}</td>
											<td className="py-2.5 text-center">
												{pendentes > 0 ? (
													<Badge variant="outline" className="text-xs text-warning">
														{pendentes} pendente{pendentes > 1 ? "s" : ""}
													</Badge>
												) : (
													<Badge variant="secondary" className="text-xs">
														Conferida
													</Badge>
												)}
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
