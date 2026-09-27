import {
	DELIVERY_CYCLE_LABELS,
	type DeliveryCycle,
	isDeliveryCycle,
	JUSTIFICATION_INCREASE_PERCENT,
	MIN_ORDER_SHARE_PERCENT,
	QUANTITY_LIMIT_WARNING_LABELS,
	type QuantityLimitWarning,
	TIGHT_INCREASE_PERCENT,
} from "@iefa/sisub-domain"
import { AlertTriangle, Lock, Scale, ShieldAlert } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { annexMaxValue, type QuantityEstimateAnnexRow, type QuantityEstimateAnnexSettings } from "@/lib/quantity-estimate-annex"

export interface QuantityEstimateItemLimitsPatch {
	maxIncreasePercent?: number | null
	deliveryCycle?: DeliveryCycle
	minOrderQuantity?: number | null
}

export interface QuantityEstimateLimitSettingsPatch {
	maxIncreasePercent?: number
	maxQuantityJustification?: string | null
	minQuotePercent?: number
}

interface QuantityEstimateLimitsSectionProps {
	rows: QuantityEstimateAnnexRow[]
	settings: QuantityEstimateAnnexSettings
	/** Rascunho: acréscimo, justificativa e escolhas por item editáveis. Concluído: números congelados. */
	editable: boolean
	onSettingsChange?: (patch: QuantityEstimateLimitSettingsPatch) => void
	onItemChange?: (quantityEstimateItemId: string, patch: QuantityEstimateItemLimitsPatch) => void
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })
const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

/** A folga colada ganha marcador próprio junto da máxima; os avisos de mínimo e de acréscimo alto ficam na coluna de avisos. */
const ROW_WARNINGS: readonly QuantityLimitWarning[] = [
	"increase_requires_justification",
	"min_exceeds_max",
	"min_exceeds_cycle_consumption",
	"min_exhausts_before_validity",
]

/**
 * Campo numérico que só grava ao sair (blur/Enter). Vazio = volta a herdar (null); o
 * placeholder mostra o valor herdado, para a pessoa ver o que vale sem escolher nada.
 */
function CommitNumberInput({
	id,
	value,
	placeholder,
	min,
	max,
	step = 1,
	integer = true,
	allowEmpty = true,
	label,
	onCommit,
	className,
}: {
	id?: string
	value: number | null
	placeholder?: string
	min: number
	max?: number
	step?: number
	integer?: boolean
	allowEmpty?: boolean
	label: string
	onCommit: (value: number | null) => void
	className?: string
}) {
	const [draft, setDraft] = useState(value == null ? "" : String(value))
	useEffect(() => setDraft(value == null ? "" : String(value)), [value])

	const commit = () => {
		const trimmed = draft.trim().replace(",", ".")
		if (trimmed === "") {
			if (allowEmpty && value != null) onCommit(null)
			else setDraft(value == null ? "" : String(value))
			return
		}
		const parsed = Number(trimmed)
		const valid = Number.isFinite(parsed) && parsed >= min && (max == null || parsed <= max) && (!integer || Number.isInteger(parsed))
		if (!valid) {
			setDraft(value == null ? "" : String(value))
			return
		}
		if (parsed !== value) onCommit(parsed)
	}

	return (
		<Input
			id={id}
			type="number"
			inputMode={integer ? "numeric" : "decimal"}
			aria-label={label}
			min={min}
			max={max}
			step={step}
			value={draft}
			placeholder={placeholder}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur()
			}}
			className={className ?? "h-7 w-20 text-right tabular-nums"}
		/>
	)
}

/** Justificativa única do anexo: grava ao sair do campo. */
function JustificationField({ value, required, onCommit }: { value: string | null; required: boolean; onCommit: (value: string | null) => void }) {
	const [draft, setDraft] = useState(value ?? "")
	useEffect(() => setDraft(value ?? ""), [value])
	const missing = required && !draft.trim()

	return (
		<Field>
			<FieldLabel htmlFor="quantity-estimate-max-quantity-justification">Justificativa da quantidade máxima{required ? " *" : ""}</FieldLabel>
			<Textarea
				id="quantity-estimate-max-quantity-justification"
				value={draft}
				rows={3}
				aria-invalid={missing || undefined}
				placeholder="Ex.: histórico de falha de entrega de proteína na região; câmara fria sem redundância; efetivo sujeito a reforço em exercício."
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => {
					const next = draft.trim() || null
					if (next !== (value?.trim() || null)) onCommit(next)
				}}
			/>
			<FieldDescription>
				Uma justificativa para o anexo inteiro, cobrindo todos os itens com acréscimo acima de {JUSTIFICATION_INCREASE_PERCENT}%. Exigida para concluir.
			</FieldDescription>
		</Field>
	)
}

