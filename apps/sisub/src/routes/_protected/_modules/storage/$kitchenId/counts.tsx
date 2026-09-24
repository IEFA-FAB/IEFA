import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ClipboardCheck, Eye, EyeOff, Plus, Search } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { ScanInput, scannerPropsFrom } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import {
	acceptNotCountedFn,
	addFoundItemFn,
	approveInventoryCountFn,
	fetchCountSheetFn,
	listInventoryCountsFn,
	openInventoryCountFn,
	openRecountFn,
	postCountEntriesFn,
	rejectInventoryCountFn,
	reviewInventoryCountFn,
} from "@/server/count.fn"
import { fetchScannerProfileFn, resolveScanToIngredientFn } from "@/server/scanner.fn"

/**
 * Inventário.
 *
 * O requisito era "uma ferramenta para ajudar a refazer o inventário", e a
 * diferença entre ferramenta e planilha está em três coisas que esta tela
 * respeita e uma folha impressa não consegue:
 *
 *  • a cozinha **continua trabalhando** enquanto se conta. A diferença é
 *    medida contra o saldo no instante do lançamento, não contra o de agora;
 *  • a contagem é **cega** por padrão — quem conta não vê o esperado, porque
 *    contar sabendo o número é conferir, não contar;
 *  • **quem contou não aprova**, e isso é decidido no banco.
 *
 * A folha mostra item, lote, validade e local, e o campo "contado". O saldo só
 * aparece para o nível 3 ou depois de encerrada a coleta — e não é o React que
 * esconde: o servidor não manda o número.
 */

const TYPE_LABELS: Record<string, string> = {
	annual: "Anual",
	responsibility_transfer: "Transferência de responsabilidade",
	eventual: "Eventual",
	rotating: "Rotativa",
}

const SCOPE_LABELS: Record<string, string> = {
	full: "Estoque inteiro",
	conservation_class: "Por classe de conservação",
	location: "Por local",
	item_list: "Lista de itens",
	menu_cycle: "Ciclo do cardápio",
}

const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	counting: "Em contagem",
	review: "Em revisão",
	recount: "Recontagem aberta",
	approved: "Aprovada",
	rejected: "Rejeitada",
	expired: "Expirada",
	confirmed: "Confirmada",
}

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/counts")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 2),
	loaderDeps: ({ search }) => ({ countId: (search as { countId?: string }).countId }),
	loader: async ({ params, deps }) => {
		const kitchenId = Number(params.kitchenId)
		const [list, scannerProfile] = await Promise.all([listInventoryCountsFn({ data: { kitchenId } }), fetchScannerProfileFn({ data: { kitchenId } })])
		// a folha aberta é a que está sendo contada; sem ela, a última em revisão
		const target =
			deps.countId ??
			// `recount` é a rodada SUBSTITUÍDA pela recontagem: não se conta mais nela
			list.counts.find((count: { status: string }) => count.status === "counting")?.id ??
			list.counts.find((count: { status: string }) => count.status === "review")?.id
		const sheet = target ? await fetchCountSheetFn({ data: { countId: target } }) : null
		return { list, sheet, scannerProfile, kitchenId }
	},
	component: CountsPage,
})

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })

function CountsPage() {
	const { list, sheet, scannerProfile, kitchenId } = Route.useLoaderData()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [type, setType] = useState("rotating")
	const [scope, setScope] = useState("full")
	const [scopeValue, setScopeValue] = useState("")
	const [quantities, setQuantities] = useState<Record<string, string>>({})
	// O que a última leitura apontou. A folha só lista lote que já foi contado, e
	// o lote na mão do operador pode ainda não ter linha: a leitura abre o alvo
	// aqui, com o campo de quantidade, em vez de procurar uma linha que não existe.
	const [scanned, setScanned] = useState<{ ingredientId: string; lotId: string | null; description: string } | null>(null)
	const [scannedQty, setScannedQty] = useState("")

	async function run(action: () => Promise<unknown>, success: string) {
		setBusy(true)
		try {
			await action()
			toast.success(success)
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na contagem")
		} finally {
			setBusy(false)
		}
	}

	/**
	 * Lança a quantidade de uma linha.
	 *
	 * O identificador é gerado AQUI e carrega a linha e o valor: dois cliques
	 * iguais seguidos são o mesmo lançamento, e o índice único no banco recusa o
	 * segundo. É a mesma proteção que a fila offline vai usar quando existir.
	 */
	async function postLine(line: { key: string; lotId: string | null; ingredientId: string | null; frozenPreparationId: string | null }, quantity: number) {
		if (!sheet) return
		await run(
			() =>
				postCountEntriesFn({
					data: {
						countId: sheet.count.id,
						entries: [
							{
								clientEventId: `${line.key}:${quantity}:${Date.now()}`,
								lotId: line.lotId ?? undefined,
								ingredientId: line.lotId ? undefined : (line.ingredientId ?? undefined),
								frozenPreparationId: line.lotId ? undefined : (line.frozenPreparationId ?? undefined),
								quantity,
								overwrite: false,
							},
						],
					},
				}),
			"Lançamento registrado"
		)
		setQuantities((current) => ({ ...current, [line.key]: "" }))
	}

	const open = sheet?.count.status === "counting"
	const scannedInScope = scanned != null && (sheet?.lines ?? []).some((line) => line.ingredientId === scanned.ingredientId)
	const inReview = sheet?.count.status === "review"
	// só as linhas DESTA rodada se recontam; as da rodada anterior já ficaram decididas
	const divergent = (sheet?.lines ?? []).filter((line) => line.ownRound && line.needsRecount === true)

	return (
		<div className="space-y-4">
			<PageHeader
				title="Contagem Física"
				description="Contagem com escopo, folha cega e aprovação por quem não contou. A cozinha continua trabalhando enquanto se conta."
			/>

			{!sheet && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-subheading">
							<Plus className="size-4" />
							Abrir contagem
						</CardTitle>
						<p className="text-xs text-muted-foreground">Duas contagens abertas não podem disputar o mesmo item: o banco recusa e diz qual delas conflita.</p>
					</CardHeader>
					<CardContent className="flex flex-wrap items-end gap-2">
						<div className="space-y-1">
							<Label htmlFor="count-type">Tipo</Label>
							<Select value={type} onValueChange={(value) => setType(value ?? "rotating")}>
								<SelectTrigger id="count-type" className="w-64">
									<SelectValue>{TYPE_LABELS[type]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{Object.entries(TYPE_LABELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="count-scope">Escopo</Label>
							<Select value={scope} onValueChange={(value) => setScope(value ?? "full")}>
								<SelectTrigger id="count-scope" className="w-60">
									<SelectValue>{SCOPE_LABELS[scope]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{Object.entries(SCOPE_LABELS).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{scope !== "full" && scope !== "item_list" && (
							<div className="space-y-1">
								<Label htmlFor="scope-value">{scope === "menu_cycle" ? "Dias do ciclo" : scope === "location" ? "Local" : "Classe"}</Label>
								<Input id="scope-value" className="w-40" value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} />
							</div>
						)}
						<Button
							type="button"
							disabled={busy}
							onClick={() => {
								const params: Record<string, unknown> = {}
								if (scope === "menu_cycle") params.days = Number(scopeValue) || 7
								if (scope === "location") params.location = scopeValue
								if (scope === "conservation_class") params.conservation_class = scopeValue
								void run(
									() => openInventoryCountFn({ data: { kitchenId, type: type as "rotating", scope: scope as "full", scopeParams: params } }),
									"Contagem aberta"
								)
							}}
						>
							Abrir
						</Button>
					</CardContent>
				</Card>
			)}

			{sheet && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="flex flex-wrap items-center gap-2 text-subheading">
							<ClipboardCheck className="size-4" />
							{TYPE_LABELS[sheet.count.type] ?? sheet.count.type} · {SCOPE_LABELS[sheet.count.scope] ?? sheet.count.scope}
							<Badge variant="secondary">{STATUS_LABELS[sheet.count.status] ?? sheet.count.status}</Badge>
							{sheet.count.round > 1 && <Badge variant="outline">rodada {sheet.count.round}</Badge>}
							<Badge variant="outline" className="gap-1">
								{sheet.reveal ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
								{sheet.reveal ? "Saldo visível" : "Cega"}
							</Badge>
						</CardTitle>
						<p className="text-xs text-muted-foreground">
							{sheet.scopeItems} item(ns) no escopo · {sheet.notCounted} ainda sem lançamento
							{!sheet.reveal && " · o saldo esperado não é enviado para esta tela"}
						</p>
					</CardHeader>
					<CardContent className="space-y-3">
						{open && (
							<ScanInput
								label="Código do item ou etiqueta do lote"
								placeholder="Leia o GTIN ou a etiqueta do lote…"
								disabled={busy}
								{...scannerPropsFrom(scannerProfile)}
								onReading={async (reading) => {
									// a leitura APONTA o alvo; a quantidade é sempre do operador,
									// porque a embalagem lida não diz quantas há na prateleira
									if (reading.kind !== "lot_label" && reading.kind !== "gtin") {
										toast.error("Código não reconhecido: leia o GTIN da embalagem ou a etiqueta do lote")
										return
									}
									try {
										const found = await resolveScanToIngredientFn({
											data: reading.kind === "lot_label" ? { kitchenId, lotShortCode: reading.lotShortCode } : { kitchenId, gtin: reading.gtin },
										})
										if (!found.ingredientId) {
											toast.error("Código não está no catálogo desta cozinha")
											return
										}
										setScanned({ ingredientId: found.ingredientId, lotId: found.lotId, description: found.description ?? "insumo" })
										setScannedQty("")
										requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-count-qty=scanned]")?.focus())
									} catch (error) {
										toast.error(error instanceof Error ? error.message : "Erro ao resolver o código lido")
									}
								}}
							/>
						)}

						{open && scanned && (
							<div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
								<span>
									Contando: <strong>{scanned.description}</strong>
									{scanned.lotId ? " · lote lido na etiqueta" : " · sem lote (o monte na prateleira)"}
								</span>
								{scannedInScope ? (
									<>
										<Input
											className="h-8 w-24"
											inputMode="decimal"
											placeholder="qtd"
											data-count-qty="scanned"
											value={scannedQty}
											onChange={(event) => setScannedQty(event.target.value)}
										/>
										<Button
											type="button"
											size="sm"
											disabled={busy}
											onClick={async () => {
												const quantity = Number(scannedQty.replace(",", "."))
												if (!Number.isFinite(quantity) || quantity < 0) {
													toast.error("Informe a quantidade")
													return
												}
												await postLine(
													{
														key: `scan:${scanned.ingredientId}:${scanned.lotId ?? "item"}`,
														lotId: scanned.lotId,
														ingredientId: scanned.ingredientId,
														frozenPreparationId: null,
													},
													quantity
												)
												setScanned(null)
											}}
										>
											Lançar
										</Button>
									</>
								) : (
									<>
										<span className="text-muted-foreground">fora do escopo desta contagem.</span>
										<Button
											type="button"
											size="sm"
											variant="outline"
											disabled={busy}
											onClick={() =>
												run(() => addFoundItemFn({ data: { countId: sheet.count.id, ingredientId: scanned.ingredientId } }), "Achado incluído na contagem")
											}
										>
											Incluir como achado
										</Button>
									</>
								)}
								<Button type="button" size="sm" variant="ghost" onClick={() => setScanned(null)}>
									Cancelar
								</Button>
							</div>
						)}

						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Item</TableHead>
									<TableHead>Lote</TableHead>
									<TableHead>Local</TableHead>
									<TableHead>Validade</TableHead>
									<TableHead className="text-right">Contado</TableHead>
									{sheet.reveal && <TableHead className="text-right">Esperado</TableHead>}
									{sheet.reveal && <TableHead className="text-right">Diferença</TableHead>}
									{open && <TableHead>Lançar</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{sheet.lines.map((line) => (
									<TableRow key={line.key} className={line.needsRecount ? "bg-warning/5" : undefined}>
										<TableCell>
											{line.description}
											{line.found && (
												<Badge variant="outline" className="ml-2 text-xs">
													achado
												</Badge>
											)}
											{line.ownRound && line.entries === 0 && (
												<Badge variant="outline" className="ml-2 text-xs text-muted-foreground">
													{line.notCountedAccepted ? "aceito como não contado" : "não contado"}
												</Badge>
											)}
											{!line.ownRound && (
												<Badge variant="outline" className="ml-2 text-xs text-muted-foreground">
													rodada anterior
												</Badge>
											)}
										</TableCell>
										<TableCell className="font-mono text-xs">{line.lotLabel ?? "sem lote"}</TableCell>
										<TableCell className="text-xs">{line.location ?? "—"}</TableCell>
										<TableCell className="text-xs">{line.expiryDate ?? "—"}</TableCell>
										<TableCell className="text-right tabular-nums">
											{NUM.format(line.counted)} {line.measureUnit ?? ""}
											{line.entries > 1 && <span className="ml-1 text-xs text-muted-foreground">({line.entries} lanç.)</span>}
										</TableCell>
										{sheet.reveal && <TableCell className="text-right tabular-nums">{line.ledger == null ? "—" : NUM.format(line.ledger)}</TableCell>}
										{sheet.reveal && (
											<TableCell className={`text-right tabular-nums ${line.needsRecount ? "text-warning" : ""}`}>
												{line.difference == null ? "—" : NUM.format(line.difference)}
											</TableCell>
										)}
										{open && !line.ownRound && <TableCell />}
										{open && line.ownRound && (
											<TableCell>
												<div className="flex items-center gap-1">
													<Input
														className="h-8 w-24"
														inputMode="decimal"
														placeholder="qtd"
														data-count-qty={line.key}
														value={quantities[line.key] ?? ""}
														onChange={(event) => setQuantities((current) => ({ ...current, [line.key]: event.target.value }))}
													/>
													<Button
														type="button"
														size="sm"
														variant="outline"
														disabled={busy}
														onClick={() => {
															const quantity = Number((quantities[line.key] ?? "").replace(",", "."))
															if (!Number.isFinite(quantity) || quantity < 0) {
																toast.error("Informe a quantidade")
																return
															}
															void postLine(line, quantity)
														}}
													>
														Lançar
													</Button>
												</div>
											</TableCell>
										)}
									</TableRow>
								))}
							</TableBody>
						</Table>

						<div className="flex flex-wrap gap-2">
							{open && (
								<Button
									type="button"
									disabled={busy}
									onClick={() => run(() => reviewInventoryCountFn({ data: { countId: sheet.count.id } }), "Coleta encerrada")}
								>
									Encerrar a coleta
								</Button>
							)}
							{inReview && divergent.length > 0 && (
								<Button
									type="button"
									variant="secondary"
									disabled={busy}
									onClick={() =>
										run(
											() =>
												openRecountFn({
													data: {
														countId: sheet.count.id,
														ingredientIds: [...new Set(divergent.map((line) => line.ingredientId).filter(Boolean))] as string[],
														frozenPreparationIds: [...new Set(divergent.map((line) => line.frozenPreparationId).filter(Boolean))] as string[],
													},
												}),
											`Recontagem aberta com ${divergent.length} linha(s)`
										)
									}
								>
									<Search className="mr-2 size-4" />
									Recontar as {divergent.length} divergentes
								</Button>
							)}
							{inReview && (
								<Button
									type="button"
									disabled={busy}
									onClick={() => {
										const exceptionReason =
											sheet.count.created_by == null
												? undefined
												: (window.prompt("Se você abriu esta contagem, registre a exceção (deixe vazio para tentar sem):") ?? undefined)
										void run(
											() => approveInventoryCountFn({ data: { countId: sheet.count.id, exceptionReason: exceptionReason?.trim() || undefined } }),
											"Inventário aprovado"
										)
									}}
								>
									Aprovar e lançar o ajuste
								</Button>
							)}
							{(open || inReview) && (
								<Button
									type="button"
									variant="ghost"
									disabled={busy}
									onClick={() => {
										const reason = window.prompt("Motivo da rejeição (mínimo 5 caracteres):")
										if (!reason || reason.trim().length < 5) {
											toast.error("Rejeitar exige motivo")
											return
										}
										void run(() => rejectInventoryCountFn({ data: { countId: sheet.count.id, reason } }), "Contagem rejeitada")
									}}
								>
									Rejeitar
								</Button>
							)}
						</div>

						{inReview && sheet.notCounted > 0 && (
							<div className="rounded-xl border border-dashed p-3 text-sm">
								<p className="mb-2">
									{sheet.notCounted} item(ns) do escopo sem nenhum lançamento. Eles <strong>não</strong> viram zero sozinhos — tratar esquecimento como baixa de
									estoque é como um inventário inventa perda.
								</p>
								<div className="flex flex-wrap gap-1">
									{sheet.lines
										.filter((line) => line.ownRound && line.entries === 0)
										.map((line) => (
											<Button
												key={line.key}
												type="button"
												size="sm"
												variant={line.notCountedAccepted ? "secondary" : "outline"}
												disabled={busy}
												onClick={() =>
													run(
														() =>
															acceptNotCountedFn({
																data: {
																	countId: sheet.count.id,
																	ingredientId: line.ingredientId ?? undefined,
																	frozenPreparationId: line.ingredientId ? undefined : (line.frozenPreparationId ?? undefined),
																	accepted: !line.notCountedAccepted,
																},
															}),
														line.notCountedAccepted ? "Marcação removida" : "Item aceito como não contado"
													)
												}
											>
												{line.description}
											</Button>
										))}
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Contagens da cozinha</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Competência</TableHead>
								<TableHead>Tipo</TableHead>
								<TableHead>Escopo</TableHead>
								<TableHead>Rodada</TableHead>
								<TableHead>Estado</TableHead>
								<TableHead>Segregação</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{list.counts.map(
								(count: {
									id: string
									competencia: string
									type: string
									scope: string
									round: number
									status: string
									blind: boolean
									approved_at: string | null
									approved_by_own_entry: boolean
								}) => (
									<TableRow key={count.id}>
										<TableCell className="text-xs">{count.competencia}</TableCell>
										<TableCell className="text-xs">{TYPE_LABELS[count.type] ?? count.type}</TableCell>
										<TableCell className="text-xs">{SCOPE_LABELS[count.scope] ?? count.scope}</TableCell>
										<TableCell className="text-xs">{count.round}</TableCell>
										<TableCell className="text-xs">
											<Badge variant="secondary">{STATUS_LABELS[count.status] ?? count.status}</Badge>
										</TableCell>
										<TableCell className="text-xs">
											{/*
											 * Em `dual`, quem lançou pode aprovar — e isso fica gravado.
											 * Sem esta coluna, a contagem aprovada pelo próprio lançador
											 * seria indistinguível da que passou por duas pessoas, e a
											 * auditoria não teria como separar as duas.
											 */}
											{count.approved_by_own_entry ? (
												<Badge variant="outline" className="text-warning">
													aprovada pelo próprio lançador
												</Badge>
											) : count.approved_at ? (
												"segregada"
											) : (
												"—"
											)}
										</TableCell>
									</TableRow>
								)
							)}
						</TableBody>
					</Table>
					{list.total > list.counts.length && (
						<p className="mt-2 text-xs text-muted-foreground">
							Mostrando {list.counts.length} de {list.total}.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
