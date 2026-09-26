import { useQuery } from "@tanstack/react-query"
import { FileCheck2, FilePlus2, FileQuestion, Link2, RefreshCw } from "lucide-react"
import { useId, useState } from "react"
import { QuickEmpenhoDialog } from "@/components/features/unit/finance/QuickEmpenhoForm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { linkReceiptDocumentsFn, listReceiptLinkCandidatesFn } from "@/server/receiving.fn"

type Kind = "nfe" | "supplyOrder" | "empenho"

const KIND_LABELS: Record<Kind, { title: string; missing: string; pick: string }> = {
	nfe: { title: "NF-e", missing: "Sem NF-e: vincule a nota quando ela chegar", pick: "Escolha a NF-e" },
	supplyOrder: { title: "Ordem de fornecimento", missing: "Sem OF", pick: "Escolha a OF" },
	empenho: { title: "Nota de empenho", missing: "Sem empenho: vincule a NE (Lei 4.320/1964, art. 60)", pick: "Escolha a NE" },
}

export interface ReceiptDocuments {
	nfe: { label: string } | null
	supplyOrder: { label: string } | null
	empenho: { label: string } | null
	liquidated: boolean
}

/**
 * Documentos do recebimento, com o "vincular depois" (D5). A entrega que chegou sem nota não
 * espera nada para entrar no estoque; quando a NF-e, a OF ou a NE aparecem, ligam-se aqui —
 * mesmo com o recebimento efetivado, sem mexer em quantidade, custo ou estoque.
 */
export function ReceiptDocumentsCard({
	receiptId,
	kitchenId,
	source,
	supplier,
	documents,
	invoiceExpected,
	canLink,
	onLinked,
}: {
	receiptId: string
	kitchenId: number
	/** Recebimento criado DA NF-e não troca de nota (os itens vieram dela): o botão nem aparece. */
	source: string
	/** Quem entregou, para sugerir o favorecido da NE registrada na hora. */
	supplier: { name: string | null; document: string | null }
	documents: ReceiptDocuments
	invoiceExpected: boolean
	canLink: boolean
	onLinked: () => void
}) {
	const [editing, setEditing] = useState<Kind | null>(null)
	const [registeringEmpenho, setRegisteringEmpenho] = useState(false)
	const [rematching, setRematching] = useState(false)

	/** A NE que acabou de ser registrada (ou que já existia pelo número) já sai vinculada. */
	async function linkRegisteredEmpenho(empenhoId: string) {
		// a NE que já existia pelo número também serve: vincula e fecha
		setRegisteringEmpenho(false)
		try {
			const result = await linkReceiptDocumentsFn({ data: { receiptId, empenhoId } })
			reportLink(result)
			onLinked()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "NE registrada, mas não foi possível vinculá-la — vincule na lista")
		}
	}

	async function rematch() {
		setRematching(true)
		try {
			const result = await linkReceiptDocumentsFn({ data: { receiptId } })
			reportLink(result)
			onLinked()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível casar os itens")
		} finally {
			setRematching(false)
		}
	}

	const rows: Array<{ kind: Kind; value: { label: string } | null }> = [
		{ kind: "nfe", value: documents.nfe },
		{ kind: "supplyOrder", value: documents.supplyOrder },
		{ kind: "empenho", value: documents.empenho },
	]

	return (
		<Card className="print:hidden">
			<CardHeader>
				<CardTitle>Documentos</CardTitle>
				<CardDescription>
					{documents.liquidated
						? "Já liquidado: a NF-e e o empenho em que a NS se apoia não mudam mais."
						: "O que falta se vincula a qualquer momento, sem refazer a conferência."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ItemGroup>
					{rows.map(({ kind, value }) => {
						const optional = !invoiceExpected && kind !== "supplyOrder"
						return (
							<Item key={kind} variant="outline" size="sm">
								<ItemMedia variant="icon">{value ? <FileCheck2 aria-hidden="true" /> : <FileQuestion aria-hidden="true" />}</ItemMedia>
								<ItemContent>
									<ItemTitle>
										{KIND_LABELS[kind].title}
										{!value && !optional && <Badge variant="warning">Pendente</Badge>}
									</ItemTitle>
									<ItemDescription>
										{value ? value.label : optional ? "Entrega sem nota de fornecedor (remessa ou apoio)" : KIND_LABELS[kind].missing}
									</ItemDescription>
								</ItemContent>
								{canLink && (
									<ItemActions>
										{kind === "nfe" && value && (
											<Button size="sm" variant="ghost" disabled={rematching} onClick={rematch}>
												{rematching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />}
												Casar itens
											</Button>
										)}
										{!(documents.liquidated && value && kind !== "supplyOrder") && !(kind === "nfe" && value && source === "nfe") && (
											<Button size="sm" variant="outline" onClick={() => setEditing(kind)}>
												<Link2 data-icon="inline-start" aria-hidden="true" />
												{value ? "Trocar" : "Vincular"}
											</Button>
										)}
									</ItemActions>
								)}
							</Item>
						)
					})}
				</ItemGroup>
			</CardContent>
			{editing && (
				<LinkDocumentDialog
					receiptId={receiptId}
					kind={editing}
					onClose={() => setEditing(null)}
					onLinked={() => {
						setEditing(null)
						onLinked()
					}}
					onRegisterEmpenho={() => {
						setEditing(null)
						setRegisteringEmpenho(true)
					}}
				/>
			)}
			<QuickEmpenhoDialog
				kitchenId={kitchenId}
				open={registeringEmpenho}
				onOpenChange={setRegisteringEmpenho}
				defaultFavorecido={{ cnpj: supplier.document?.length === 14 ? supplier.document : null, nome: supplier.name }}
				submitLabel="Registrar e vincular"
				onRegistered={(result) => linkRegisteredEmpenho(result.empenhoId)}
			/>
		</Card>
	)
}

