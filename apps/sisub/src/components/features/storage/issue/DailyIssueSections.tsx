/**
 * Partes de apresentação da tela "Saída do dia" (`storage/$kitchenId/issue`). O estado e as
 * gravações ficam na página; aqui só se desenha o que ela passa.
 */

import { ISSUE_VARIANCE_REASON_LABELS, ISSUE_VARIANCE_REASONS, type IssueVarianceReason } from "@iefa/sisub-domain"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { AlertTriangle, CalendarDays, CheckCircle2, PackageMinus, RefreshCw, Undo2 } from "lucide-react"
import { useState } from "react"
import { IngredientSearchCombobox, type IssuableIngredient } from "@/components/features/storage/issue/IngredientSearchCombobox"
import { LateIssueCard } from "@/components/features/storage/issue/LateIssueCard"
import { ScanInput } from "@/components/features/storage/scan/ScanInput"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import type { fetchIssueRequestFn, fetchTodayIssueRequestFn } from "@/server/issue.fn"
import { fetchReturnableLotsFn, returnIssueFn } from "@/server/issue.fn"
import { BRL, type IssueOrigin, type IssueStock, NUM } from "./daily-issue"

type IssueRequestState = Awaited<ReturnType<typeof fetchIssueRequestFn>>
type IssueLine = IssueRequestState["lines"][number]
type AdHocRow = Awaited<ReturnType<typeof fetchTodayIssueRequestFn>>["adHocToday"][number]
type UnexplainedDay = { id: string; issue_date: string; origin: string }
export type ScannedLot = { ingredientId: string; lotId: string; description: string }

/** Sem requisição aberta no dia: abrir a da produção ou uma avulsa. */
export function NoIssueRequestView({
	origin,
	busy,
	kitchenId,
	today,
	availableById,
	unexplainedDays,
	onOpen,
	onToggleOrigin,
	onRefresh,
}: {
	origin: IssueOrigin
	busy: boolean
	kitchenId: number
	today: string
	availableById: ReadonlyMap<string, number>
	unexplainedDays: UnexplainedDay[] | undefined
	onOpen: () => void
	onToggleOrigin: () => void
	onRefresh: () => void
}) {
	return (
		<div className="space-y-4">
			<PageHeader title="Saída do dia" description="Nenhuma requisição aberta hoje nesta cozinha." />
			<Card>
				<CardContent className="space-y-3 pt-4 text-sm">
					<p>
						A requisição do dia reúne o que sai do estoque hoje. Ela é criada quando você abre — nunca sozinha, para a cozinha não acordar com documentos que
						ninguém pediu.
					</p>
					<div className="flex flex-wrap gap-2">
						<Button type="button" disabled={busy} onClick={onOpen}>
							{origin === "ad_hoc" ? "Abrir uma saída avulsa" : "Abrir a requisição de hoje"}
						</Button>
						<Button type="button" variant="ghost" onClick={onToggleOrigin}>
							{origin === "ad_hoc" ? "Ver a saída da produção" : "Saída avulsa (evento, apoio)"}
						</Button>
					</div>
				</CardContent>
			</Card>
			<UnexplainedDaysBanner days={unexplainedDays ?? []} origin={origin} />
			{origin === "production" && <LateIssueCard kitchenId={kitchenId} today={today} availableById={availableById} onDone={onRefresh} />}
		</div>
	)
}

/** Ação do cabeçalho: fechar o dia aberto, ou o selo do dia já fechado. */
export function IssueStatusAction({
	open,
	busy,
	pendingCount,
	status,
	onClose,
}: {
	open: boolean
	busy: boolean
	pendingCount: number
	status: string
	onClose: () => void
}) {
	return open ? (
		<Button type="button" disabled={busy || pendingCount > 0} onClick={onClose}>
			<CheckCircle2 className="mr-2 size-4" />
			Fechar o dia
		</Button>
	) : (
		<Badge variant="secondary">{status === "closed" ? "Fechado" : "Fechado sem justificativa"}</Badge>
	)
}