function WarningMarker({ warnings }: { warnings: QuantityLimitWarning[] }) {
	if (warnings.length === 0) return null
	return (
		<Tooltip>
			<TooltipTrigger className="flex size-6 items-center justify-center text-warning" aria-label={`${warnings.length} aviso(s) no item`}>
				<AlertTriangle className="size-4" aria-hidden="true" />
			</TooltipTrigger>
			<TooltipContent>
				<ul className="space-y-1">
					{warnings.map((w) => (
						<li key={w}>{QUANTITY_LIMIT_WARNING_LABELS[w]}</li>
					))}
				</ul>
			</TooltipContent>
		</Tooltip>
	)
}

/** Flag discreta de folga colada, ao lado da máxima: risco só em anormalidade, não erro. */
function TightIncreaseFlag({ effectiveIncreasePercent }: { effectiveIncreasePercent: number | null }) {
	return (
		<Tooltip>
			<TooltipTrigger
				className="inline-flex items-center gap-0.5 text-xs text-warning"
				aria-label={`Folga de ${effectiveIncreasePercent != null ? QTY.format(effectiveIncreasePercent) : 0}% sobre o previsto`}
			>
				<ShieldAlert className="size-3.5" aria-hidden="true" />
				{effectiveIncreasePercent != null ? `${INT.format(effectiveIncreasePercent)}%` : ""}
			</TooltipTrigger>
			<TooltipContent>{QUANTITY_LIMIT_WARNING_LABELS.increase_tight}</TooltipContent>
		</Tooltip>
	)
}