function reportLink(result: { linkedItems: number; costedItems: number; unmatchedLines: string[]; warnings: string[] }) {
	for (const warning of result.warnings) toast.warning(warning)
	if (result.unmatchedLines.length > 0) toast.warning(`Sem item correspondente na nota: ${result.unmatchedLines.join(", ")}.`)
	const costed = result.costedItems > 0 ? `, ${result.costedItems} com o custo da nota` : ""
	toast.success(`Vinculado${result.linkedItems > 0 ? `: ${result.linkedItems} ${result.linkedItems === 1 ? "linha casada" : "linhas casadas"}${costed}` : ""}.`)
}

function LinkDocumentDialog({
	receiptId,
	kind,
	onClose,
	onLinked,
	onRegisterEmpenho,
}: {
	receiptId: string
	kind: Kind
	onClose: () => void
	onLinked: () => void
	onRegisterEmpenho: () => void
}) {
	const fieldId = useId()
	const [value, setValue] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const candidates = useQuery({
		queryKey: ["receiving", "link-candidates", receiptId],
		queryFn: () => listReceiptLinkCandidatesFn({ data: { receiptId } }),
		staleTime: 0,
	})
	const options =
		kind === "nfe"
			? (candidates.data?.notes ?? []).map((note) => ({
					value: note.id,
					label: note.label,
					hint: [
						note.suggested ? "mesmo fornecedor" : null,
						note.cancelled ? "cancelada na SEFAZ" : null,
						note.totalValue != null ? `R$ ${note.totalValue.toFixed(2)}` : null,
					]
						.filter(Boolean)
						.join(" · "),
				}))
			: kind === "supplyOrder"
				? (candidates.data?.supplyOrders ?? []).map((order) => ({
						value: order.id,
						label: order.label,
						hint: order.suggested ? "do empenho da entrega" : undefined,
					}))
				: (candidates.data?.empenhos ?? []).map((empenho) => ({
						value: empenho.id,
						label: empenho.label,
						hint: empenho.suggested ? "mesmo fornecedor" : undefined,
					}))

	async function save() {
		if (!value) return
		setSaving(true)
		try {
			const result = await linkReceiptDocumentsFn({
				data: {
					receiptId,
					nfeDocumentId: kind === "nfe" ? value : undefined,
					supplyOrderId: kind === "supplyOrder" ? value : undefined,
					empenhoId: kind === "empenho" ? value : undefined,
				},
			})
			reportLink(result)
			onLinked()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível vincular")
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Vincular {KIND_LABELS[kind].title.toLowerCase()}</DialogTitle>
					<DialogDescription>
						{kind === "nfe"
							? "Os itens da nota casam com as linhas desta entrega. A mesma NF-e semanal pode fechar várias entregas."
							: kind === "supplyOrder"
								? "A OF traz junto o empenho dela."
								: "A NE da unidade que sustenta esta entrega."}
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={fieldId}>{KIND_LABELS[kind].title}</FieldLabel>
						<SearchableSelect
							id={fieldId}
							value={value}
							onValueChange={setValue}
							options={options}
							placeholder={candidates.isLoading ? "Carregando…" : KIND_LABELS[kind].pick}
							emptyLabel="Nada para vincular nesta cozinha"
						/>
						{kind === "empenho" && (
							<FieldDescription>
								A NE já saiu no SIAFI e ainda não está aqui? Registre o mínimo (número, data, valor, favorecido) e ela sai vinculada; o import do SIAFI completa
								depois, pelo número.
							</FieldDescription>
						)}
					</Field>
				</FieldGroup>
				<DialogFooter>
					{kind === "empenho" && (
						<Button variant="ghost" onClick={onRegisterEmpenho}>
							<FilePlus2 data-icon="inline-start" aria-hidden="true" />
							Registrar NE
						</Button>
					)}
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button disabled={!value || saving} onClick={save}>
						{saving && <Spinner data-icon="inline-start" />}
						Vincular
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
