import {
	CONSERVATION_CLASSES,
	CONSERVATION_LABELS,
	type ConservationClass,
	EXPIRY_BAND_LABELS,
	EXPIRY_DEFAULT_ALERT_DAYS,
	type ExpiryBand,
} from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AlertTriangle, ArrowRightLeft, CalendarClock, ShieldAlert, Star, Trash2 } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { createAdjustmentFn, quarantineLotFn } from "@/server/adjustment.fn"
import { deleteExpiryPolicyFn, type ExpiryLotRow, fetchExpiringLotsFn, fetchExpiryPoliciesFn, saveExpiryPolicyFn, setLotUseFirstFn } from "@/server/expiry.fn"
import { createTransferFn } from "@/server/stock.fn"

/**
 * Vencimentos.
 *
 * O requisito era "mostrar itens que podem estar prestes a estragar", e a
 * palavra que faz o trabalho é *prestes*: uma lista do que já venceu é um
 * relatório de prejuízo, não uma ferramenta. Por isso a tela é organizada por
 * faixa e por AÇÃO — o lote crítico oferece usar primeiro, transferir para
 * outra cozinha e pôr em quarentena; o vencido oferece baixar.
 *
 * A antecedência do alerta é do item quando a cozinha souber dizer, e da
 * classe de conservação quando não souber: três dias é muito para o feijão e
 * tarde demais para o leite pasteurizado.
 */

const BAND_HINTS: Record<ExpiryBand, string> = {
	expired: "Fora da alocação automática de saída. Baixe com motivo para tirar do saldo.",
	critical: "Vence dentro do limite da cozinha. É aqui que dá para salvar o item.",
	warning: "Vence dentro do dobro do limite — cabe planejar cardápio ou transferir.",
	no_expiry: "Perecível que entrou sem validade. É defeito de cadastro, não item saudável.",
}

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/expiry")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: async ({ params }) => {
		const kitchenId = Number(params.kitchenId)
		const [expiring, policies] = await Promise.all([fetchExpiringLotsFn({ data: { kitchenId } }), fetchExpiryPoliciesFn({ data: { kitchenId } })])
		return { expiring, policies, kitchenId }
	},
	component: ExpiryPage,
	head: () => ({ meta: [{ title: "Estoque — Vencimentos" }] }),
})

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** "vence hoje" e "venceu há 3 dias" dizem mais do que -3. */
function describeDays(daysLeft: number | null): string {
	if (daysLeft == null) return "sem validade"
	if (daysLeft < 0) return `venceu há ${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? "dia" : "dias"}`
	if (daysLeft === 0) return "vence hoje"
	return `vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`
}

