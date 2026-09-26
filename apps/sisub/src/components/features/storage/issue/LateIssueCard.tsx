import { useQuery } from "@tanstack/react-query"
import { History, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { listIssueDayTasksFn, registerLateIssueFn } from "@/server/issue.fn"

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })

/** Sem preparação ligada: a saída é do dia, não de uma preparação. */
const NO_TASK = "__none__"

interface LateIssueCardProps {
	kitchenId: number
	/** Hoje, em Brasília ("AAAA-MM-DD"): o limite do campo de data. */
	today: string
	ingredientOptions: readonly SearchableSelectOption[]
	onDone: () => void
}

/**
 * Saída lançada depois, com a data real (EST-SAI-01): o insumo saiu na terça sem requisição, ou
 * depois de o dia fechar, e o almoxarife lança na quinta. Vale enquanto a competência estiver
 * aberta; o motivo é obrigatório e fica no movimento, ligado ao dia e, se escolhida, à preparação.
 */
export function LateIssueCard({ kitchenId, today, ingredientOptions, onDone }: LateIssueCardProps) {
	const [occurredOn, setOccurredOn] = useState(today)
	const [ingredientId, setIngredientId] = useState<string | null>(null)
	const [quantity, setQuantity] = useState("")
	const [reason, setReason] = useState("")
	const [taskId, setTaskId] = useState<string>(NO_TASK)
	const [busy, setBusy] = useState(false)
	// Mesmo identificador até a saída confirmar: o retry depois de um 502 não saca de novo.
	const [emission, setEmission] = useState<{ key: string; id: string } | null>(null)

	const { data: tasks } = useQuery({
		queryKey: ["issue-day-tasks", kitchenId, occurredOn],
		queryFn: () => listIssueDayTasksFn({ data: { kitchenId, issueDate: occurredOn } }),
		enabled: /^\d{4}-\d{2}-\d{2}$/.test(occurredOn),
	})

	const amount = Number(quantity.replace(",", "."))
	const canSave = ingredientId != null && Number.isFinite(amount) && amount > 0 && reason.trim().length >= 5 && occurredOn <= today && !busy

	async function save() {
		if (!canSave || ingredientId == null) return
		const key = `${kitchenId}:${occurredOn}:${ingredientId}:${amount}:${taskId}`
		const emissionId = emission?.key === key ? emission.id : crypto.randomUUID()
		if (emission?.key !== key) setEmission({ key, id: emissionId })
		setBusy(true)
		try {
			const result = await registerLateIssueFn({
				data: {
					kitchenId,
					ingredientId,
					quantity: amount,
					occurredOn,
					reason: reason.trim(),
					emissionId,
					...(taskId !== NO_TASK && { productionTaskId: taskId }),
				},
			})
			if (result.withoutLot > 0) {
				toast.warning(
					`Saída de ${NUM.format(amount)} lançada com a data real; ${NUM.format(result.withoutLot)} sem saldo em lote — entra como falta a regularizar na contagem.`
				)
			} else {
				toast.success(`Saída de ${NUM.format(amount)} lançada com a data real`)
			}
			setEmission(null)
			setQuantity("")
			setReason("")
			setIngredientId(null)
			setTaskId(NO_TASK)
			onDone()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao lançar a saída tardia")
		} finally {
			setBusy(false)
		}
	}

	const taskLabel = taskId === NO_TASK ? "Só o dia (sem preparação)" : (tasks?.find((t) => t.taskId === taskId)?.recipeName ?? "Preparação")

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<span className="flex items-center gap-2">
						<History className="size-4" aria-hidden="true" />
						Lançar saída de outro dia
					</span>
				</CardTitle>
				<CardDescription>
					Saiu sem requisição, ou depois de o dia fechar? Lance com a data em que aconteceu. Vale enquanto o mês não estiver fechado; insumo já acertado numa
					contagem aprovada depois dessa data é recusado, para não baixar duas vezes.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="late-date">Data real da saída</FieldLabel>
							<Input
								id="late-date"
								type="date"
								max={today}
								value={occurredOn}
								onChange={(event) => {
									setOccurredOn(event.target.value)
									setTaskId(NO_TASK)
								}}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="late-task">Preparação (opcional)</FieldLabel>
							<Select value={taskId} onValueChange={(value) => setTaskId(value ?? NO_TASK)}>
								<SelectTrigger id="late-task">
									<SelectValue>{taskLabel}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_TASK}>Só o dia (sem preparação)</SelectItem>
									{(tasks ?? []).map((task) => (
										<SelectItem key={task.taskId} value={task.taskId}>
											{task.recipeName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldDescription>Ligada a uma preparação, a saída conta como a baixa dela.</FieldDescription>
						</Field>
					</div>
					<div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
						<Field>
							<FieldLabel htmlFor="late-ingredient">Insumo</FieldLabel>
							<SearchableSelect
								id="late-ingredient"
								value={ingredientId}
								onValueChange={setIngredientId}
								options={ingredientOptions}
								placeholder="Escolha o insumo"
								searchPlaceholder="Pesquisar insumo…"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="late-quantity">Quantidade</FieldLabel>
							<Input id="late-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
						</Field>
					</div>
					<Field>
						<FieldLabel htmlFor="late-reason">Motivo</FieldLabel>
						<Input
							id="late-reason"
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							placeholder="Ex.: emergência no jantar, retirada sem requisição"
							maxLength={300}
						/>
					</Field>
					<div className="flex justify-end">
						<Button type="button" disabled={!canSave} onClick={save}>
							{busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
							Lançar com a data real
						</Button>
					</div>
				</FieldGroup>
			</CardContent>
		</Card>
	)
}