/** Preparações do dia com ficha que não dá sugestão (só na saída da produção). */
export function IssueGapsCard({
	show,
	gaps,
}: {
	show: boolean
	gaps: { items: { menuItemId: string | number; recipeName: string; notice: string }[] } | undefined
}) {
	if (!(show && (gaps?.items.length ?? 0) > 0)) return null
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle>
					<span className="flex items-center gap-2 text-subheading">
						<AlertTriangle className="size-4 text-warning" aria-hidden="true" />
						Ficha incompleta em {gaps?.items.length} preparação(ões) do dia
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1">
				{gaps?.items.map((item) => (
					<p key={item.menuItemId} className="text-body">
						<strong>{item.recipeName}</strong>: {item.notice.replace(/^Ficha incompleta — /, "")}
					</p>
				))}
				<p className="text-xs text-muted-foreground">
					A saída não trava: retire pela quantidade real. A nutricionista vê a ficha incompleta como pendência em Gestão Cozinha → Fluxos.
				</p>
			</CardContent>
		</Card>
	)
}

/** Avulsas do dia (quando há mais de uma) e o botão de abrir outra. */
export function AdHocSwitcher({
	adHocToday,
	currentRequestId,
	busy,
	onSelect,
	onNew,
}: {
	adHocToday: AdHocRow[]
	currentRequestId: string
	busy: boolean
	onSelect: (requestId: string) => void
	onNew: () => void
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			{adHocToday.length > 1 && <span className="text-muted-foreground">Avulsas de hoje:</span>}
			{adHocToday.length > 1 &&
				adHocToday.map((row) => (
					<Button
						key={row.id}
						type="button"
						size="sm"
						variant={row.id === currentRequestId ? "secondary" : "ghost"}
						className="h-7"
						onClick={() => onSelect(row.id)}
					>
						{row.purpose ?? "sem motivo"}
						{row.status === "open" ? "" : " (fechada)"}
					</Button>
				))}
			<Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={onNew}>
				Nova saída avulsa
			</Button>
		</div>
	)
}

export function PendingReasonsCard({ pendingCount, settings }: { pendingCount: number; settings: IssueRequestState["settings"] }) {
	if (!(pendingCount > 0)) return null
	return (
		<Card className="border-warning">
			<CardContent className="pt-4 text-sm">
				{pendingCount} linha(s) com desvio relevante esperando motivo. Tolerância desta cozinha: {settings.tolerancePct}% e{" "}
				{BRL.format(settings.toleranceFloorValue)} — abaixo dos dois, o desvio não é considerado.
			</CardContent>
		</Card>
	)
}

/** Leitura do código que aponta a linha, e o pino do lote lido. */
export function WithdrawScanCard({
	busy,
	scannerProfile,
	scannedLot,
	onScan,
	onClearLot,
}: {
	busy: boolean
	scannerProfile: { prefix: string | null; suffix: string | null; gsSubstitute: string | null }
	scannedLot: ScannedLot | null
	onScan: (input: { gtin?: string; lotShortCode?: string }) => Promise<void>
	onClearLot: () => void
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2">
					<PackageMinus className="size-4" />
					Retirar
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<ScanInput
					label="Código do insumo"
					placeholder="Leia o GTIN da embalagem ou a etiqueta do lote…"
					disabled={busy}
					config={{
						prefix: scannerProfile.prefix ?? undefined,
						suffix: scannerProfile.suffix ?? undefined,
						gsSubstitute: scannerProfile.gsSubstitute ?? undefined,
					}}
					onReading={(reading) => {
						// A leitura APONTA a linha; a quantidade continua sendo do
						// almoxarife — a embalagem lida não decide quanto vai sair.
						// Antes daqui a leitura só mandava "informe a quantidade na
						// linha do insumo abaixo", e o operador lia o código e seguia
						// procurando a linha na mão: o trabalho que a leitura existe
						// para poupar.
						const gtin = reading.kind === "gtin" ? reading.gtin : reading.kind === "gs1" ? reading.fields.gtin : null
						if (gtin) {
							void onScan({ gtin })
							return
						}
						if (reading.kind === "lot_label") {
							void onScan({ lotShortCode: reading.lotShortCode })
							return
						}
						// A chave de NF-e É reconhecida — só não é deste lugar. Cair
						// em "Código não reconhecido" mandava o operador procurar
						// defeito no leitor que estava funcionando.
						if (reading.kind === "nfe_access_key") {
							toast.error("Isto é uma chave de NF-e. Entrada de material é na tela de Recebimento")
							return
						}
						toast.error("Código não reconhecido")
					}}
				/>
				{/*
				 * O pino do lote tem de aparecer: sem isso a saída seguinte
				 * saía de um lote que a tela não mostrava, e o erro "lote sem
				 * saldo" mandava "deixar a alocação automática" sem dizer como.
				 */}
				{scannedLot && (
					<div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-xs">
						<span>
							{scannedLot.description}: a próxima saída sai do <strong>lote lido na etiqueta</strong>.
						</span>
						<Button type="button" size="sm" variant="ghost" className="h-6" onClick={onClearLot}>
							Usar a alocação automática
						</Button>
					</div>
				)}
				<p className="text-xs text-muted-foreground">
					Os lotes são escolhidos automaticamente: o que vence primeiro, ignorando vencido e o que está em quarentena.
				</p>
			</CardContent>
		</Card>
	)
}