function ExpiryPage() {
	const { expiring, policies, kitchenId } = Route.useLoaderData()
	const router = useRouter()
	const [busy, setBusy] = useState(false)
	const [transferLot, setTransferLot] = useState<ExpiryLotRow | null>(null)
	const [transferKitchenId, setTransferKitchenId] = useState("")
	const [transferQuantity, setTransferQuantity] = useState("")
	const [policyClass, setPolicyClass] = useState<ConservationClass | "">("")
	const [policyDays, setPolicyDays] = useState("")

	/**
	 * Roda a ação e diz se deu certo. Quem limpa formulário depois TEM de olhar o
	 * retorno: antes, o erro aparecia e o formulário se fechava e se limpava
	 * assim mesmo, e o operador tinha de reabrir e redigitar tudo.
	 *
	 * `success` pode ser uma função do resultado — a mesma ação às vezes lança,
	 * às vezes só registra e manda para aprovação, e as duas coisas não se
	 * anunciam com a mesma frase.
	 */
	async function run<T>(action: () => Promise<T>, success: string | ((result: T) => string)): Promise<boolean> {
		setBusy(true)
		try {
			const result = await action()
			toast.success(typeof success === "function" ? success(result) : success)
			await router.invalidate()
			return true
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro na ação")
			return false
		} finally {
			setBusy(false)
		}
	}

	const byBand = new Map<ExpiryBand, ExpiryLotRow[]>()
	for (const lot of expiring.lots) {
		const list = byBand.get(lot.band) ?? []
		list.push(lot)
		byBand.set(lot.band, list)
	}

	const kitchenPolicies = policies.filter((policy) => policy.scope === "kitchen")
	const globalPolicies = policies.filter((policy) => policy.scope === "global")

	return (
		<div className="space-y-4">
			<PageHeader title="Vencimentos" description="O que já venceu, o que vence dentro do limite da cozinha e o perecível que entrou sem validade." />

			<div className="grid gap-3 sm:grid-cols-3">
				<Card>
					<CardContent className="pt-4">
						<p className="text-xs text-muted-foreground">Vencido + crítico</p>
						<p className="text-heading">{expiring.totals.expired.lots + expiring.totals.critical.lots} lote(s)</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-xs text-muted-foreground">Valor em risco</p>
						<p className="text-heading">{BRL.format(expiring.totals.expired.value + expiring.totals.critical.value)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-xs text-muted-foreground">Perecível sem validade</p>
						<p className="text-heading">{expiring.totals.no_expiry.lots} lote(s)</p>
					</CardContent>
				</Card>
			</div>

			{expiring.total > expiring.lots.length && (
				<Card>
					<CardContent className="pt-4 text-sm text-muted-foreground">
						Mostrando {expiring.lots.length} de {expiring.total} lotes. Resolva os mais urgentes e recarregue.
					</CardContent>
				</Card>
			)}

			{(["expired", "critical", "warning", "no_expiry"] as const).map((band) => {
				const lots = byBand.get(band) ?? []
				if (lots.length === 0) return null
				return (
					<Card key={band}>
						<CardHeader className="pb-2">
							<CardTitle className="flex items-center gap-2 text-subheading">
								{band === "expired" ? (
									<Trash2 className="size-4" />
								) : band === "no_expiry" ? (
									<AlertTriangle className="size-4" />
								) : (
									<CalendarClock className="size-4" />
								)}
								{EXPIRY_BAND_LABELS[band]}
								<Badge variant="secondary">{lots.length}</Badge>
								<span className="ml-auto text-xs font-normal text-muted-foreground">{BRL.format(expiring.totals[band].value)}</span>
							</CardTitle>
							<p className="text-xs text-muted-foreground">{BAND_HINTS[band]}</p>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Item</TableHead>
										<TableHead>Lote</TableHead>
										<TableHead>Local</TableHead>
										<TableHead>Validade</TableHead>
										<TableHead className="text-right">Saldo</TableHead>
										<TableHead className="text-right">Valor</TableHead>
										<TableHead>Ações</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{lots.map((lot) => (
										<TableRow key={lot.lotId}>
											<TableCell>
												<div className="font-medium">{lot.description}</div>
												<div className="text-xs text-muted-foreground">
													{lot.conservationClass ? CONSERVATION_LABELS[lot.conservationClass as ConservationClass] : "sem classe"} · limite {lot.alertDays}d
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs">
												{lot.shortCode ?? lot.lotCode ?? "—"}
												{lot.quarantined && (
													<Badge variant="outline" className="ml-2 text-warning">
														quarentena
													</Badge>
												)}
												{lot.useFirst && (
													<Badge variant="outline" className="ml-2">
														usar primeiro
													</Badge>
												)}
											</TableCell>
											<TableCell className="text-xs">{lot.location ?? "—"}</TableCell>
											<TableCell className="text-xs">
												{lot.expiryDate ?? "—"}
												<div className="text-muted-foreground">{describeDays(lot.daysLeft)}</div>
											</TableCell>
											<TableCell className="text-right">
												{NUM.format(lot.balance)} {lot.measureUnit ?? ""}
											</TableCell>
											<TableCell className="text-right">{BRL.format(lot.balanceValue)}</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{band !== "expired" && (
														<Button
															type="button"
															size="sm"
															variant={lot.useFirst ? "secondary" : "outline"}
															disabled={busy}
															onClick={() =>
																run(
																	() => setLotUseFirstFn({ data: { lotId: lot.lotId, useFirst: !lot.useFirst } }),
																	lot.useFirst ? "Marca removida" : "Lote vai sair primeiro"
																)
															}
														>
															<Star className="mr-1 size-3" />
															{lot.useFirst ? "Desmarcar" : "Usar primeiro"}
														</Button>
													)}
													{band !== "expired" && (
														<Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setTransferLot(lot)}>
															<ArrowRightLeft className="mr-1 size-3" />
															Transferir
														</Button>
													)}
													{!lot.quarantined && (
														<Button
															type="button"
															size="sm"
															variant="outline"
															disabled={busy}
															onClick={() => {
																const reason = window.prompt("Motivo da quarentena (mínimo 5 caracteres):")
																if (!reason || reason.trim().length < 5) {
																	toast.error("Quarentena exige motivo")
																	return
																}
																void run(() => quarantineLotFn({ data: { lotId: lot.lotId, reason } }), "Lote em quarentena")
															}}
														>
															<ShieldAlert className="mr-1 size-3" />
															Quarentena
														</Button>
													)}
													{band === "expired" && (
														<Button
															type="button"
															size="sm"
															variant="destructive"
															// baixa já registrada e esperando aprovação: um segundo clique
															// criaria outra baixa do saldo inteiro do mesmo lote
															disabled={busy || lot.pendingWriteOff}
															title={lot.pendingWriteOff ? "Baixa deste lote aguardando aprovação" : undefined}
															onClick={() =>
																run(
																	() =>
																		createAdjustmentFn({
																			data: {
																				kitchenId,
																				items: [
																					{
																						lotId: lot.lotId,
																						direction: "out",
																						quantity: lot.balance,
																						reasonCode: "expired",
																						note: `Baixa do lote vencido em ${lot.expiryDate ?? "data desconhecida"}`,
																					},
																				],
																			},
																		}),
																	// Acima da alçada o ajuste NÃO lança: vai para aprovação.
																	// Dizer "baixa lançada" aí fazia a tela afirmar sucesso
																	// onde o saldo não mudou.
																	(result) =>
																		result.status === "posted"
																			? "Baixa lançada"
																			: "Baixa registrada e enviada para aprovação — o lote segue no saldo até alguém aprovar"
																)
															}
														>
															<Trash2 className="mr-1 size-3" />
															{lot.pendingWriteOff ? "Baixa pendente" : "Baixar"}
														</Button>
													)}
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				)
			})}

			{expiring.total === 0 && (
				<Card>
					<CardContent className="pt-4 text-sm text-muted-foreground">
						Nenhum lote vencido, crítico ou sem validade. Isto é o estado bom — e não quer dizer que a tela esteja quebrada.
					</CardContent>
				</Card>
			)}

			{transferLot && (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-subheading">Transferir {transferLot.description}</CardTitle>
						<p className="text-xs text-muted-foreground">
							Saldo do lote: {NUM.format(transferLot.balance)} {transferLot.measureUnit ?? ""} · {describeDays(transferLot.daysLeft)}
						</p>
					</CardHeader>
					<CardContent className="flex flex-wrap items-end gap-2">
						<div className="space-y-1">
							<Label htmlFor="transfer-kitchen">Cozinha de destino (id)</Label>
							<Input
								id="transfer-kitchen"
								className="w-40"
								inputMode="numeric"
								value={transferKitchenId}
								onChange={(event) => setTransferKitchenId(event.target.value)}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="transfer-qty">Quantidade</Label>
							<Input
								id="transfer-qty"
								className="w-32"
								inputMode="decimal"
								value={transferQuantity}
								onChange={(event) => setTransferQuantity(event.target.value)}
							/>
						</div>
						<Button
							type="button"
							disabled={busy}
							onClick={async () => {
								const toKitchenId = Number(transferKitchenId)
								const quantity = Number(transferQuantity.replace(",", "."))
								if (!Number.isInteger(toKitchenId) || toKitchenId <= 0) {
									toast.error("Informe a cozinha de destino")
									return
								}
								if (!Number.isFinite(quantity) || quantity <= 0) {
									toast.error("Informe a quantidade")
									return
								}
								const ok = await run(() => createTransferFn({ data: { lotId: transferLot.lotId, toKitchenId, quantity } }), "Transferência registrada")
								if (!ok) return
								setTransferLot(null)
								setTransferKitchenId("")
								setTransferQuantity("")
							}}
						>
							Transferir
						</Button>
						<Button type="button" variant="ghost" disabled={busy} onClick={() => setTransferLot(null)}>
							Cancelar
						</Button>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-subheading">Antecedência do alerta</CardTitle>
					<p className="text-xs text-muted-foreground">
						Sem política, valem os defaults: resfriado {EXPIRY_DEFAULT_ALERT_DAYS.resfriado} dias, congelado {EXPIRY_DEFAULT_ALERT_DAYS.congelado}, demais{" "}
						{EXPIRY_DEFAULT_ALERT_DAYS.outras}. A política da cozinha vence a global.
					</p>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex flex-wrap items-end gap-2">
						<div className="space-y-1">
							<Label htmlFor="policy-class">Classe de conservação</Label>
							<Select value={policyClass || null} onValueChange={(value) => setPolicyClass((value as ConservationClass) ?? "")}>
								<SelectTrigger id="policy-class" className="w-56">
									<SelectValue>{policyClass ? CONSERVATION_LABELS[policyClass] : "Escolha a classe"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{CONSERVATION_CLASSES.map((value) => (
										<SelectItem key={value} value={value}>
											{CONSERVATION_LABELS[value]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="policy-days">Dias de antecedência</Label>
							<Input id="policy-days" className="w-32" inputMode="numeric" value={policyDays} onChange={(event) => setPolicyDays(event.target.value)} />
						</div>
						<Button
							type="button"
							disabled={busy || !policyClass}
							onClick={async () => {
								const alertDays = Number(policyDays)
								if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 365) {
									toast.error("Informe um número de dias entre 0 e 365")
									return
								}
								if (!policyClass) return
								const ok = await run(() => saveExpiryPolicyFn({ data: { kitchenId, conservationClass: policyClass, alertDays } }), "Política salva")
								if (ok) setPolicyDays("")
							}}
						>
							Salvar
						</Button>
					</div>

					{kitchenPolicies.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Alvo</TableHead>
									<TableHead className="text-right">Dias</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{kitchenPolicies.map((policy) => (
									<TableRow key={policy.id}>
										<TableCell>
											{policy.ingredientName ?? (policy.conservationClass ? CONSERVATION_LABELS[policy.conservationClass as ConservationClass] : "—")}
										</TableCell>
										<TableCell className="text-right">{policy.alertDays}</TableCell>
										<TableCell className="text-right">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												disabled={busy}
												onClick={() => run(() => deleteExpiryPolicyFn({ data: { policyId: policy.id } }), "Política removida")}
											>
												Remover
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}

					{globalPolicies.length > 0 && (
						<p className="text-xs text-muted-foreground">{globalPolicies.length} política(s) global(is) em vigor onde a cozinha não definiu a sua.</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
