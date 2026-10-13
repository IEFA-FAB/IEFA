/**
 * Partes de apresentação da tela de inventário (`storage/$kitchenId/counts`). O estado e as
 * gravações ficam na página.
 */

import type { InventoryCountType } from "@iefa/sisub-domain"
import { ClipboardCheck, Eye, EyeOff, Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { fetchCountSheetFn, listInventoryCountsFn } from "@/server/count.fn"
import { hasScopeValue, NUM, SCOPE_LABELS, type ScannedTarget, STATUS_LABELS, scopeValueLabel, TYPE_LABELS } from "./counts-page"

type CountSheet = NonNullable<Awaited<ReturnType<typeof fetchCountSheetFn>>>
export type CountLine = CountSheet["lines"][number]
type CountListRow = {
	id: string
	competencia: string
	type: string
	scope: string
	round: number
	status: string
	blind: boolean
	approved_at: string | null
	approved_by_own_entry: boolean
}

/** Abertura de inventário: tipo, escopo e o valor do escopo quando ele pede. */
export function OpenCountCard({
	busy,
	type,
	onTypeChange,
	scope,
	onScopeChange,
	scopeValue,
	onScopeValueChange,
	onOpen,
}: {
	busy: boolean
	type: InventoryCountType
	onTypeChange: (value: InventoryCountType) => void
	scope: string
	onScopeChange: (value: string) => void
	scopeValue: string
	onScopeValueChange: (value: string) => void
	onOpen: () => void
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2">
					<Plus className="size-4" />
					Abrir inventário
				</CardTitle>
				<p className="text-xs text-muted-foreground">Dois inventários abertos não podem disputar o mesmo item: o banco recusa e diz qual deles conflita.</p>
			</CardHeader>
			<CardContent className="flex flex-wrap items-end gap-2">
				<div className="space-y-1">
					<Label htmlFor="count-type">Tipo</Label>
					<Select value={type} onValueChange={(value) => onTypeChange((value as InventoryCountType | null) ?? "rotativo")}>
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
					<Select value={scope} onValueChange={(value) => onScopeChange(value ?? "full")}>
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
				{hasScopeValue(scope) && (
					<div className="space-y-1">
						<Label htmlFor="scope-value">{scopeValueLabel(scope)}</Label>
						<Input id="scope-value" className="w-40" value={scopeValue} onChange={(event) => onScopeValueChange(event.target.value)} />
					</div>
				)}
				<Button type="button" disabled={busy} onClick={onOpen}>
					Abrir
				</Button>
			</CardContent>
		</Card>
	)
}

/** Cabeçalho da folha: tipo, escopo, estado, rodada e se a contagem é cega. */
export function CountSheetHeader({ sheet }: { sheet: CountSheet }) {
	return (
		<CardHeader className="pb-2">
			<CardTitle className="flex flex-wrap items-center gap-2">
				<ClipboardCheck className="size-4" />
				{TYPE_LABELS[sheet.count.type] ?? sheet.count.type} · {SCOPE_LABELS[sheet.count.scope] ?? sheet.count.scope}
				<Badge variant="secondary">{STATUS_LABELS[sheet.count.status] ?? sheet.count.status}</Badge>
				{sheet.count.round > 1 && <Badge variant="outline">rodada {sheet.count.round}</Badge>}
				<Badge variant="outline">
					{sheet.reveal ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
					{sheet.reveal ? "Saldo visível" : "Cega"}
				</Badge>
			</CardTitle>
			<p className="text-xs text-muted-foreground">
				{sheet.scopeItems} item(ns) no escopo · {sheet.notCounted} ainda sem lançamento
				{!sheet.reveal && " · o saldo esperado não é enviado para esta tela"}
			</p>
		</CardHeader>
	)
}

/** Alvo da última leitura: lança a quantidade, ou inclui como achado se está fora do escopo. */
export function ScannedTargetPanel({
	scanned,
	scannedInScope,
	scannedQty,
	onQtyChange,
	busy,
	onPost,
	onAddFound,
	onCancel,
}: {
	scanned: ScannedTarget
	scannedInScope: boolean
	scannedQty: string
	onQtyChange: (value: string) => void
	busy: boolean
	onPost: () => void
	onAddFound: () => void
	onCancel: () => void
}) {
	return (
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
						onChange={(event) => onQtyChange(event.target.value)}
					/>
					<Button type="button" size="sm" disabled={busy} onClick={onPost}>
						Lançar
					</Button>
				</>
			) : (
				<>
					<span className="text-muted-foreground">fora do escopo deste inventário.</span>
					<Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAddFound}>
						Incluir como achado
					</Button>
				</>
			)}
			<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
				Cancelar
			</Button>
		</div>
	)
}