export function QuantityEstimateLimitsSection({ rows, settings, editable, onSettingsChange, onItemChange }: QuantityEstimateLimitsSectionProps) {
	const grouped = new Map<string, QuantityEstimateAnnexRow[]>()
	for (const row of rows) {
		const bucket = grouped.get(row.folder)
		if (bucket) bucket.push(row)
		else grouped.set(row.folder, [row])
	}
	const tightCount = rows.filter((r) => r.warnings.includes("increase_tight")).length
	const reviewCount = rows.filter((r) => r.warnings.some((w) => w !== "increase_tight" && w !== "increase_requires_justification")).length
	const justificationRequired = rows.some((r) => r.warnings.includes("increase_requires_justification"))
	const justificationMissing = justificationRequired && !settings.maxQuantityJustification?.trim()
	const hasFrozenLimits = rows.some((r) => r.maxQuantity != null)
	const maxValue = annexMaxValue(rows)
	const canEditItem = editable && onItemChange != null

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Scale className="size-5" aria-hidden="true" />
					Limites de quantidade
				</CardTitle>
				<CardDescription>
					A quantidade <strong>máxima</strong> é o que a futura ata de registro de preços registra para a vigência (Lei 14.133/2021, art. 82, I): a quantidade
					estimada na produção mais o acréscimo. A <strong>mínima por ordem de fornecimento</strong> é a menor quantidade de cada ordem — sugerida em{" "}
					{MIN_ORDER_SHARE_PERCENT}% do consumo entre duas entregas (semanal ou mensal).
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{editable ? (
					<FieldGroup className="grid gap-4 lg:grid-cols-[16rem_16rem_1fr]">
						<Field>
							<FieldLabel htmlFor="quantity-estimate-max-increase">Acréscimo sobre a estimada (%)</FieldLabel>
							<CommitNumberInput
								id="quantity-estimate-max-increase"
								label="Acréscimo sobre a estimada (%)"
								value={settings.maxIncreasePercent}
								min={0}
								max={100}
								allowEmpty={false}
								onCommit={(v) => v != null && onSettingsChange?.({ maxIncreasePercent: v })}
								className="w-28 tabular-nums"
							/>
							<FieldDescription>
								Vale para todo item sem acréscimo próprio. A ata de registro de preços não admite acréscimo depois (Decreto 11.462/2023, art. 23).
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="quantity-estimate-min-quote">Mínima a ser cotada (% da máxima)</FieldLabel>
							<CommitNumberInput
								id="quantity-estimate-min-quote"
								label="Quantidade mínima a ser cotada (% da máxima)"
								value={settings.minQuotePercent}
								min={1}
								max={100}
								allowEmpty={false}
								onCommit={(v) => v != null && onSettingsChange?.({ minQuotePercent: v })}
								className="w-28"
							/>
							<FieldDescription>
								Quanto o licitante precisa cotar, no mínimo (Lei 14.133/2021, art. 82, II). 100% = a máxima inteira; menos admite proposta parcial.
							</FieldDescription>
						</Field>
						{(justificationRequired || settings.maxQuantityJustification) && (
							<JustificationField
								value={settings.maxQuantityJustification}
								required={justificationRequired}
								onCommit={(v) => onSettingsChange?.({ maxQuantityJustification: v })}
							/>
						)}
					</FieldGroup>
				) : (
					<div className="space-y-2">
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<Lock className="size-4 shrink-0" aria-hidden="true" />
							{hasFrozenLimits
								? "Números congelados na conclusão."
								: "Este anexo foi concluído antes dos limites de quantidade existirem: não há máxima nem mínima registradas."}
						</p>
						{settings.maxQuantityJustification && (
							<div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
								<p className="text-subheading">Justificativa da quantidade máxima</p>
								<p className="whitespace-pre-wrap text-muted-foreground">{settings.maxQuantityJustification}</p>
							</div>
						)}
					</div>
				)}

				{(tightCount > 0 || reviewCount > 0 || justificationMissing) && (
					<ul className="space-y-1.5 text-sm">
						{tightCount > 0 && (
							<li className="flex items-start gap-2 text-warning">
								<ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>
									{tightCount} {tightCount === 1 ? "item com folga" : "itens com folga"} abaixo de {TIGHT_INCREASE_PERCENT}% sobre o previsto: pode faltar numa
									situação anormal (perda de estoque, fornecedor de outro item que para de entregar).
								</span>
							</li>
						)}
						{justificationMissing && editable && (
							<li className="flex items-start gap-2 text-warning">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>Há itens com acréscimo acima de {JUSTIFICATION_INCREASE_PERCENT}%: preencha a justificativa da quantidade máxima para concluir.</span>
							</li>
						)}
						{reviewCount > 0 && (
							<li className="flex items-start gap-2 text-warning">
								<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>
									{reviewCount} {reviewCount === 1 ? "item tem" : "itens têm"} mínimo por pedido fora do fluxo de entregas — passe o mouse no alerta da linha.
								</span>
							</li>
						)}
					</ul>
				)}

				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Item</TableHead>
								<TableHead className="text-right">Estimada</TableHead>
								<TableHead className="text-right">Acréscimo %</TableHead>
								<TableHead className="text-right">Máxima</TableHead>
								<TableHead className="text-right">Mín. cotada</TableHead>
								<TableHead>Entrega</TableHead>
								<TableHead className="text-right">Mín. por OF</TableHead>
								<TableHead className="w-8">
									<span className="sr-only">Avisos</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...grouped.entries()].map(([folder, folderRows]) => (
								<Fragment key={folder}>
									<TableRow className="bg-muted/40 hover:bg-muted/40">
										<TableCell colSpan={7} className="py-1.5 text-xs font-medium text-muted-foreground">
											{folder}
										</TableCell>
									</TableRow>
									{folderRows.map((row) => {
										const itemEditable = canEditItem && row.quantityEstimateItemId != null && row.choices != null
										const isTight = row.warnings.includes("increase_tight")
										const cycleDiffersFromIngredient =
											row.ingredientDeliveryCycle != null && row.deliveryCycle != null && row.deliveryCycle !== row.ingredientDeliveryCycle
										return (
											<TableRow key={row.key}>
												<TableCell className="max-w-72">
													<p className="truncate text-sm" title={row.description}>
														{row.description}
													</p>
													<p className="text-xs text-muted-foreground">
														{row.catmat ? `CATMAT ${row.catmat} · ` : ""}
														{row.unit}
													</p>
												</TableCell>
												<TableCell className="text-right tabular-nums text-muted-foreground">{QTY.format(row.estimatedQuantity)}</TableCell>
												<TableCell className="text-right">
													{itemEditable ? (
														<CommitNumberInput
															label={`Acréscimo de ${row.description}`}
															value={row.choices?.maxIncreasePercent ?? null}
															placeholder={String(settings.maxIncreasePercent)}
															min={0}
															max={100}
															onCommit={(v) => onItemChange?.(row.quantityEstimateItemId as string, { maxIncreasePercent: v })}
														/>
													) : (
														<span className="tabular-nums">{row.increasePercent ?? "—"}</span>
													)}
												</TableCell>
												<TableCell className="text-right">
													<div className="flex flex-col items-end gap-0.5">
														<span className="font-medium tabular-nums">{row.maxQuantity != null ? INT.format(row.maxQuantity) : "—"}</span>
														{isTight && <TightIncreaseFlag effectiveIncreasePercent={row.effectiveIncreasePercent} />}
													</div>
												</TableCell>
												<TableCell className="text-right tabular-nums">{row.minQuoteQuantity != null ? INT.format(row.minQuoteQuantity) : "—"}</TableCell>
												<TableCell>
													{itemEditable && row.deliveryCycle ? (
														<div className="flex flex-col gap-0.5">
															<ToggleGroup
																value={[row.deliveryCycle]}
																// Base UI devolve array mesmo em seleção única; desmarcar mantém o ciclo — item de anexo sempre tem um.
																onValueChange={(value) => {
																	const next = value[0]
																	if (isDeliveryCycle(next) && next !== row.deliveryCycle)
																		onItemChange?.(row.quantityEstimateItemId as string, { deliveryCycle: next })
																}}
																variant="outline"
																size="sm"
																aria-label={`Ciclo de entrega de ${row.description}`}
															>
																<ToggleGroupItem value="weekly">{DELIVERY_CYCLE_LABELS.weekly}</ToggleGroupItem>
																<ToggleGroupItem value="monthly">{DELIVERY_CYCLE_LABELS.monthly}</ToggleGroupItem>
															</ToggleGroup>
															{cycleDiffersFromIngredient && row.ingredientDeliveryCycle && (
																<span className="text-xs text-muted-foreground">
																	insumo: {DELIVERY_CYCLE_LABELS[row.ingredientDeliveryCycle].toLowerCase()}
																</span>
															)}
														</div>
													) : (
														<span className="text-sm">{row.deliveryCycle ? DELIVERY_CYCLE_LABELS[row.deliveryCycle] : "—"}</span>
													)}
												</TableCell>
												<TableCell className="text-right">
													{itemEditable ? (
														<div className="flex flex-col items-end gap-0.5">
															<CommitNumberInput
																label={`Mínimo por pedido de ${row.description}`}
																value={row.choices?.minOrderQuantity ?? null}
																placeholder={row.suggestedMinOrderQuantity != null ? String(row.suggestedMinOrderQuantity) : undefined}
																min={0.0001}
																step={1}
																integer={false}
																onCommit={(v) => onItemChange?.(row.quantityEstimateItemId as string, { minOrderQuantity: v })}
																className="h-7 w-24 text-right tabular-nums"
															/>
															{row.cycleConsumption != null && row.deliveriesInValidity != null && (
																<span className="text-xs text-muted-foreground" title={`${row.deliveriesInValidity} entregas na vigência`}>
																	consumo/entrega ≈ {QTY.format(row.cycleConsumption)}
																</span>
															)}
														</div>
													) : (
														<span className="tabular-nums">{row.minOrderQuantity != null ? QTY.format(row.minOrderQuantity) : "—"}</span>
													)}
												</TableCell>
												<TableCell className="p-1">
													<WarningMarker warnings={row.warnings.filter((w) => ROW_WARNINGS.includes(w))} />
												</TableCell>
											</TableRow>
										)
									})}
								</Fragment>
							))}
						</TableBody>
					</Table>
				</div>

				{maxValue > 0 && (
					<div className="flex justify-end">
						<div className="rounded-md border bg-muted/50 px-6 py-3 text-right">
							<p className="text-sm text-muted-foreground">Valor máximo estimado da contratação</p>
							<p className="text-display tabular-nums">{BRL.format(maxValue)}</p>
							<p className="text-xs text-muted-foreground">sobre a quantidade máxima × preço estimado</p>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
