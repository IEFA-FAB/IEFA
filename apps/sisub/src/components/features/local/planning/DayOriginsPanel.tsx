import { brasiliaToday } from "@iefa/sisub-domain/civil-date"
import { CalendarClock, CalendarX2, Layers, Users } from "lucide-react"
import { useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useMoveOriginToDate, useRemoveOriginFromDay, useSizeOriginOnDay } from "@/hooks/data/usePlanningAdjustments"
import { useMenuTemplates } from "@/hooks/data/useTemplates"
import { type DayOrigin, dayOriginsOf } from "@/lib/day-origins"
import type { DailyMenuWithItems } from "@/types/domain/planning"

/**
 * O que cada cardápio pôs neste dia — o cardápio semanal, o evento, o apoio da viagem — com
 * as duas ações que o imprevisto pede: ADIAR (a viagem foi para quinta) e TIRAR DO DIA (foi
 * cancelada). Sem isto o usuário caçava preparação por preparação, ou desistia do calendário e
 * anotava o ajuste fora do sistema.
 */
export function DayOriginsPanel({ kitchenId, date, menus }: { kitchenId: number; date: string; menus: readonly DailyMenuWithItems[] }) {
	const { data: templates } = useMenuTemplates(kitchenId)
	const origins = dayOriginsOf(menus, templates ?? [])
	const [moving, setMoving] = useState<DayOrigin | null>(null)
	const [toDate, setToDate] = useState("")
	const [removing, setRemoving] = useState<DayOrigin | null>(null)
	// Evento ou apoio aplicado sem efetivo: o número chega aqui e dá porções às preparações dele.
	const [sizing, setSizing] = useState<DayOrigin | null>(null)
	const [sizingValue, setSizingValue] = useState("")
	const sizingHeadcount = Number(sizingValue)
	const isSizingValid = sizingValue !== "" && Number.isInteger(sizingHeadcount) && sizingHeadcount > 0 && sizingHeadcount <= 100_000
	// Adiar para trás é quase sempre ano errado; o servidor também recusa.
	const today = brasiliaToday()
	const { mutate: moveOrigin, isPending: isMoving } = useMoveOriginToDate()
	const { mutate: removeOrigin, isPending: isRemoving } = useRemoveOriginFromDay()
	const { mutate: sizeOrigin, isPending: isSizing } = useSizeOriginOnDay()

	if (origins.length === 0) return null

	return (
		<section aria-label="Cardápios neste dia" className="space-y-2">
			<h4 className="flex items-center gap-1.5 text-subheading">
				<Layers className="size-4 text-muted-foreground" />
				Neste dia
			</h4>
			<ul className="space-y-1.5">
				{origins.map((origin) => (
					<li key={origin.templateId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
						<div className="flex min-w-0 items-center gap-2">
							<Badge variant={origin.type === "weekly" ? "secondary" : "outline"}>{origin.typeLabel}</Badge>
							<span className="truncate text-sm">{origin.name}</span>
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
								{origin.itemCount} {origin.itemCount === 1 ? "preparação" : "preparações"}
							</span>
							{origin.pendingCount > 0 && origin.type !== "weekly" && <Badge variant="warning">Efetivo a definir</Badge>}
						</div>
						<div className="flex items-center gap-1">
							{origin.pendingCount > 0 && origin.type !== "weekly" && (
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => {
										setSizingValue("")
										setSizing(origin)
									}}
									aria-label={`Informar ${origin.type === "apoio" ? "kits" : "efetivo"} de ${origin.name}`}
								>
									<Users />
									{origin.type === "apoio" ? "Informar kits" : "Informar efetivo"}
								</Button>
							)}
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => {
									setToDate("")
									setMoving(origin)
								}}
								aria-label={`Adiar ${origin.name}`}
							>
								<CalendarClock />
								Adiar
							</Button>
							<Button type="button" size="sm" variant="ghost" onClick={() => setRemoving(origin)} aria-label={`Tirar ${origin.name} do dia`}>
								<CalendarX2 />
								Tirar do dia
							</Button>
						</div>
					</li>
				))}
			</ul>

			<AlertDialog open={moving != null} onOpenChange={(open) => !open && setMoving(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Adiar “{moving?.name}”</AlertDialogTitle>
						<AlertDialogDescription>
							As {moving?.itemCount} preparações vão para a nova data com tudo o que foi ajustado neste dia (porções, trocas, substitutos). O resto do dia fica
							como está.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Field>
						<FieldLabel htmlFor="origin-move-date">Nova data</FieldLabel>
						<Input id="origin-move-date" type="date" value={toDate} min={today} onChange={(e) => setToDate(e.target.value)} />
						<FieldDescription>Se a data nova já tiver este cardápio, nada muda — tire o de lá antes.</FieldDescription>
					</Field>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							disabled={!toDate || toDate === date || toDate < today || isMoving}
							onClick={() => {
								if (!moving || !toDate) return
								moveOrigin({ kitchenId, date, toDate, originTemplateId: moving.templateId }, { onSuccess: () => setMoving(null) })
							}}
						>
							Adiar
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={sizing != null} onOpenChange={(open) => !open && setSizing(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{sizing?.type === "apoio" ? "Kits" : "Efetivo"} de “{sizing?.name}”
						</AlertDialogTitle>
						<AlertDialogDescription>
							As {sizing?.pendingCount} preparações sem porções passam a ter porções pela proporção de cada uma
							{sizing?.type === "apoio" ? " (porções por kit × kits)" : ""}. As que já têm porções ficam como estão.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Field>
						<FieldLabel htmlFor="origin-size-headcount">{sizing?.type === "apoio" ? "Kits" : "Efetivo"}</FieldLabel>
						<Input
							id="origin-size-headcount"
							type="number"
							inputMode="numeric"
							min={1}
							max={100_000}
							value={sizingValue}
							onChange={(e) => setSizingValue(e.target.value)}
						/>
					</Field>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							disabled={!isSizingValid || isSizing}
							onClick={() => {
								if (!sizing || !isSizingValid) return
								sizeOrigin({ kitchenId, date, originTemplateId: sizing.templateId, headcount: sizingHeadcount }, { onSuccess: () => setSizing(null) })
							}}
						>
							Calcular porções
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={removing != null} onOpenChange={(open) => !open && setRemoving(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Tirar “{removing?.name}” deste dia?</AlertDialogTitle>
						<AlertDialogDescription>
							As {removing?.itemCount} preparações que ele pôs aqui vão para a lixeira do agendamento — dá para restaurar. O resto do dia fica como está.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							disabled={isRemoving}
							onClick={() => {
								if (!removing) return
								removeOrigin({ kitchenId, date, originTemplateId: removing.templateId }, { onSuccess: () => setRemoving(null) })
							}}
						>
							Tirar do dia
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}
