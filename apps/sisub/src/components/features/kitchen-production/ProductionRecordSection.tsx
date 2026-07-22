import { ClipboardCheck, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateTaskRecord } from "@/hooks/data/useProduction"
import type { ProductionTask } from "@/types/domain/production"

interface ProductionRecordSectionProps {
	task: ProductionTask
	plannedPortions: number | null
	kitchenId: number
	date: string
}

/** Coerção defensiva: numeric do Drizzle chega como string no wire. */
function toNumber(value: unknown): number | null {
	if (value == null || value === "") return null
	const n = Number(value)
	return Number.isNaN(n) ? null : n
}

/**
 * Registro do REAL da produção: porções produzidas, sobras e observações.
 * Fecha o ciclo planejado × executado por preparação do dia.
 */
export function ProductionRecordSection({ task, plannedPortions, kitchenId, date }: ProductionRecordSectionProps) {
	const { mutate: updateRecord, isPending } = useUpdateTaskRecord()

	const [produced, setProduced] = useState<string>(toNumber(task.produced_quantity)?.toString() ?? "")
	const [leftover, setLeftover] = useState<string>(toNumber(task.leftover_quantity)?.toString() ?? "")
	const [notes, setNotes] = useState<string>(task.notes ?? "")
	const [prevTaskId, setPrevTaskId] = useState(task.id)

	// Sincroniza quando o sheet troca de preparação (ajuste durante render, não em effect).
	if (prevTaskId !== task.id) {
		setPrevTaskId(task.id)
		setProduced(toNumber(task.produced_quantity)?.toString() ?? "")
		setLeftover(toNumber(task.leftover_quantity)?.toString() ?? "")
		setNotes(task.notes ?? "")
	}

	const producedNum = produced === "" ? null : Number(produced)
	const deviation = producedNum != null && plannedPortions != null ? producedNum - plannedPortions : null

	const handleSave = () => {
		updateRecord({
			taskId: task.id,
			producedQuantity: produced === "" ? null : Number(produced),
			leftoverQuantity: leftover === "" ? null : Number(leftover),
			notes: notes.trim() === "" ? null : notes.trim(),
			kitchenId,
			date,
		})
	}

	return (
		<div className="px-4 pb-4 space-y-2">
			<h3 className="text-subheading text-foreground flex items-center gap-2">
				<ClipboardCheck className="size-4 text-muted-foreground" />
				Registro de Produção
			</h3>
			<div className="rounded-md border border-border p-3 space-y-3">
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1">
						<Label htmlFor={`produced-${task.id}`} className="text-xs text-muted-foreground">
							Porções produzidas
						</Label>
						<Input
							id={`produced-${task.id}`}
							type="number"
							min="0"
							value={produced}
							onChange={(e) => setProduced(e.target.value)}
							placeholder={plannedPortions != null ? `Planejado: ${plannedPortions}` : "Ex: 150"}
							className="h-8 text-xs"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor={`leftover-${task.id}`} className="text-xs text-muted-foreground">
							Sobras (porções)
						</Label>
						<Input
							id={`leftover-${task.id}`}
							type="number"
							min="0"
							value={leftover}
							onChange={(e) => setLeftover(e.target.value)}
							placeholder="Ex: 12"
							className="h-8 text-xs"
						/>
					</div>
				</div>
				{deviation != null && deviation !== 0 && (
					<p className="text-xs text-muted-foreground">
						Desvio vs planejado: <span className={deviation > 0 ? "text-success" : "text-warning"}>{deviation > 0 ? `+${deviation}` : deviation} porções</span>
					</p>
				)}
				<div className="space-y-1">
					<Label htmlFor={`notes-${task.id}`} className="text-xs text-muted-foreground">
						Observações do turno
					</Label>
					<Textarea
						id={`notes-${task.id}`}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						placeholder="Ex: efetivo menor que o previsto; troca de guarnição"
						className="text-xs min-h-16"
					/>
				</div>
				<Button size="sm" variant="outline" className="w-full" onClick={handleSave} disabled={isPending}>
					{isPending && <Loader2 className="size-3.5 mr-2 animate-spin" />}
					Salvar registro
				</Button>
			</div>
		</div>
	)
}
