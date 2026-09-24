import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Save, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { fetchStockSettingsFn, saveStockSettingsFn } from "@/server/adjustment.fn"

/**
 * Configuração de estoque da cozinha.
 *
 * Os números aqui são os que decidem quando o sistema PEDE alguma coisa do
 * operador: motivo na saída, aprovação no ajuste, recontagem no inventário. Os
 * defaults são chute calibrável — cozinha com movimento grande e cozinha de
 * destacamento não têm a mesma noção de "diferença relevante", e um teto
 * apertado demais é o que faz todo mundo marcar "outro" e seguir.
 */

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/settings")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 3),
	loader: ({ params }) => fetchStockSettingsFn({ data: { kitchenId: Number(params.kitchenId) } }),
	component: StockSettingsPage,
})

function StockSettingsPage() {
	const settings = Route.useLoaderData()
	const { kitchenId } = Route.useParams()
	const router = useRouter()
	const [form, setForm] = useState(settings)
	const [busy, setBusy] = useState(false)

	async function save() {
		setBusy(true)
		try {
			await saveStockSettingsFn({ data: { kitchenId: Number(kitchenId), ...form } })
			toast.success("Configurações salvas")
			await router.invalidate()
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao salvar")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-4">
			<PageHeader title="Configurações de estoque" description="Tolerâncias, alçada de ajuste e regime de segregação de funções desta cozinha." />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<SlidersHorizontal className="size-4" />
						Parâmetros
					</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4 md:grid-cols-2">
					<div className="space-y-1 md:col-span-2">
						<Label htmlFor="segregation">Segregação de funções</Label>
						<Select value={form.segregation} onValueChange={(value) => setForm((c) => ({ ...c, segregation: (value ?? "dual") as typeof c.segregation }))}>
							<SelectTrigger id="segregation">
								<SelectValue>
									{form.segregation === "strict" ? "Estrita — aprovador diferente de quem lançou e de quem contou" : "Dupla — duas pessoas quaisquer"}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="dual">Dupla — duas pessoas quaisquer</SelectItem>
								<SelectItem value="strict">Estrita — aprovador diferente de quem lançou e de quem contou</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Quando não há segunda pessoa com nível 3 na cozinha, a operação segue e a exceção fica registrada no documento e no relatório — travar a cozinha
							no fim de semana não é controle.
						</p>
					</div>

					<div className="space-y-1">
						<Label htmlFor="approval">Alçada de ajuste (R$)</Label>
						<Input
							id="approval"
							type="number"
							min={0}
							step="0.01"
							value={form.adjustmentApprovalValue}
							onChange={(event) => setForm((c) => ({ ...c, adjustmentApprovalValue: Number(event.target.value) }))}
						/>
						<p className="text-xs text-muted-foreground">
							Acima disso o ajuste espera aprovação. A conta soma os ajustes do mesmo autor nas últimas 24 h, então fatiar o documento não escapa.
						</p>
					</div>

					<div className="space-y-1">
						<Label htmlFor="issuePct">Tolerância da saída (%)</Label>
						<Input
							id="issuePct"
							type="number"
							min={0}
							max={100}
							value={form.issueTolerancePct}
							onChange={(event) => setForm((c) => ({ ...c, issueTolerancePct: Number(event.target.value) }))}
						/>
					</div>

					<div className="space-y-1">
						<Label htmlFor="issueFloor">Piso da tolerância da saída (R$)</Label>
						<Input
							id="issueFloor"
							type="number"
							min={0}
							step="0.01"
							value={form.issueToleranceFloorValue}
							onChange={(event) => setForm((c) => ({ ...c, issueToleranceFloorValue: Number(event.target.value) }))}
						/>
						<p className="text-xs text-muted-foreground">
							Desvio precisa passar do percentual E do piso para pedir motivo. Sem piso, 200 g de sal fora do previsto viram "variância".
						</p>
					</div>

					<div className="space-y-1">
						<Label htmlFor="countPct">Tolerância da contagem (%)</Label>
						<Input
							id="countPct"
							type="number"
							min={0}
							max={100}
							value={form.countTolerancePct}
							onChange={(event) => setForm((c) => ({ ...c, countTolerancePct: Number(event.target.value) }))}
						/>
					</div>

					<div className="space-y-1">
						<Label htmlFor="countValue">Piso da tolerância da contagem (R$)</Label>
						<Input
							id="countValue"
							type="number"
							min={0}
							step="0.01"
							value={form.countToleranceValue}
							onChange={(event) => setForm((c) => ({ ...c, countToleranceValue: Number(event.target.value) }))}
						/>
						<p className="text-xs text-muted-foreground">Diferença acima das duas manda a linha para recontagem.</p>
					</div>

					<div className="md:col-span-2">
						<Button type="button" onClick={save} disabled={busy}>
							<Save className="mr-2 size-4" />
							Salvar
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
