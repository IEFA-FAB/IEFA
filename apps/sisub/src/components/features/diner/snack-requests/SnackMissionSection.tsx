import type { SnackOrderingContext } from "@iefa/sisub-domain"
import { RotateCcw } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FUNDING_SOURCE_LABELS, isoToBrasiliaLocal, MISSION_KIND_LABELS, PREFERENCE_LABELS } from "./snack-format"
import {
	derivedMaterials,
	type FormErrors,
	type FundingSource,
	type MaterialKey,
	materialValues,
	peopleCount,
	pickupIso,
	type SnackRequestFormState,
} from "./snack-request-form"

interface SnackMissionSectionProps {
	state: SnackRequestFormState
	update: (patch: Partial<SnackRequestFormState>) => void
	errors: FormErrors
	kitchens: SnackOrderingContext["kitchens"]
	/** A calculadora permite refeição (marmita) para esta missão. */
	refeicaoOk: boolean
}

const MATERIAL_FIELDS: { key: MaterialKey; label: string; unit: string }[] = [
	{ key: "water", label: "Água", unit: "garrafas" },
	{ key: "cups", label: "Copos", unit: "unidades" },
	{ key: "ice", label: "Gelo", unit: "sacos" },
	{ key: "coffee", label: "Café", unit: "garrafas térmicas" },
]

