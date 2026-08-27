/**
 * Registro de manutenção executada — o que foi feito, quando e por quem.
 *
 * O plano é OPCIONAL de propósito: a maior parte da manutenção real é corretiva e não
 * corresponde a rotina nenhuma. Exigir um plano faria a praça inventar rotinas só para
 * conseguir registrar um conserto, e a matriz de vencimento passaria a mentir.
 *
 * Quando o registro nasce de uma pane, ele pode encerrá-la no mesmo movimento — é o que fecha
 * o ciclo relatar → consertar → voltar ao planejamento sem obrigar a pessoa a lembrar de duas
 * telas. Encerrar exige `kitchen:2`; o domínio recusa se quem registra for só da produção.
 */

import type { MaintenanceLogKind, MaintenanceProvider } from "@iefa/sisub-domain"
import { Loader2, Wrench } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useApplicablePlans, useLogMaintenance } from "@/hooks/data/useEquipment"
import { MAINTENANCE_KIND_LABEL, MAINTENANCE_PROVIDER_LABEL } from "./equipment-labels"

const NO_PLAN = "__none__"
const PROVIDERS = ["in_house", "contract", "warranty", "manufacturer", "other"] as const
const KINDS = ["preventive", "inspection", "cleaning", "calibration", "legal", "corrective"] as const

export function LogMaintenanceDialog({
	unitId,
	unitLabel,
	open,
	onClose,
	defaultPlanId = null,
	issueId = null,
	canResolveIssue = false,
}: {
	unitId: string | null
	unitLabel: string
	open: boolean
	onClose: () => void
	/** Pré-seleciona a rotina — usado quando o diálogo abre a partir de uma célula da matriz. */
	defaultPlanId?: string | null
	/** Pane que originou o conserto, quando o diálogo abre a partir dela. */
	issueId?: string | null
	canResolveIssue?: boolean
}) {
	const log = useLogMaintenance()
	const { data: plans = [] } = useApplicablePlans(unitId ?? undefined)

	const [planId, setPlanId] = useState<string | null>(defaultPlanId)
	const [kind, setKind] = useState<MaintenanceLogKind>(issueId != null ? "corrective" : "preventive")
	const [performedOn, setPerformedOn] = useState(() => new Date().toISOString().slice(0, 10))
	const [provider, setProvider] = useState<MaintenanceProvider>("in_house")
	const [cost, setCost] = useState("")
	const [notes, setNotes] = useState("")
	const [resolveIssue, setResolveIssue] = useState(false)

	const handleSubmit = () => {
		if (unitId == null || performedOn === "") return
		log.mutate(
			{
				unitId,
				planId,
				issueId,
				kind,
				performedOn,
				provider,
				cost: cost.trim() === "" ? null : Number(cost),
				notes: notes.trim() === "" ? null : notes.trim(),
				resolveIssue: issueId != null && resolveIssue,
			},
			{ onSuccess: onClose }
		)
	}

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Registrar manutenção — {unitLabel}</DialogTitle>
					<DialogDescription>O registro é o que faz a rotina voltar a ficar em dia; sem ele, a matriz continua vencida.</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<Field>
						<FieldLabel htmlFor="log-plan">Rotina</FieldLabel>
						<FieldContent>
							<Select value={planId ?? NO_PLAN} onValueChange={(value) => setPlanId(value === NO_PLAN ? null : (value as string))}>
								<SelectTrigger id="log-plan" className="w-full">
									<SelectValue>{planId ? (plans.find((p) => p.id === planId)?.title ?? "Rotina") : "Sem rotina (avulsa)"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_PLAN}>Sem rotina (avulsa)</SelectItem>
									{plans.map((plan) => (
										<SelectItem key={plan.id} value={plan.id}>
											{plan.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>Conserto pontual não precisa de rotina — só o que é rotina zera o vencimento dela.</FieldDescription>
						</FieldContent>
					</Field>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<Field>
							<FieldLabel htmlFor="log-date">Data</FieldLabel>
							<FieldContent>
								<Input id="log-date" type="date" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} />
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="log-kind">Tipo</FieldLabel>
							<FieldContent>
								<Select value={kind} onValueChange={(value) => setKind(value as MaintenanceLogKind)}>
									<SelectTrigger id="log-kind" className="w-full">
										<SelectValue>{MAINTENANCE_KIND_LABEL[kind]}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{KINDS.map((option) => (
											<SelectItem key={option} value={option}>
												{MAINTENANCE_KIND_LABEL[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor="log-provider">Quem fez</FieldLabel>
							<FieldContent>
								<Select value={provider} onValueChange={(value) => setProvider(value as MaintenanceProvider)}>
									<SelectTrigger id="log-provider" className="w-full">
										<SelectValue>{MAINTENANCE_PROVIDER_LABEL[provider]}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{PROVIDERS.map((option) => (
											<SelectItem key={option} value={option}>
												{MAINTENANCE_PROVIDER_LABEL[option]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FieldContent>
						</Field>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="log-cost">Custo (R$)</FieldLabel>
							<FieldContent>
								<Input id="log-cost" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
							</FieldContent>
						</Field>
					</div>

					<Field>
						<FieldLabel htmlFor="log-notes">Observação</FieldLabel>
						<FieldContent>
							<Textarea id="log-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
						</FieldContent>
					</Field>

					{issueId != null && canResolveIssue ? (
						<Field orientation="horizontal">
							<Checkbox id="log-resolve" checked={resolveIssue} onCheckedChange={(checked) => setResolveIssue(checked === true)} />
							<FieldLabel htmlFor="log-resolve">Encerrar a pane como resolvida</FieldLabel>
						</Field>
					) : null}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={handleSubmit} disabled={unitId == null || performedOn === "" || log.isPending}>
						{log.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Wrench className="size-4 mr-2" />}
						Registrar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