/** Folha de contagem: uma linha por lote (ou item sem lote) do escopo. */
export function CountSheetTable({
	sheet,
	open,
	busy,
	quantities,
	onQuantityChange,
	onPost,
}: {
	sheet: CountSheet
	open: boolean
	busy: boolean
	quantities: Record<string, string>
	onQuantityChange: (key: string, value: string) => void
	onPost: (line: CountLine) => void
}) {
	return (
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
						<CountLineItemCell line={line} />
						<TableCell className="font-mono text-xs">{line.lotLabel ?? "sem lote"}</TableCell>
						<TableCell className="text-xs">{line.location ?? "—"}</TableCell>
						<TableCell className="text-xs">{line.expiryDate ?? "—"}</TableCell>
						<TableCell className="text-right tabular-nums">
							{NUM.format(line.counted)} {line.measureUnit ?? ""}
							{line.entries > 1 && <span className="ml-1 text-xs text-muted-foreground">({line.entries} lanç.)</span>}
						</TableCell>
						<CountLineRevealCells line={line} reveal={sheet.reveal} />
						<CountLineEntryCell
							line={line}
							open={open}
							busy={busy}
							quantity={quantities[line.key] ?? ""}
							onQuantityChange={(value) => onQuantityChange(line.key, value)}
							onPost={() => onPost(line)}
						/>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}

function CountLineItemCell({ line }: { line: CountLine }) {
	return (
		<TableCell>
			{line.description}
			{line.found && (
				<Badge variant="outline" className="ml-2">
					achado
				</Badge>
			)}
			{line.ownRound && line.entries === 0 && (
				<Badge variant="outline" className="ml-2 text-muted-foreground">
					{line.notCountedAccepted ? "aceito como não contado" : "não contado"}
				</Badge>
			)}
			{!line.ownRound && (
				<Badge variant="outline" className="ml-2 text-muted-foreground">
					rodada anterior
				</Badge>
			)}
		</TableCell>
	)
}

/** Esperado e diferença: só quando o servidor mandou o saldo. */
function CountLineRevealCells({ line, reveal }: { line: CountLine; reveal: boolean }) {
	return (
		<>
			{reveal && <TableCell className="text-right tabular-nums">{line.ledger == null ? "—" : NUM.format(line.ledger)}</TableCell>}
			{reveal && (
				<TableCell className={`text-right tabular-nums ${line.needsRecount ? "text-warning" : ""}`}>
					{line.difference == null ? "—" : NUM.format(line.difference)}
				</TableCell>
			)}
		</>
	)
}

/** Campo de lançamento: só na coleta, e só nas linhas desta rodada. */
function CountLineEntryCell({
	line,
	open,
	busy,
	quantity,
	onQuantityChange,
	onPost,
}: {
	line: CountLine
	open: boolean
	busy: boolean
	quantity: string
	onQuantityChange: (value: string) => void
	onPost: () => void
}) {
	return (
		<>
			{open && !line.ownRound && <TableCell />}
			{open && line.ownRound && (
				<TableCell>
					<div className="flex items-center gap-1">
						<Input
							className="h-8 w-24"
							inputMode="decimal"
							placeholder="qtd"
							data-count-qty={line.key}
							value={quantity}
							onChange={(event) => onQuantityChange(event.target.value)}
						/>
						<Button type="button" size="sm" variant="outline" disabled={busy} onClick={onPost}>
							Lançar
						</Button>
					</div>
				</TableCell>
			)}
		</>
	)
}

/** Ações da folha: encerrar a coleta, recontar divergentes, aprovar e rejeitar. */
export function CountActions({
	open,
	inReview,
	divergentCount,
	busy,
	onReview,
	onRecount,
	onApprove,
	onReject,
}: {
	open: boolean
	inReview: boolean
	divergentCount: number
	busy: boolean
	onReview: () => void
	onRecount: () => void
	onApprove: () => void
	onReject: () => void
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{open && (
				<Button type="button" disabled={busy} onClick={onReview}>
					Encerrar a coleta
				</Button>
			)}
			{inReview && divergentCount > 0 && (
				<Button type="button" variant="secondary" disabled={busy} onClick={onRecount}>
					<Search className="mr-2 size-4" />
					Recontar as {divergentCount} divergentes
				</Button>
			)}
			{inReview && (
				<Button type="button" disabled={busy} onClick={onApprove}>
					Aprovar e lançar o ajuste
				</Button>
			)}
			{(open || inReview) && (
				<Button type="button" variant="ghost" disabled={busy} onClick={onReject}>
					Rejeitar
				</Button>
			)}
		</div>
	)
}

/** Itens do escopo sem lançamento, que não viram zero sozinhos. */
export function NotCountedPanel({ sheet, busy, onToggle }: { sheet: CountSheet; busy: boolean; onToggle: (line: CountLine) => void }) {
	return (
		<div className="rounded-xl border border-dashed p-3 text-sm">
			<p className="mb-2">
				{sheet.notCounted} item(ns) do escopo sem nenhum lançamento. Eles <strong>não</strong> viram zero sozinhos — tratar esquecimento como baixa de estoque é
				como um inventário inventa perda.
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
							onClick={() => onToggle(line)}
						>
							{line.description}
						</Button>
					))}
			</div>
		</div>
	)
}

/** Histórico de inventários da cozinha, com a segregação de quem aprovou. */
export function CountsHistoryCard({ list }: { list: Awaited<ReturnType<typeof listInventoryCountsFn>> }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle>Inventários da cozinha</CardTitle>
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
						{list.counts.map((count: CountListRow) => (
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
						))}
					</TableBody>
				</Table>
				{list.total > list.counts.length && (
					<p className="mt-2 text-xs text-muted-foreground">
						Mostrando {list.counts.length} de {list.total}.
					</p>
				)}
			</CardContent>
		</Card>
	)
}
