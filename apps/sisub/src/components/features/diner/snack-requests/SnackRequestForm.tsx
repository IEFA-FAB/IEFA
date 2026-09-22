import type { SnackOrderingContext } from "@iefa/sisub-domain"
import type { SnackStandardSnapshot } from "@iefa/sisub-domain/utils"
import { calculateSnackEntitlement, leadTimeHours } from "@iefa/sisub-domain/utils"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Loader2, Send } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { orderableSnackStandardsQueryOptions, useCreateSnackRequest } from "@/hooks/data/useSnackRequests"
import { SnackEntitlementPanel } from "./SnackEntitlementPanel"
import { SnackMissionSection } from "./SnackMissionSection"
import { SnackStandardLinesSection } from "./SnackStandardLinesSection"
import { formatDateTime } from "./snack-format"
import {
	buildCreateInput,
	computeDivergences,
	departureIso,
	type FormContext,
	initialFormState,
	peopleCount,
	pickupIso,
	refeicaoAllowed,
	type SnackRequestFormState,
	standardFitsMission,
	suggestedLines,
	toCount,
	toMissionInput,
	validateForm,
} from "./snack-request-form"

const EMPTY_STANDARDS: SnackStandardSnapshot[] = []

function initialStateFrom(context: SnackOrderingContext): SnackRequestFormState {
	const base = initialFormState()
	const defaultKitchen = context.kitchens.find((k) => k.id === context.default_kitchen_id) ?? (context.kitchens.length === 1 ? context.kitchens[0] : undefined)
	return {
		...base,
		kitchenId: defaultKitchen?.id ?? null,
		requesterUnitLabel: context.requester_unit_label ?? "",
		pickupResponsible: context.requester_label,
	}
}

/** Relógio da antecedência: recalcula a cada minuto para o alerta de 24 h não envelhecer na tela. */
function useNow(): Date {
	const [now, setNow] = useState(() => new Date())
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 60_000)
		return () => window.clearInterval(id)
	}, [])
	return now
}

export function SnackRequestForm({ context }: { context: SnackOrderingContext }) {
	const navigate = useNavigate()
	const now = useNow()
	const [state, setState] = useState<SnackRequestFormState>(() => initialStateFrom(context))
	const [showErrors, setShowErrors] = useState(false)
	const { mutate: create, isPending } = useCreateSnackRequest()
	const update = (patch: Partial<SnackRequestFormState>) => setState((current) => ({ ...current, ...patch }))

	const {
		data: kitchenStandards = EMPTY_STANDARDS,
		isLoading: standardsLoading,
		error: standardsError,
	} = useQuery(orderableSnackStandardsQueryOptions(state.kitchenId))

	const mission = toMissionInput(state)
	const entitlement = mission ? calculateSnackEntitlement(mission) : null
	const aerial = state.missionKind === "aerea"
	const equipment = { missionKind: state.missionKind, hasGalley: aerial && state.hasGalley, hasOven: aerial && state.hasGalley && state.hasOven }
	const standards = kitchenStandards.filter((s) => standardFitsMission(s, equipment))
	const standardsById = new Map(standards.map((s) => [s.id, s]))
	const refeicaoOk = refeicaoAllowed(entitlement)
	const preference = refeicaoOk ? state.preference : "lanche"

	const followsSuggestion = state.lines == null
	const lines = state.lines ?? (entitlement ? suggestedLines(entitlement, standards, preference) : [])
	const divergences = entitlement ? computeDivergences(entitlement, lines, standardsById) : []

	const formContext: FormContext = { now, entitlement, lines, standardsById, divergences }
	const errors = validateForm(state, formContext)
	const visibleErrors = showErrors ? errors : {}

	const departure = departureIso(state)
	const pickup = pickupIso(state)
	const leadHours = departure && pickup ? leadTimeHours(now, pickup, departure) : null
	const kitchen = context.kitchens.find((k) => k.id === state.kitchenId)
	const totalKits = lines.reduce((sum, line) => sum + toCount(line.quantity), 0)

	const submit = () => {
		setShowErrors(true)
		if (Object.keys(errors).length > 0) {
			toast.error("Revise os campos destacados antes de enviar.")
			return
		}
		create(buildCreateInput(state, formContext), {
			onSuccess: (detail) => navigate({ to: "/diner/snack-requests/$requestId", params: { requestId: detail.id } }),
		})
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
			<SnackMissionSection state={state} update={update} errors={visibleErrors} kitchens={context.kitchens} refeicaoOk={refeicaoOk} />

			<div className="lg:row-span-3 lg:self-start lg:sticky lg:top-4">
				<SnackEntitlementPanel
					entitlement={entitlement}
					missionKind={state.missionKind}
					leadHours={leadHours}
					lateReason={state.lateReason}
					onLateReasonChange={(lateReason) => update({ lateReason })}
					lateReasonError={visibleErrors.lateReason}
				/>
			</div>

			<SnackStandardLinesSection
				missionKind={state.missionKind}
				entitlement={entitlement}
				standards={standards}
				standardsById={standardsById}
				standardsLoading={standardsLoading}
				standardsError={standardsError}
				kitchenChosen={state.kitchenId != null}
				lines={lines}
				followsSuggestion={followsSuggestion}
				onLinesChange={(next) => update({ lines: next })}
				onResetLines={() => update({ lines: null })}
				divergences={divergences}
				divergenceReason={state.divergenceReason}
				onDivergenceReasonChange={(divergenceReason) => update({ divergenceReason })}
				errors={{ lines: visibleErrors.lines, divergenceReason: visibleErrors.divergenceReason }}
			/>

			<Card>
				<CardHeader>
					<CardTitle>Resumo</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<dl className="grid gap-3 sm:grid-cols-2">
						<SummaryItem label="Cozinha apoiadora" value={kitchen?.name ?? "—"} />
						<SummaryItem label="Pessoas" value={String(peopleCount(state))} />
						<SummaryItem label="Kits pedidos" value={String(totalKits)} />
						<SummaryItem label="Retirada" value={pickup ? formatDateTime(pickup) : "—"} />
						<SummaryItem label="Partida" value={departure ? formatDateTime(departure) : "—"} />
						<SummaryItem label="Antecedência" value={leadHours == null ? "—" : `${Math.max(0, Math.floor(leadHours))} h`} />
					</dl>
					{showErrors && Object.keys(errors).length > 0 && (
						<ul className="space-y-1">
							{Object.entries(errors).map(([key, message]) => (
								<li key={key} className="text-caption text-destructive">
									{message}
								</li>
							))}
						</ul>
					)}
					<div className="flex justify-end">
						<Button onClick={submit} disabled={isPending}>
							{isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
							Enviar pedido à cozinha
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function SummaryItem({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-label text-foreground">{label}</dt>
			<dd className="text-body">{value}</dd>
		</div>
	)
}