/** Título do card "Itens do dia", com o recálculo da sugestão quando cabe. */
export function DayItemsTitle({ canRecalculate, busy, onRecalculate }: { canRecalculate: boolean; busy: boolean; onRecalculate: () => void }) {
	return (
		<CardTitle className="flex items-center gap-2">
			<CalendarDays className="size-4" />
			Itens do dia
			{canRecalculate && (
				/*
				 * A sugestão é escrita quando a requisição é aberta. Quem abre o
				 * documento ANTES de a produção lançar as tarefas do dia — o que
				 * é o normal em cozinha que planeja de manhã — fica com zero
				 * linhas sugeridas para sempre, e o portão de variância,
				 * justificativa e fechamento nasce vazio sem nenhum sinal na
				 * tela. Este botão é a única forma de recalcular.
				 */
				<Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={onRecalculate}>
					<RefreshCw className="mr-1 size-3.5" />
					Recalcular sugestão
				</Button>
			)}
		</CardTitle>
	)
}

/** Saída de insumo fora da sugestão (qualquer insumo do catálogo). */
export function ExtraIngredientRow({
	kitchenId,
	extraIngredient,
	onIngredientChange,
	availableById,
	extraWithoutStock,
	extraQuantity,
	onQuantityChange,
	busy,
	extraIngredientId,
	onWithdraw,
}: {
	kitchenId: number
	extraIngredient: IssuableIngredient | null
	onIngredientChange: (ingredient: IssuableIngredient | null) => void
	availableById: ReadonlyMap<string, number>
	extraWithoutStock: boolean
	extraQuantity: string
	onQuantityChange: (value: string) => void
	busy: boolean
	extraIngredientId: string
	onWithdraw: () => void
}) {
	return (
		<div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed p-3">
			<div className="min-w-72 flex-1 space-y-1">
				<Label htmlFor="extra">Retirar insumo fora da sugestão</Label>
				<IngredientSearchCombobox id="extra" kitchenId={kitchenId} value={extraIngredient} onChange={onIngredientChange} availableById={availableById} />
				{extraWithoutStock && (
					<p className="flex items-center gap-1 text-xs text-warning" role="status">
						<AlertTriangle className="size-3.5" aria-hidden="true" />
						Sem saldo registrado — entra como falta a regularizar na contagem.
					</p>
				)}
			</div>
			<Input
				className="w-28"
				inputMode="decimal"
				placeholder="quantidade"
				data-issue-qty="extra"
				value={extraQuantity}
				onChange={(event) => onQuantityChange(event.target.value)}
			/>
			<Button type="button" disabled={busy || !extraIngredientId} onClick={onWithdraw}>
				Retirar
			</Button>
		</div>
	)
}

