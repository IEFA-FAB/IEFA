import type { SnackEntitlement } from "@iefa/sisub-domain/utils"
import { formatDuration, MEAL_WINDOWS, MIN_LEAD_TIME_HOURS } from "@iefa/sisub-domain/utils"
import { Calculator, Clock } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Textarea } from "@/components/ui/textarea"
import { audienceLabel, classLabel } from "./snack-format"

interface SnackEntitlementPanelProps {
	entitlement: SnackEntitlement | null
	missionKind: string
	/** Horas até a retirada ou a partida (o que vier antes); nulo sem datas. */
	leadHours: number | null
	lateReason: string
	onLateReasonChange: (value: string) => void
	lateReasonError?: string
}

/** Bloco 2 — a calculadora do Módulo 7 rodando ao vivo sobre os dados da missão. */
export function SnackEntitlementPanel({ entitlement, missionKind, leadHours, lateReason, onLateReasonChange, lateReasonError }: SnackEntitlementPanelProps) {
	const late = leadHours != null && leadHours < MIN_LEAD_TIME_HOURS

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Calculator className="size-4 text-muted-foreground" aria-hidden />
					2. Calculadora
				</CardTitle>
				<CardDescription>Sugestão da dotação pela norma. É sugestão, não trava: pedir diferente exige justificativa, e a cozinha decide.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{!entitlement ? (
					<p className="text-body text-muted-foreground">Informe a data e a hora da partida e a duração da missão para ver a sugestão.</p>
				) : (
					<>
						<dl className="grid grid-cols-2 gap-3">
							<Stat label="Duração considerada" value={formatDuration(entitlement.effectiveMinutes)} />
							{entitlement.involvementMinutes != null && <Stat label="Envolvimento da tripulação" value={formatDuration(entitlement.involvementMinutes)} />}
							<Stat
								label="Refeições cobertas"
								value={entitlement.mealWindowsCovered.length > 0 ? entitlement.mealWindowsCovered.map((key) => MEAL_WINDOWS[key].label).join(", ") : "nenhuma"}
							/>
						</dl>

						{entitlement.lines.length === 0 ? (
							<p className="text-body text-muted-foreground">Para esta missão a norma não prevê lanche.</p>
						) : (
							<ItemGroup className="gap-2">
								{entitlement.lines.map((line, index) => (
									<Item key={`${line.ruleId}-${line.snackClass}-${line.audience}-${index}`} variant="muted" size="sm">
										<ItemContent>
											<ItemTitle>
												{classLabel(line.family, line.snackClass)}
												<Badge variant="outline">
													{audienceLabel(line.audience, missionKind)}: {line.quantity}
												</Badge>
												{line.optional && <Badge variant="warning">Opcional</Badge>}
											</ItemTitle>
											<ItemDescription className="text-xs">
												{line.kcal.min.toLocaleString("pt-BR")}–{line.kcal.max.toLocaleString("pt-BR")} kcal
												{line.variants.length === 1 && line.variants[0] === "lanche" ? " · só lanche" : ""}. {line.reason}
											</ItemDescription>
											<ItemDescription className="text-xs">Norma: {line.normRef}</ItemDescription>
										</ItemContent>
									</Item>
								))}
							</ItemGroup>
						)}

						{entitlement.notes.length > 0 && (
							<ul className="space-y-1.5">
								{entitlement.notes.map((note) => (
									<li key={note.ruleId} className="text-caption text-muted-foreground">
										{note.text} <span className="text-hint">({note.normRef})</span>
									</li>
								))}
							</ul>
						)}
					</>
				)}

				{late && (
					<Alert>
						<Clock aria-hidden />
						<AlertTitle>Menos de {MIN_LEAD_TIME_HOURS} h de antecedência</AlertTitle>
						<AlertDescription>
							Faltam {Math.max(0, Math.floor(leadHours ?? 0))} h até a retirada ou a partida. A norma pede o pedido com {MIN_LEAD_TIME_HOURS} h de antecedência;
							fora do prazo a cozinha pode não conseguir atender, e o pedido chega marcado.
						</AlertDescription>
					</Alert>
				)}
				{late && (
					<Field data-invalid={!!lateReasonError}>
						<FieldLabel htmlFor="snack-late-reason">Justificativa do prazo</FieldLabel>
						<Textarea
							id="snack-late-reason"
							value={lateReason}
							onChange={(e) => onLateReasonChange(e.target.value)}
							maxLength={500}
							aria-invalid={!!lateReasonError}
							placeholder="Ex.: missão acionada no mesmo dia"
						/>
						<FieldDescription>Obrigatória para pedido fora do prazo.</FieldDescription>
						<FieldError>{lateReasonError}</FieldError>
					</Field>
				)}
			</CardContent>
		</Card>
	)
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-label text-foreground">{label}</dt>
			<dd className="text-body">{value}</dd>
		</div>
	)
}
