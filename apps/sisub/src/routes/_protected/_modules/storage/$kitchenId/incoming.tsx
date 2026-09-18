import { createFileRoute, Link } from "@tanstack/react-router"
import { AlertTriangle, FileText, PackageCheck, Truck } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fetchIncomingFn, type IncomingKind } from "@/server/incoming.fn"

/**
 * A caminho.
 *
 * O requisito era *"preciso saber o que está prestes a chegar por integração
 * com a NF-e"*, e a palavra que engana é *integração*: a nota é só uma das
 * formas de saber. A pergunta do almoxarife é "o que falta chegar hoje", não
 * "quais notas existem" — por isso a lista é única, e a coluna que ele lê
 * primeiro é a **próxima ação**, não o status.
 *
 * O atrasado vem primeiro, e o mais atrasado antes de tudo: é a ordem em que
 * ele precisa cobrar o fornecedor.
 */

const KIND_LABELS: Record<IncomingKind, string> = {
	supply_order: "Ordem de fornecimento",
	nfe: "Nota fiscal",
	delivery_without_invoice: "Entrega sem nota",
	promised_replacement: "Reposição prometida",
}

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/incoming")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		return { incoming: await fetchIncomingFn({ data: { kitchenId } }), kitchenId }
	},
	component: IncomingPage,
	head: () => ({ meta: [{ title: "Estoque — A caminho" }] }),
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function IncomingPage() {
	const { incoming, kitchenId } = Route.useLoaderData()
	// o painel abre com nível 1, mas a tela das ordens exige 2: o atalho para
	// ela só aparece para quem vai conseguir abri-la
	const { can } = usePBAC()
	const canOpenSupplyOrders = can("storage", 2, { type: "kitchen", id: kitchenId })

	return (
		<div className="space-y-4">
			<PageHeader
				title="A caminho"
				description="O que está para chegar e o que está pendente de documento: ordens enviadas, notas sem recebimento e entregas ainda sem nota."
			/>

			<div className="grid gap-3 sm:grid-cols-2">
				<Card>
					<CardContent className="pt-4">
						<p className="text-xs text-muted-foreground">Aguardando</p>
						<p className="text-heading">{incoming.total}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-xs text-muted-foreground">Em atraso</p>
						<p className={`text-heading ${incoming.late > 0 ? "text-warning" : ""}`}>{incoming.late}</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="flex items-center gap-2 text-subheading">
						<Truck className="size-4" />
						Pendências
					</CardTitle>
				</CardHeader>
				<CardContent>
					{incoming.rows.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Nada pendente de chegada ou de documento. Este é o estado bom — não quer dizer que a tela esteja quebrada.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Origem</TableHead>
									<TableHead>Fornecedor</TableHead>
									<TableHead>Referência</TableHead>
									<TableHead>Data</TableHead>
									<TableHead className="text-right">Valor</TableHead>
									<TableHead>Próxima ação</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{incoming.rows.map((row) => (
									<TableRow key={row.key} className={row.daysLate > 0 ? "bg-warning/5" : undefined}>
										<TableCell className="text-xs">
											<span className="inline-flex items-center gap-1">
												{row.kind === "nfe" ? (
													<FileText className="size-3.5" />
												) : row.kind === "supply_order" ? (
													<Truck className="size-3.5" />
												) : (
													<PackageCheck className="size-3.5" />
												)}
												{KIND_LABELS[row.kind]}
											</span>
										</TableCell>
										<TableCell className="text-xs">{row.supplierName ?? "—"}</TableCell>
										<TableCell className="font-mono text-xs">
											{row.reference}
											<div className="font-sans text-muted-foreground">{row.summary}</div>
										</TableCell>
										<TableCell className="text-xs">
											{row.referenceDate ?? "sem data"}
											{row.daysLate > 0 && (
												<Badge variant="outline" className="ml-2 gap-1 text-warning">
													<AlertTriangle className="size-3" />
													{row.daysLate} {row.daysLate === 1 ? "dia" : "dias"} de atraso
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-right tabular-nums text-xs">{row.value == null ? "—" : BRL.format(row.value)}</TableCell>
										<TableCell className="text-xs">
											{/*
											 * O atalho leva para onde a ação acontece. Sem ele, a tela
											 * diz "casar 2 itens" e deixa o operador procurar a nota
											 * numa lista — que é o trabalho que o painel existe para
											 * poupar.
											 */}
											{row.unclaimedNote ? (
												// A nota sem cozinha só se assume na LISTA de notas; o
												// detalhe dela exige permissão global enquanto não tem dona
												<Link to="/storage/$kitchenId/nfe" params={{ kitchenId: String(kitchenId) }} className="text-primary underline">
													{row.nextAction}
												</Link>
											) : row.goodsReceiptId ? (
												<Link
													to="/storage/$kitchenId/receiving/$receiptId"
													params={{ kitchenId: String(kitchenId), receiptId: row.goodsReceiptId }}
													className="text-primary underline"
												>
													{row.nextAction}
												</Link>
											) : row.nfeDocumentId ? (
												<Link
													to="/storage/$kitchenId/nfe/$nfeId"
													params={{ kitchenId: String(kitchenId), nfeId: row.nfeDocumentId }}
													className="text-primary underline"
												>
													{row.nextAction}
												</Link>
											) : row.supplyOrderId && canOpenSupplyOrders ? (
												<Link to="/storage/$kitchenId/supply-orders" params={{ kitchenId: String(kitchenId) }} className="text-primary underline">
													{row.nextAction}
												</Link>
											) : (
												row.nextAction
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					{incoming.total > incoming.rows.length && (
						<p className="mt-2 text-xs text-muted-foreground">
							Mostrando {incoming.rows.length} de {incoming.total}.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
