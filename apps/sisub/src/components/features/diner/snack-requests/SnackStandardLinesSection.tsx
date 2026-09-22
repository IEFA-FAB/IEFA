import type { SnackAudience, SnackEntitlement, SnackStandardSnapshot } from "@iefa/sisub-domain/utils"
import { kcalRangeFor } from "@iefa/sisub-domain/utils"
import { Plus, RotateCcw, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemHeader } from "@/components/ui/item"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { audienceLabel, classLabel, divergenceLabel, formatKcal, PREFERENCE_LABELS } from "./snack-format"
import { type FormLine, standardMatchesLine } from "./snack-request-form"

interface SnackStandardLinesSectionProps {
	missionKind: string
	entitlement: SnackEntitlement | null
	/** Padrões da cozinha que servem à missão (família + equipamento). */
	standards: SnackStandardSnapshot[]
	standardsById: Map<string, SnackStandardSnapshot>
	standardsLoading: boolean
	standardsError: Error | null
	kitchenChosen: boolean
	lines: FormLine[]
	followsSuggestion: boolean
	onLinesChange: (lines: FormLine[]) => void
	onResetLines: () => void
	divergences: string[]
	divergenceReason: string
	onDivergenceReasonChange: (value: string) => void
	errors: { lines?: string; divergenceReason?: string }
}

/** Bloco 3 — padrões pedíveis da cozinha, pré-preenchidos pela sugestão e editáveis. */
export function SnackStandardLinesSection(props: SnackStandardLinesSectionProps) {
	const { missionKind, entitlement, standards, standardsById, lines, onLinesChange, divergences, errors } = props

	const updateLine = (key: string, patch: Partial<FormLine>) => onLinesChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)))
	const removeLine = (key: string) => onLinesChange(lines.filter((line) => line.key !== key))
	const addLine = () => onLinesChange([...lines, { key: crypto.randomUUID(), standardId: null, audience: "crew", quantity: "" }])

	const uncovered = entitlement ? entitlement.lines.filter((line) => !standards.some((s) => standardMatchesLine(s, line))) : []

	return (
		<Card>
			<CardHeader>
				<CardTitle>3. Padrões de lanche</CardTitle>
				<CardDescription>Kits que a cozinha apoiadora publicou para este tipo de missão. As quantidades vêm da sugestão; ajuste se precisar.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!props.kitchenChosen ? (
					<p className="text-body text-muted-foreground">Escolha a cozinha apoiadora para ver os padrões.</p>
				) : props.standardsLoading ? (
					<div className="space-y-2" aria-hidden>
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-20 w-full" />
					</div>
				) : props.standardsError ? (
					<Alert variant="destructive">
						<AlertTitle>Não foi possível carregar os padrões da cozinha</AlertTitle>
						<AlertDescription>{props.standardsError.message}</AlertDescription>
					</Alert>
				) : standards.length === 0 ? (
					<p className="text-body text-muted-foreground">
						Esta cozinha não publicou padrão de {missionKind === "aerea" ? "Lanche de Bordo" : "Lanche de Apoio"} compatível com a missão
						{missionKind === "aerea" ? " (confira copa e forno)" : ""}. Escolha outra cozinha ou fale com a Seção de Subsistência.
					</p>
				) : (
					<>
						{uncovered.length > 0 && (
							<Alert>
								<AlertTitle>Sugestão sem padrão compatível</AlertTitle>
								<AlertDescription>
									A cozinha não publicou padrão para: {[...new Set(uncovered.map((line) => classLabel(line.family, line.snackClass)))].join(", ")}. Essas linhas
									não foram pré-preenchidas.
								</AlertDescription>
							</Alert>
						)}

						{lines.length === 0 ? (
							<p className="text-body text-muted-foreground">Nenhum padrão no pedido.</p>
						) : (
							<ItemGroup className="gap-2">
								{lines.map((line) => (
									<LineRow
										key={line.key}
										line={line}
										missionKind={missionKind}
										standards={standards}
										standard={line.standardId ? standardsById.get(line.standardId) : undefined}
										effectiveMinutes={entitlement?.effectiveMinutes ?? 0}
										onChange={(patch) => updateLine(line.key, patch)}
										onRemove={() => removeLine(line.key)}
									/>
								))}
							</ItemGroup>
						)}
						{errors.lines && <FieldError>{errors.lines}</FieldError>}

						<div className="flex flex-wrap gap-2">
							<Button variant="outline" size="sm" onClick={addLine}>
								<Plus className="size-4" aria-hidden />
								Adicionar padrão
							</Button>
							{!props.followsSuggestion && entitlement && (
								<Button variant="ghost" size="sm" onClick={props.onResetLines}>
									<RotateCcw className="size-3.5" aria-hidden />
									Refazer pela sugestão
								</Button>
							)}
						</div>
					</>
				)}

				{divergences.length > 0 && (
					<Field data-invalid={!!errors.divergenceReason}>
						<Alert>
							<AlertTitle>O pedido difere da sugestão da calculadora</AlertTitle>
							<AlertDescription>
								Classe não sugerida ou quantidade acima da sugerida em: {divergences.map((key) => divergenceLabel(key, missionKind)).join("; ")}.
							</AlertDescription>
						</Alert>
						<FieldLabel htmlFor="snack-divergence-reason">Justificativa da diferença</FieldLabel>
						<Textarea
							id="snack-divergence-reason"
							value={props.divergenceReason}
							onChange={(e) => props.onDivergenceReasonChange(e.target.value)}
							maxLength={500}
							aria-invalid={!!errors.divergenceReason}
						/>
						<FieldDescription>A cozinha vê a sugestão e o pedido lado a lado antes de aceitar.</FieldDescription>
						<FieldError>{errors.divergenceReason}</FieldError>
					</Field>
				)}
			</CardContent>
		</Card>
	)
}