/** Uma linha da sugestão do dia: quantidade a retirar, devolução e motivo do desvio. */
export function IssueLineRow({
	line,
	requestId,
	stock,
	scanned,
	open,
	busy,
	quantity,
	onQuantityChange,
	onWithdraw,
	onReasonChange,
	onReturned,
}: {
	line: IssueLine
	requestId: string
	stock: IssueStock | undefined
	scanned: boolean
	open: boolean
	busy: boolean
	quantity: string
	onQuantityChange: (value: string) => void
	onWithdraw: () => void
	onReasonChange: (value: IssueVarianceReason | null) => void
	onReturned: () => void
}) {
	// A linha lida precisa se distinguir SEM faixa lateral colorida:
	// borda inteira e um leve tint de fundo. Só o foco no campo não
	// basta numa lista longa — o operador está olhando a prateleira,
	// não a tela, quando o leitor apita.
	return (
		<div className={scanned ? "rounded-xl border border-primary bg-primary/5 p-3 text-sm" : "rounded-xl border p-3 text-sm"}>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<strong>{line.description}</strong>
					<span className="ml-2 text-xs text-muted-foreground">
						sugerido {line.suggestedQty != null ? NUM.format(line.suggestedQty) : "—"} · saiu {NUM.format(line.issuedNetQty)} {line.measureUnit ?? ""}
						{stock && ` · disponível ${NUM.format(stock.available)}`}
					</span>
				</div>
				<div className="flex items-center gap-2">
					{line.requiresReason && !line.hasReason && (
						<Badge variant="outline" className="text-warning">
							desvio {line.deltaPct}% · {BRL.format(line.deltaValue)}
						</Badge>
					)}
					{open && (
						<>
							<Input
								className="w-28"
								inputMode="decimal"
								placeholder="quantidade"
								data-issue-qty={line.ingredientId}
								value={quantity}
								onChange={(event) => onQuantityChange(event.target.value)}
							/>
							<Button type="button" size="sm" disabled={busy} onClick={onWithdraw}>
								Retirar
							</Button>
						</>
					)}
				</div>
			</div>

			{open && line.issuedNetQty > 0 && (
				<ReturnRow
					requestId={requestId}
					ingredientId={line.ingredientId}
					description={line.description}
					busy={busy}
					version={line.issuedNetQty}
					onDone={onReturned}
				/>
			)}

			{line.requiresReason && line.itemId && (
				<div className="mt-2 flex flex-wrap items-center gap-2">
					<Label htmlFor={`reason-${line.itemId}`} className="text-xs">
						Motivo do desvio
					</Label>
					<Select value={(line.reason as IssueVarianceReason | null) ?? null} onValueChange={(value) => onReasonChange(value)}>
						<SelectTrigger id={`reason-${line.itemId}`} className="w-72">
							<SelectValue>{line.reason ? ISSUE_VARIANCE_REASON_LABELS[line.reason as IssueVarianceReason] : "Escolha o motivo"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{ISSUE_VARIANCE_REASONS.filter((reason) => reason !== "other").map((reason) => (
								<SelectItem key={reason} value={reason}>
									{ISSUE_VARIANCE_REASON_LABELS[reason]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		</div>
	)
}

/**
 * Dias que fecharam sozinhos com desvio sem motivo: a pendência de quem opera o estoque.
 * Cada um leva à requisição daquele dia, onde se registra a justificativa.
 */
export function UnexplainedDaysBanner({ days, origin }: { days: Array<{ id: string; issue_date: string; origin: string }>; origin: string }) {
	const navigate = useNavigate()
	if (days.length === 0) return null
	return (
		<Card>
			<CardContent className="flex flex-wrap items-center gap-2 pt-4">
				<AlertTriangle className="size-4 text-warning" aria-hidden="true" />
				<span className="text-body">
					{days.length === 1 ? "1 dia fechou sozinho" : `${days.length} dias fecharam sozinhos`} com desvio sem motivo e espera{days.length === 1 ? "" : "m"}{" "}
					justificativa:
				</span>
				{days.slice(0, 10).map((day) => (
					<Button
						key={day.id}
						type="button"
						size="sm"
						variant="outline"
						onClick={() =>
							navigate({
								to: ".",
								search: day.origin === "production" ? { origin: "production", date: day.issue_date } : { origin: "ad_hoc", requestId: day.id },
							})
						}
					>
						{day.issue_date.split("-").reverse().join("/")}
						{day.origin === "ad_hoc" || origin === "ad_hoc" ? " (avulsa)" : ""}
					</Button>
				))}
			</CardContent>
		</Card>
	)
}

/**
 * Devolução do que saiu e não foi usado — volta ao lote de origem.
 *
 * O lote vem de uma LISTA dos que esta requisição emitiu deste insumo, e não
 * de um campo de texto. O campo aceitava um UUID digitado à mão, e a tela
 * nunca mostrou um: o operador colava um identificador de outro lugar e a
 * devolução caía em outro insumo enquanto o aviso nomeava a linha atual. O
 * banco impede devolver mais do que saiu, mas não impede devolver no item
 * errado — e esse erro só apareceria na contagem, semanas depois.
 */
function ReturnRow({
	requestId,
	ingredientId,
	description,
	busy,
	version,
	onDone,
}: {
	requestId: string
	ingredientId: string
	description: string
	busy: boolean
	/** Muda a cada saída ou devolução da linha — refaz a lista de lotes devolvíveis. */
	version: number
	onDone: () => void
}) {
	const [quantity, setQuantity] = useState("")
	const [lotId, setLotId] = useState("")
	// mesmo raciocínio da emissão: o identificador sobrevive ao erro, para que a
	// segunda tentativa depois de um 502 seja a MESMA devolução
	// …e é do PEDIDO: trocar o lote ou a quantidade é outra devolução. Mantido
	// com o mesmo identificador, o retry devolvia calado a devolução anterior
	// (2 KG do lote A) enquanto a tela dizia "3 devolvido".
	const [emission, setEmission] = useState<{ key: string; id: string } | null>(null)
	// Trava o botão enquanto a devolução viaja: dois cliques eram duas chamadas
	// com o mesmo identificador, e o operador via sucesso e erro juntos.
	const [returning, setReturning] = useState(false)
	const { data: returnable } = useQuery({
		// A versão da requisição entra na chave. `router.invalidate()` não toca o
		// cache do React Query: sem isto a lista não enxergava o lote de uma saída
		// nova nem o saldo que uma devolução parcial já consumiu.
		queryKey: ["returnable-lots", requestId, ingredientId, version],
		queryFn: () => fetchReturnableLotsFn({ data: { requestId, ingredientId } }),
	})
	const lots = returnable?.lots ?? []

	if (lots.length === 0) return null

	return (
		<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
			<Undo2 className="size-3.5 text-muted-foreground" />
			<span className="text-muted-foreground">Devolver ao estoque</span>
			<Input className="h-7 w-24" inputMode="decimal" placeholder="qtd" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
			<Select value={lotId || null} onValueChange={(value) => setLotId(value ?? "")}>
				<SelectTrigger className="h-7 w-72">
					<SelectValue>{lots.find((lot) => lot.lotId === lotId)?.label ?? "Lote de origem"}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{lots.map((lot) => (
						<SelectItem key={lot.lotId} value={lot.lotId}>
							{lot.label} · saiu {NUM.format(lot.returnable)}
							{lot.expiryDate ? ` · vence ${lot.expiryDate}` : ""}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="h-7"
				disabled={busy || returning || !quantity || !lotId}
				onClick={async () => {
					const amount = Number(quantity.replace(",", "."))
					if (!Number.isFinite(amount) || amount <= 0) {
						toast.error("Informe a quantidade")
						return
					}
					setReturning(true)
					try {
						const key = `${requestId}:${lotId}:${amount}`
						const emissionId = emission?.key === key ? emission.id : crypto.randomUUID()
						if (emission?.key !== key) setEmission({ key, id: emissionId })
						const result = await returnIssueFn({ data: { requestId, lotId, quantity: amount, emissionId } })
						toast.success(`${description}: ${NUM.format(amount)} devolvido a ${BRL.format(result.unitCost)}/un`)
						setQuantity("")
						setLotId("")
						setEmission(null)
						onDone()
					} catch (error) {
						toast.error(error instanceof Error ? error.message : "Erro ao devolver")
					} finally {
						setReturning(false)
					}
				}}
			>
				Devolver
			</Button>
		</div>
	)
}