export function SnackMissionSection({ state, update, errors, kitchens, refeicaoOk }: SnackMissionSectionProps) {
	const aerial = state.missionKind === "aerea"
	const kitchen = kitchens.find((k) => k.id === state.kitchenId)
	const materials = materialValues(state)
	const derived = derivedMaterials(peopleCount(state))
	const hasMaterialOverride = Object.keys(state.materialOverrides).length > 0
	const defaultPickup = pickupIso(state)

	return (
		<Card>
			<CardHeader>
				<CardTitle>1. Missão</CardTitle>
				<CardDescription>Os campos da requisição do Anexo E. A calculadora ao lado usa estes dados para sugerir a classe devida.</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<Grid>
						<Field data-invalid={!!errors.kitchenId}>
							<FieldLabel htmlFor="snack-kitchen">Cozinha apoiadora</FieldLabel>
							<Select
								value={state.kitchenId == null ? null : String(state.kitchenId)}
								onValueChange={(v) => update({ kitchenId: v ? Number(v) : null, lines: null })}
							>
								<SelectTrigger id="snack-kitchen" className="w-full" aria-invalid={!!errors.kitchenId}>
									<SelectValue>{kitchen ? kitchen.name : "Escolha a cozinha"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{kitchens.map((k) => (
										<SelectItem key={k.id} value={String(k.id)}>
											{k.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>Só aparecem as cozinhas que publicaram padrões de lanche.</FieldDescription>
							<FieldError>{errors.kitchenId}</FieldError>
						</Field>
						<Field>
							<FieldLabel htmlFor="snack-kind">Tipo de missão</FieldLabel>
							<Select value={state.missionKind} onValueChange={(v) => v && update({ missionKind: v as SnackRequestFormState["missionKind"], lines: null })}>
								<SelectTrigger id="snack-kind" className="w-full">
									<SelectValue>{MISSION_KIND_LABELS[state.missionKind]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="aerea">Aérea — Lanche de Bordo</SelectItem>
									<SelectItem value="terrestre">Terrestre — Lanche de Apoio</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					</Grid>

					<Grid>
						<TextField
							id="snack-unit"
							label="Setor requisitante"
							value={state.requesterUnitLabel}
							onChange={(v) => update({ requesterUnitLabel: v })}
							error={errors.requesterUnitLabel}
							maxLength={120}
						/>
						<TextField
							id="snack-order"
							label={aerial ? "Nº da ordem de missão" : "Nº da ordem de missão (se houver)"}
							value={state.missionOrderNumber}
							onChange={(v) => update({ missionOrderNumber: v })}
							error={errors.missionOrderNumber}
							maxLength={60}
						/>
					</Grid>

					<FieldSet>
						<FieldLegend variant="label">{aerial ? "Aeronave" : "Viatura"}</FieldLegend>
						<div className="grid gap-4 sm:grid-cols-3">
							<TextField
								id="snack-vehicle-type"
								label="Tipo"
								value={state.vehicleType}
								onChange={(v) => update({ vehicleType: v })}
								placeholder={aerial ? "Ex.: C-105" : "Ex.: micro-ônibus"}
								maxLength={80}
							/>
							<TextField
								id="snack-vehicle-reg"
								label="Matrícula"
								value={state.vehicleRegistration}
								onChange={(v) => update({ vehicleRegistration: v })}
								maxLength={40}
							/>
							<TextField
								id="snack-vehicle-om"
								label={aerial ? "OM da ANV" : "OM da VTR"}
								value={state.vehicleOm}
								onChange={(v) => update({ vehicleOm: v })}
								maxLength={80}
							/>
						</div>
					</FieldSet>

					<Field data-invalid={!!errors.missionDescription}>
						<FieldLabel htmlFor="snack-description">Missão</FieldLabel>
						<Textarea
							id="snack-description"
							value={state.missionDescription}
							onChange={(e) => update({ missionDescription: e.target.value })}
							maxLength={500}
							aria-invalid={!!errors.missionDescription}
							placeholder="Ex.: transporte de comitiva para Brasília"
						/>
						<FieldError>{errors.missionDescription}</FieldError>
					</Field>

					<Grid>
						<Field data-invalid={!!errors.departureLocal}>
							<FieldLabel htmlFor="snack-departure">{aerial ? "Data e hora da decolagem" : "Data e hora da partida"}</FieldLabel>
							<Input
								id="snack-departure"
								type="datetime-local"
								value={state.departureLocal}
								onChange={(e) => update({ departureLocal: e.target.value })}
								aria-invalid={!!errors.departureLocal}
							/>
							<FieldDescription>Horário de Brasília.</FieldDescription>
							<FieldError>{errors.departureLocal}</FieldError>
						</Field>
						<DurationField
							id="snack-total"
							label={aerial ? "Tempo total de voo" : "Duração total do deslocamento"}
							hours={state.totalHours}
							minutes={state.totalMins}
							onChange={(totalHours, totalMins) => update({ totalHours, totalMins })}
							error={errors.totalDuration}
							description="Da partida ao destino final, somando as escalas."
						/>
					</Grid>

					<div className="grid gap-4 sm:grid-cols-3">
						<TextField id="snack-origin" label="Procedência" value={state.origin} onChange={(v) => update({ origin: v })} maxLength={120} />
						<TextField id="snack-destination" label="Destino" value={state.destination} onChange={(v) => update({ destination: v })} maxLength={120} />
						<TextField
							id="snack-stops"
							label="Escalas"
							value={state.stops}
							onChange={(v) => update({ stops: v })}
							placeholder="Ex.: SBAN, SBGL"
							maxLength={240}
						/>
					</div>

					<SwitchField
						id="snack-stops-without-mess"
						label="Há escala sem apoio de rancho"
						description="Pouso ou parada numa localidade sem rancho: o lanche passa a cobrir o tempo total do deslocamento."
						checked={state.stopsWithoutMess}
						onChange={(stopsWithoutMess) => update({ stopsWithoutMess, ...(stopsWithoutMess ? { hasMessStop: false } : {}) })}
					/>
					{!state.stopsWithoutMess && (
						<SwitchField
							id="snack-mess-stop"
							label="Há escala com apoio de rancho"
							description="Com rancho na escala, a classe é decidida pela maior perna, e não pelo tempo total."
							checked={state.hasMessStop}
							onChange={(hasMessStop) => update({ hasMessStop })}
						/>
					)}
					{!state.stopsWithoutMess && state.hasMessStop && (
						<DurationField
							id="snack-leg"
							label="Maior perna até uma escala com rancho"
							hours={state.legHours}
							minutes={state.legMins}
							onChange={(legHours, legMins) => update({ legHours, legMins })}
							error={errors.legDuration}
						/>
					)}

					{aerial && (
						<>
							<DurationField
								id="snack-ground"
								label="Tempo em solo da tripulação"
								hours={state.groundHours}
								minutes={state.groundMins}
								onChange={(groundHours, groundMins) => update({ groundHours, groundMins })}
								description="Pré-voo, briefing e debriefing. Somado ao voo, forma o envolvimento da tripulação."
							/>
							<Grid>
								<SwitchField
									id="snack-galley"
									label="Aeronave com copa ou minicozinha"
									description="Sem copa, só sanduíche."
									checked={state.hasGalley}
									onChange={(hasGalley) => update({ hasGalley, ...(hasGalley ? {} : { hasOven: false }) })}
								/>
								<SwitchField
									id="snack-oven"
									label="Forno elétrico ou similar"
									description="Exigido para almoço ou jantar a bordo."
									checked={state.hasOven}
									disabled={!state.hasGalley}
									onChange={(hasOven) => update({ hasOven })}
								/>
							</Grid>
						</>
					)}

					<SwitchField
						id="snack-operational"
						label="Missão operacional"
						description={
							aerial
								? "Voo pessoal, administrativo ou não operacional não é missão operacional: os passageiros deixam de ter a Classe B e a Classe C fica a critério da cozinha."
								: "Deslocamento pessoal ou administrativo não é missão operacional."
						}
						checked={state.isOperational}
						onChange={(isOperational) => update({ isOperational })}
					/>

					<FieldSet>
						<FieldLegend variant="label">{aerial ? "Tripulantes e passageiros" : "Efetivo"}</FieldLegend>
						<Grid>
							<CountField id="snack-crew" label={aerial ? "Tripulação" : "Efetivo"} value={state.crewCount} onChange={(crewCount) => update({ crewCount })} />
							<CountField id="snack-pax" label={aerial ? "Passageiros" : "Outros"} value={state.paxCount} onChange={(paxCount) => update({ paxCount })} />
						</Grid>
						<FieldError>{errors.people}</FieldError>
					</FieldSet>

					<SwitchField
						id="snack-non-military"
						label="Há civis ou servidores envolvidos"
						description="Pessoal não militar só recebe lanche com o motivo da participação na missão."
						checked={state.includesNonMilitary}
						onChange={(includesNonMilitary) => update({ includesNonMilitary })}
					/>
					{state.includesNonMilitary && (
						<Field data-invalid={!!errors.nonMilitaryReason}>
							<FieldLabel htmlFor="snack-non-military-reason">Motivo da participação</FieldLabel>
							<Textarea
								id="snack-non-military-reason"
								value={state.nonMilitaryReason}
								onChange={(e) => update({ nonMilitaryReason: e.target.value })}
								maxLength={500}
								aria-invalid={!!errors.nonMilitaryReason}
							/>
							<FieldError>{errors.nonMilitaryReason}</FieldError>
						</Field>
					)}

					<FieldSet>
						<FieldLegend variant="label">Material</FieldLegend>
						<FieldDescription>Calculado pelo número de pessoas — ajuste se a missão pedir outra quantidade.</FieldDescription>
						<div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
							{MATERIAL_FIELDS.map((m) => (
								<Field key={m.key}>
									<FieldLabel htmlFor={`snack-material-${m.key}`}>{m.label}</FieldLabel>
									<Input
										id={`snack-material-${m.key}`}
										type="number"
										inputMode="numeric"
										min={0}
										max={9999}
										value={String(materials[m.key])}
										onChange={(e) => update({ materialOverrides: { ...state.materialOverrides, [m.key]: e.target.value } })}
									/>
									<FieldDescription>
										{m.unit}
										{state.materialOverrides[m.key] != null && ` · sugerido ${derived[m.key]}`}
									</FieldDescription>
								</Field>
							))}
						</div>
						{hasMaterialOverride && (
							<div>
								<Button variant="ghost" size="sm" onClick={() => update({ materialOverrides: {} })}>
									<RotateCcw className="size-3.5" aria-hidden />
									Recalcular pelo número de pessoas
								</Button>
							</div>
						)}
					</FieldSet>

					<Grid>
						<Field>
							<FieldLabel htmlFor="snack-preference">Preferência</FieldLabel>
							<Select
								value={refeicaoOk ? state.preference : "lanche"}
								onValueChange={(v) => v && update({ preference: v as SnackRequestFormState["preference"] })}
							>
								<SelectTrigger id="snack-preference" className="w-full">
									<SelectValue>{PREFERENCE_LABELS[refeicaoOk ? state.preference : "lanche"]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="lanche">{PREFERENCE_LABELS.lanche}</SelectItem>
									<SelectItem value="refeicao" disabled={!refeicaoOk}>
										{PREFERENCE_LABELS.refeicao}
									</SelectItem>
								</SelectContent>
							</Select>
							{!refeicaoOk && (
								<FieldDescription>Para esta missão a norma só prevê lanche — refeição exige a classe e o equipamento que a permitem.</FieldDescription>
							)}
						</Field>
						<Field>
							<FieldLabel htmlFor="snack-funding">Fonte de custeio</FieldLabel>
							<Select value={state.fundingSource} onValueChange={(v) => v && update({ fundingSource: v as FundingSource })}>
								<SelectTrigger id="snack-funding" className="w-full">
									<SelectValue>{FUNDING_SOURCE_LABELS[state.fundingSource]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="economia_om">{FUNDING_SOURCE_LABELS.economia_om}</SelectItem>
									<SelectItem value="recurso_missao">{FUNDING_SOURCE_LABELS.recurso_missao}</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					</Grid>

					<Grid>
						<Field data-invalid={!!errors.pickupLocal}>
							<FieldLabel htmlFor="snack-pickup">Data e hora da retirada</FieldLabel>
							<Input
								id="snack-pickup"
								type="datetime-local"
								value={state.pickupLocal || (defaultPickup ? isoToBrasiliaLocal(defaultPickup) : "")}
								onChange={(e) => update({ pickupLocal: e.target.value })}
								aria-invalid={!!errors.pickupLocal}
							/>
							<FieldDescription>
								{state.pickupLocal
									? "Horário de Brasília. A retirada é no rancho da cozinha apoiadora."
									: "Sugerida 1 h antes da partida. Horário de Brasília."}
							</FieldDescription>
							<FieldError>{errors.pickupLocal}</FieldError>
						</Field>
						<TextField
							id="snack-pickup-responsible"
							label="Responsável pela retirada"
							value={state.pickupResponsible}
							onChange={(v) => update({ pickupResponsible: v })}
							error={errors.pickupResponsible}
							maxLength={160}
						/>
					</Grid>
				</FieldGroup>
			</CardContent>
		</Card>
	)
}

// ─── Campos ────────────────────────────────────────────────────────────────

function Grid({ children }: { children: ReactNode }) {
	return <div className="grid gap-4 sm:grid-cols-2">{children}</div>
}

function TextField({
	id,
	label,
	value,
	onChange,
	error,
	placeholder,
	maxLength,
}: {
	id: string
	label: string
	value: string
	onChange: (value: string) => void
	error?: string
	placeholder?: string
	maxLength?: number
}) {
	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} aria-invalid={!!error} />
			<FieldError>{error}</FieldError>
		</Field>
	)
}

function CountField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input id={id} type="number" inputMode="numeric" min={0} max={9999} value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
		</Field>
	)
}

function DurationField({
	id,
	label,
	hours,
	minutes,
	onChange,
	error,
	description,
}: {
	id: string
	label: string
	hours: string
	minutes: string
	onChange: (hours: string, minutes: string) => void
	error?: string
	description?: string
}) {
	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={`${id}-h`}>{label}</FieldLabel>
			<div className="flex items-center gap-2">
				<Input
					id={`${id}-h`}
					type="number"
					inputMode="numeric"
					min={0}
					max={336}
					value={hours}
					onChange={(e) => onChange(e.target.value, minutes)}
					placeholder="0"
					aria-label={`${label} — horas`}
					aria-invalid={!!error}
					className="w-24"
				/>
				<span className="text-caption text-muted-foreground">h</span>
				<Input
					id={`${id}-m`}
					type="number"
					inputMode="numeric"
					min={0}
					max={59}
					value={minutes}
					onChange={(e) => onChange(hours, e.target.value)}
					placeholder="0"
					aria-label={`${label} — minutos`}
					aria-invalid={!!error}
					className="w-24"
				/>
				<span className="text-caption text-muted-foreground">min</span>
			</div>
			{description && <FieldDescription>{description}</FieldDescription>}
			<FieldError>{error}</FieldError>
		</Field>
	)
}

function SwitchField({
	id,
	label,
	description,
	checked,
	onChange,
	disabled,
}: {
	id: string
	label: string
	description?: string
	checked: boolean
	onChange: (checked: boolean) => void
	disabled?: boolean
}) {
	return (
		<Field orientation="horizontal">
			<Switch id={id} checked={checked} onCheckedChange={(value) => onChange(value)} disabled={disabled} />
			<FieldContent>
				<FieldLabel htmlFor={id}>{label}</FieldLabel>
				{description && <FieldDescription>{description}</FieldDescription>}
			</FieldContent>
		</Field>
	)
}