interface LineRowProps {
	line: FormLine
	missionKind: string
	standards: SnackStandardSnapshot[]
	standard: SnackStandardSnapshot | undefined
	effectiveMinutes: number
	onChange: (patch: Partial<FormLine>) => void
	onRemove: () => void
}

function LineRow({ line, missionKind, standards, standard, effectiveMinutes, onChange, onRemove }: LineRowProps) {
	const range = standard ? kcalRangeFor(standard.family, standard.snackClass, effectiveMinutes) : null
	const outOfRange =
		standard && range && standard.kcalPerKit != null && standard.kcalComplete && (standard.kcalPerKit < range.min || standard.kcalPerKit > range.max)
	const audiences: SnackAudience[] = ["crew", "pax"]

	return (
		<Item variant="outline" size="sm">
			<ItemHeader className="grid gap-3 sm:grid-cols-[1fr_10rem_7rem_auto] sm:items-end">
				<Field>
					<FieldLabel htmlFor={`${line.key}-standard`}>Padrão</FieldLabel>
					<Select value={line.standardId ?? null} onValueChange={(v) => onChange({ standardId: v ?? null })}>
						<SelectTrigger id={`${line.key}-standard`} className="w-full">
							<SelectValue>{standard ? standard.name : "Escolha o padrão"}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{standards.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									<span className="flex min-w-0 flex-col">
										<span className="truncate">{s.name}</span>
										<span className="truncate text-caption text-muted-foreground">
											Classe {s.snackClass} · {PREFERENCE_LABELS[s.variant]}
										</span>
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor={`${line.key}-audience`}>Público</FieldLabel>
					<Select value={line.audience} onValueChange={(v) => v && onChange({ audience: v as SnackAudience })}>
						<SelectTrigger id={`${line.key}-audience`} className="w-full">
							<SelectValue>{audienceLabel(line.audience, missionKind)}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{audiences.map((a) => (
								<SelectItem key={a} value={a}>
									{audienceLabel(a, missionKind)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field>
					<FieldLabel htmlFor={`${line.key}-qty`}>Kits</FieldLabel>
					<Input
						id={`${line.key}-qty`}
						type="number"
						inputMode="numeric"
						min={1}
						max={9999}
						value={line.quantity}
						onChange={(e) => onChange({ quantity: e.target.value })}
					/>
				</Field>
				<Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remover padrão">
					<Trash2 className="size-4" aria-hidden />
				</Button>
			</ItemHeader>
			{standard && range && (
				<ItemFooter>
					<ItemContent>
						<ItemDescription className="text-xs">
							{classLabel(standard.family, standard.snackClass)} · {formatKcal(standard.kcalPerKit, standard.kcalComplete)} por kit · faixa da classe{" "}
							{range.min.toLocaleString("pt-BR")}–{range.max.toLocaleString("pt-BR")} kcal
							{standard.items.length > 0 && ` · ${standard.items.map((item) => item.recipeName).join(", ")}`}
						</ItemDescription>
					</ItemContent>
					{outOfRange && <Badge variant="warning">Fora da faixa</Badge>}
					{!standard.kcalComplete && <Badge variant="outline">Energia parcial</Badge>}
				</ItemFooter>
			)}
		</Item>
	)
}
