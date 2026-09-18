import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { FileUp, FileX2, ScanLine } from "lucide-react"
import { useRef, useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ScanInput, scannerPropsFrom } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { claimNfeForKitchenFn, createNfeFromAccessKeyFn, listNfeDocumentsFn, uploadNfeFn } from "@/server/nfe.fn"
import { fetchScannerProfileFn } from "@/server/scanner.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/nfe/")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [documents, scannerProfile] = await Promise.all([listNfeDocumentsFn({ data: { kitchenId } }), fetchScannerProfileFn({ data: { kitchenId } })])
		return { documents, scannerProfile }
	},
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
	const { documents, scannerProfile } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const fileInput = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)

	async function handleFile(file: File) {
		setUploading(true)
		try {
			const xml = await file.text()
			const result = await uploadNfeFn({ data: { xml, kitchenId: Number(kitchenId) } })
			toast.success(`NF-e importada: ${result.itemsCount} itens (${result.matching.matched} casados, ${result.matching.review} em revisão)`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao importar NF-e")
		} finally {
			setUploading(false)
			if (fileInput.current) fileInput.current.value = ""
		}
	}

	async function registerKey(accessKey: string) {
		setUploading(true)
		try {
			const result = await createNfeFromAccessKeyFn({ data: { kitchenId: Number(kitchenId), accessKey } })
			toast.success(result.created ? "Nota registrada pela chave do DANFE — o XML completa os itens quando chegar" : "Esta nota já estava registrada")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao registrar a chave")
		} finally {
			setUploading(false)
		}
	}

	async function claim(nfeDocumentId: string) {
		try {
			await claimNfeForKitchenFn({ data: { nfeDocumentId, kitchenId: Number(kitchenId) } })
			toast.success("Nota assumida por esta cozinha")
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao assumir a nota")
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Notas Fiscais (NF-e)"
				description="A nota entra pelo XML ou pela chave do DANFE que vem com a mercadoria. O XML completa os itens quando chegar."
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
				<CardHeader className="pb-2">
					<CardTitle className="flex items-center gap-2 text-subheading">
						<ScanLine className="size-4" />
						Chave do DANFE
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 pt-0">
					<p className="text-sm text-muted-foreground">
						Sem certificado digital, a SEFAZ não entrega a nota ao sistema. A chave impressa no DANFE que veio com o caminhão é o que permite registrar a
						entrega antes do XML — e ela já diz fornecedor, série e número.
					</p>
					<ScanInput
						label="Chave de acesso"
						placeholder="Leia o código de barras do DANFE ou digite os 44 caracteres…"
						disabled={uploading}
						{...scannerPropsFrom(scannerProfile)}
						onReading={(reading) => {
							if (reading.kind === "nfe_access_key") registerKey(reading.accessKey.key)
							else toast.error("Isto não é uma chave de acesso — leia o código de barras do DANFE")
						}}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="pt-4">
					{documents.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<FileX2 className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhuma NF-e ainda. Leia a chave do DANFE ou importe o XML de uma nota autorizada.</p>
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
												<Link to="/storage/$kitchenId/nfe/$nfeId" params={{ kitchenId, nfeId: doc.id }} className="text-primary hover:underline">
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
												{doc.status === "announced" ? (
													<Badge variant="outline" className="text-xs">
														Aguardando XML
													</Badge>
												) : doc.status === "cancelled" ? (
													<Badge variant="outline" className="text-xs text-destructive">
														Cancelada
													</Badge>
												) : doc.kitchen_id == null ? (
													<Button type="button" size="sm" variant="outline" onClick={() => claim(doc.id)}>
														Assumir para esta cozinha
													</Button>
												) : pendentes > 0 ? (
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
