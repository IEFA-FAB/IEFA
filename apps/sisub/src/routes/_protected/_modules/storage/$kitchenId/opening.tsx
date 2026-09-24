import { CONSERVATION_CLASSES, CONSERVATION_LABELS, type ConservationClass, OPENING_COST_SOURCE_LABELS, type OpeningCostSource } from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AlertTriangle, Download, FileUp, PackagePlus, Sparkles, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import {
	applyOpeningCostSuggestionsFn,
	cancelOpeningBalanceFn,
	downloadOpeningCatalogSheetFn,
	fetchOpeningBalanceFn,
	importOpeningSheetFn,
	postOpeningBalanceFn,
	setOpeningItemCostFn,
} from "@/server/opening-balance.fn"

/**
 * Carga inicial do estoque (carga de abertura).
 *
 * A cozinha que começa a usar o estoque do sisub já tem mercadoria na prateleira. Esta tela
 * é o caminho para ela entrar de uma vez — com lote, validade, local e custo —, e não como
 * "achado" do primeiro inventário, que contaminaria o relatório de perdas e ganhos.
 *
 * A ordem da tela é a do trabalho: baixar a folha, preencher no Excel, importar, completar o
 * custo, lançar. O lançamento é nível 3 e é único; depois dele, saldo errado se corrige por
 * contagem.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/opening")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loader: async ({ params }) => fetchOpeningBalanceFn({ data: { kitchenId: Number(params.kitchenId) } }),
	component: OpeningBalancePage,
})

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const BRL4 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 })

const ALL_CLASSES = "all"

function formatDate(iso: string | null) {
	if (!iso) return "—"
	const [y, m, d] = iso.slice(0, 10).split("-")
	return `${d}/${m}/${y}`
}

function downloadText(fileName: string, content: string) {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = fileName
	link.click()
	URL.revokeObjectURL(url)
}

function OpeningBalancePage() {
	const { draft, history } = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const { can } = usePBAC()
	// A rota abre no nível 2 (quem prepara a carga), mas LANÇAR é nível 3 — sem esta
	// distinção a tela ofereceria um botão que o servidor recusa.
	const canPost = can("storage", 3, { type: "kitchen", id: Number(kitchenId) })

	const fileInput = useRef<HTMLInputElement>(null)
	const [conservationClass, setConservationClass] = useState<string>(ALL_CLASSES)
	const [busy, setBusy] = useState(false)
	const [costDrafts, setCostDrafts] = useState<Record<string, string>>({})

	async function run<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
		setBusy(true)
		try {
			onSuccess(await action())
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na operação")
		} finally {
			setBusy(false)
		}
	}

	async function downloadSheet() {
		setBusy(true)
		try {
			const result = await downloadOpeningCatalogSheetFn({
				data: {
					kitchenId: Number(kitchenId),
					conservationClass: conservationClass === ALL_CLASSES ? undefined : (conservationClass as ConservationClass),
				},
			})
			if (result.count === 0) {
				toast.warning("Nenhum insumo nesta classe (ou todos já movimentaram nesta cozinha)")
				return
			}
			downloadText(result.fileName, result.content)
			toast.success(`Folha com ${result.count} insumos — preencha a quantidade só do que a cozinha tem`)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao gerar a folha")
		} finally {
			setBusy(false)
		}
	}

	async function importFile(file: File) {
		const content = await file.text()
		// A folha gerada pelo sistema começa pela coluna insumo_id; qualquer outro arquivo é
		// planilha livre. Serve só para o registro de origem — a leitura é a mesma.
		const source = content.replace(/^﻿/, "").toLowerCase().startsWith("insumo_id") ? "catalog_sheet" : "spreadsheet"
		await run(
			() => importOpeningSheetFn({ data: { kitchenId: Number(kitchenId), fileName: file.name, content, source } }),
			(result) => {
				if (result.rejected > 0) toast.warning(`${result.accepted} linha(s) no rascunho; ${result.rejected} recusada(s) — veja o motivo abaixo`)
				else toast.success(`${result.accepted} linha(s) no rascunho`)
			}
		)
		if (fileInput.current) fileInput.current.value = ""
	}

	async function saveCost(itemId: string) {
		if (!draft) return
		const raw = (costDrafts[itemId] ?? "").trim()
		// Campo esvaziado e abandonado: descarta a edição em vez de deixar o campo vazio
		// para sempre por cima de um custo que está gravado e somando no total da carga.
		if (raw === "") {
			setCostDrafts((current) => {
				const { [itemId]: _discarded, ...rest } = current
				return rest
			})
			return
		}
		// com vírgula é formato brasileiro (ponto de milhar); sem vírgula, o ponto é decimal
		const unitCost = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw)
		if (!Number.isFinite(unitCost) || unitCost <= 0) {
			toast.error("Custo precisa ser um número maior que zero")
			return
		}
		await run(
			() => setOpeningItemCostFn({ data: { openingBalanceId: draft.id, itemId, unitCost } }),
			() => {
				setCostDrafts((current) => {
					const { [itemId]: _, ...rest } = current
					return rest
				})
			}
		)
	}

	return (
		<div className="space-y-4">
			<PageHeader
				title="Carga inicial do estoque"
				description="O que já está na prateleira entra uma vez, com lote, validade, local e custo. Depois do lançamento, diferença de saldo se corrige por contagem."
			/>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<FileUp className="size-4" />
						Planilha
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
						<li>Baixe a folha do catálogo — de uma vez ou por classe de conservação, na ordem em que a cozinha conta.</li>
						<li>
							Preencha no Excel a <strong>quantidade na unidade indicada</strong>, e o lote, a validade (dd/mm/aaaa) e o local quando houver. Linha sem
							quantidade é ignorada.
						</li>
						<li>Salve como CSV e importe. Planilha própria também serve, com as colunas código ou descrição, quantidade e unidade.</li>
					</ol>

					<div className="flex flex-wrap items-end gap-2">
						<div className="space-y-1">
							<Label htmlFor="conservation-class">Classe de conservação</Label>
							<Select value={conservationClass} onValueChange={(value) => setConservationClass(value ?? ALL_CLASSES)}>
								<SelectTrigger id="conservation-class" className="w-56">
									<SelectValue>
										{conservationClass === ALL_CLASSES ? "Todo o catálogo" : CONSERVATION_LABELS[conservationClass as ConservationClass]}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL_CLASSES}>Todo o catálogo</SelectItem>
									{CONSERVATION_CLASSES.map((value) => (
										<SelectItem key={value} value={value}>
											{CONSERVATION_LABELS[value]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button type="button" variant="outline" onClick={downloadSheet} disabled={busy} className="gap-2">
							<Download className="size-4" />
							Baixar folha (CSV)
						</Button>

						<input
							ref={fileInput}
							type="file"
							accept=".csv,.txt,text/csv"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0]
								if (file) importFile(file)
							}}
						/>
						<Button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="gap-2">
							{busy ? <Spinner className="size-4" /> : <FileUp className="size-4" />}
							Importar planilha
						</Button>
					</div>
					{draft && (
						<p className="text-xs text-muted-foreground">
							Importar de novo <strong>substitui</strong> as linhas do rascunho. O custo já informado é mantido nas linhas que continuarem iguais (mesmo item,
							lote e validade).
						</p>
					)}
				</CardContent>
			</Card>

			{draft && draft.rejections.length > 0 && (
				<Card className="border-warning">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-warning">
							<AlertTriangle className="size-4" />
							{draft.rejections.length} linha(s) recusada(s) na última importação
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="mb-2 text-sm text-muted-foreground">
							As demais linhas entraram. Corrija estas na planilha e importe de novo{draft.sourceFilename ? ` (${draft.sourceFilename})` : ""}.
						</p>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-20">Linha</TableHead>
									<TableHead>Item</TableHead>
									<TableHead>Motivo</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{draft.rejections.map((rejection) => (
									<TableRow key={`${rejection.lineNumber}-${rejection.reason}`}>
										<TableCell className="tabular-nums">{rejection.lineNumber}</TableCell>
										<TableCell>{rejection.label ?? "—"}</TableCell>
										<TableCell>{rejection.reason}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			{draft ? (
				<Card>
					<CardHeader>
						<CardTitle className="flex flex-wrap items-center justify-between gap-2">
							<span className="flex items-center gap-2">
								<PackagePlus className="size-4" />
								Rascunho — {draft.lines.length} linha(s)
							</span>
							<span className="text-sm font-normal text-muted-foreground">
								Valor: <strong className="text-foreground">{BRL.format(draft.value)}</strong>
								{draft.missingCost > 0 && <> · {draft.missingCost} sem custo</>}
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								className="gap-2"
								disabled={busy || draft.suggestible === 0}
								onClick={() =>
									run(
										() => applyOpeningCostSuggestionsFn({ data: { openingBalanceId: draft.id } }),
										(result) =>
											result.remaining > 0
												? toast.warning(`${result.applied} custo(s) aplicado(s); ${result.remaining} linha(s) sem sugestão — informe o custo delas`)
												: toast.success(`${result.applied} custo(s) aplicado(s)`)
									)
								}
							>
								<Sparkles className="size-4" />
								Aceitar todas as sugestões ({draft.suggestible})
							</Button>

							{canPost && (
								<AlertDialog>
									<AlertDialogTrigger render={<Button type="button" disabled={busy || draft.missingCost > 0} />}>Lançar carga</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Lançar a carga inicial?</AlertDialogTitle>
											<AlertDialogDescription>
												{draft.lines.length} lote(s) entram no estoque, somando <strong>{BRL.format(draft.value)}</strong>. O lançamento é único e não se desfaz
												— diferença descoberta depois se corrige por contagem física.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Voltar</AlertDialogCancel>
											<AlertDialogAction
												onClick={() =>
													run(
														() => postOpeningBalanceFn({ data: { openingBalanceId: draft.id } }),
														(result) => toast.success(`Carga lançada: ${result.movements} lote(s), ${BRL.format(result.value)}`)
													)
												}
											>
												Lançar
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}

							<AlertDialog>
								<AlertDialogTrigger render={<Button type="button" variant="ghost" className="gap-2" disabled={busy} />}>
									<Trash2 className="size-4" />
									Descartar rascunho
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Descartar o rascunho?</AlertDialogTitle>
										<AlertDialogDescription>As linhas e os custos informados deixam de valer. Nada foi lançado no estoque.</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Voltar</AlertDialogCancel>
										<AlertDialogAction
											onClick={() =>
												run(
													() => cancelOpeningBalanceFn({ data: { openingBalanceId: draft.id } }),
													() => toast.success("Rascunho descartado")
												)
											}
										>
											Descartar
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>

						{!canPost && <p className="text-xs text-muted-foreground">O lançamento é feito por um responsável nível 3 de estoque desta cozinha.</p>}
						{canPost && draft.missingCost > 0 && <p className="text-xs text-muted-foreground">O lançamento libera quando todas as linhas tiverem custo.</p>}

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-16">Linha</TableHead>
									<TableHead>Insumo</TableHead>
									<TableHead className="text-right">Quantidade</TableHead>
									<TableHead>Lote</TableHead>
									<TableHead>Validade</TableHead>
									<TableHead>Local</TableHead>
									<TableHead className="w-44">Custo unitário</TableHead>
									<TableHead className="text-right">Total</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{draft.lines.map((line) => (
									<TableRow key={line.id}>
										<TableCell className="tabular-nums text-muted-foreground">{line.lineNumber}</TableCell>
										<TableCell>{line.description}</TableCell>
										<TableCell className="text-right tabular-nums">
											{NUM.format(line.quantity)} {line.unit ?? ""}
										</TableCell>
										<TableCell>{line.lotCode ?? <span className="text-muted-foreground">—</span>}</TableCell>
										<TableCell>{formatDate(line.expiryDate)}</TableCell>
										<TableCell>{line.location ?? <span className="text-muted-foreground">—</span>}</TableCell>
										<TableCell>
											<div className="space-y-1">
												<Input
													aria-label={`Custo unitário de ${line.description}`}
													inputMode="decimal"
													className="h-8"
													placeholder={line.suggestion ? NUM.format(line.suggestion.unitCost) : "R$ por unidade"}
													value={costDrafts[line.id] ?? (line.unitCost != null ? String(line.unitCost).replace(".", ",") : "")}
													disabled={busy}
													onChange={(event) => setCostDrafts((current) => ({ ...current, [line.id]: event.target.value }))}
													onBlur={() => {
														if (costDrafts[line.id] !== undefined) saveCost(line.id)
													}}
													onKeyDown={(event) => {
														// Enter só tira o foco: quem salva é o blur, senão Enter + blur gravavam duas vezes
														if (event.key === "Enter") event.currentTarget.blur()
													}}
												/>
												{line.costSource ? (
													<Badge variant="outline" className="text-xs" title={line.costReference ?? undefined}>
														{OPENING_COST_SOURCE_LABELS[line.costSource as OpeningCostSource]}
													</Badge>
												) : line.suggestion ? (
													<span className="block text-xs text-muted-foreground" title={line.suggestion.reference}>
														Sugestão: {BRL4.format(line.suggestion.unitCost)} ({OPENING_COST_SOURCE_LABELS[line.suggestion.source]})
													</span>
												) : (
													<span className="block text-xs text-warning">Sem sugestão — informe o custo</span>
												)}
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums">{line.unitCost != null ? BRL.format(line.unitCost * line.quantity) : "—"}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardContent className="py-10 text-center text-sm text-muted-foreground">
						Nenhuma carga em preparo. Baixe a folha do catálogo, preencha o que a cozinha tem e importe.
					</CardContent>
				</Card>
			)}

			{history.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Cargas anteriores</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Situação</TableHead>
									<TableHead>Arquivo</TableHead>
									<TableHead>Data</TableHead>
									<TableHead className="text-right">Valor</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{history.map((doc) => (
									<TableRow key={doc.id}>
										<TableCell>
											<Badge variant={doc.status === "posted" ? "default" : "outline"}>{doc.status === "posted" ? "Lançada" : "Descartada"}</Badge>
										</TableCell>
										<TableCell>{doc.sourceFilename ?? "—"}</TableCell>
										<TableCell>{new Date(doc.postedAt ?? doc.cancelledAt ?? doc.createdAt).toLocaleString("pt-BR")}</TableCell>
										<TableCell className="text-right tabular-nums">{doc.postedValue != null ? BRL.format(doc.postedValue) : "—"}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
