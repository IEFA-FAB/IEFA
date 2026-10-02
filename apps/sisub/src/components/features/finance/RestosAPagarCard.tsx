import { RESTOS_A_PAGAR_LABELS } from "@iefa/sisub-domain"
import { getBrasiliaYear } from "@iefa/sisub-domain/civil-date"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { useAssuredAction } from "@/hooks/auth/useAssuredAction"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { inscribeRpParcelsFn, previewRestosAPagarFn } from "@/server/restos-a-pagar.fn"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/**
 * Encerramento do exercício: cada empenho com saldo vira até DUAS parcelas de restos a pagar —
 * processado (liquidado e não pago) e não processado (empenhado e não liquidado), Lei 4.320,
 * art. 36. A conta é sobre o saldo de 31/12, não o de hoje. Rodar de novo não soma nada: ou o
 * conjunto já é o de 31/12, ou ele é recalculado e substituído (com trilha).
 */
export function RestosAPagarCard({ unitId }: { unitId: number }) {
	const [exercicio, setExercicio] = useState(getBrasiliaYear())
	const [busy, setBusy] = useState(false)
	const queryClient = useQueryClient()
	// `inscribeRpParcelsFn` é `"session"` no registro de garantia (`unit` nível 3).
	const runAssured = useAssuredAction()
	const queryKey = ["sisub", "restos-a-pagar", unitId, exercicio] as const
	const preview = useQuery({
		queryKey,
		queryFn: () => previewRestosAPagarFn({ data: { unitId, exercicio } }),
		enabled: exercicio >= 2000 && exercicio <= 2100,
	})

	const rows = (preview.data?.rows ?? []).filter((row) => row.processado > 0 || row.naoProcessado > 0 || row.inscribed.length > 0)
	const totals = rows.reduce((acc, row) => ({ processado: acc.processado + row.processado, naoProcessado: acc.naoProcessado + row.naoProcessado }), {
		processado: 0,
		naoProcessado: 0,
	})
	// a regra é a do servidor (`reconcileRestosAPagar`): só há o que fazer quando o conjunto
	// gravado não é o saldo de 31/12
	const pending = preview.data?.hasPending === true

	async function inscribe() {
		setBusy(true)
		try {
			const result = await runAssured(() => inscribeRpParcelsFn({ data: { unitId, exercicio } }))
			toast.success(
				result.empenhos === 0
					? "Nada a inscrever: as parcelas deste exercício já são o saldo de 31/12."
					: [
							`${result.parcelas} parcela(s) em ${result.empenhos} empenho(s): ${BRL.format(result.processado)} processados e ${BRL.format(result.naoProcessado)} não processados.`,
							result.migrated > 0 ? `${result.migrated} migrado(s) da inscrição antiga.` : null,
							result.replaced > 0 ? `${result.replaced} recalculado(s): o saldo de 31/12 mudou e as parcelas anteriores ficaram como histórico.` : null,
						]
							.filter(Boolean)
							.join(" ")
			)
			await queryClient.invalidateQueries({ queryKey })
		} catch (err) {
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao inscrever restos a pagar")
		} finally {
			setBusy(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Restos a pagar</CardTitle>
				<CardDescription>
					No encerramento do exercício, o saldo de cada empenho se divide em RP processado (liquidado e não pago, inclusive retenção ainda não recolhida) e RP
					não processado (empenhado e não liquidado). O mesmo empenho pode ter os dois.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex flex-wrap items-end gap-3">
					<Field className="w-32">
						<FieldLabel htmlFor="rp-exercicio">Exercício</FieldLabel>
						<Input id="rp-exercicio" type="number" min={2000} max={2100} value={exercicio} onChange={(e) => setExercicio(Number(e.target.value))} />
					</Field>
					<Button size="sm" onClick={inscribe} disabled={busy || !pending}>
						{busy ? <Spinner className="size-3.5" /> : "Inscrever em restos a pagar"}
					</Button>
					{!pending && rows.length > 0 && <p className="text-caption text-muted-foreground">As parcelas deste exercício já são o saldo de 31/12.</p>}
				</div>

				{preview.isLoading ? (
					<Spinner className="size-4" />
				) : rows.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<CalendarClock className="size-8 mx-auto mb-2" />
						<p className="text-body">Nenhum empenho do exercício com saldo a inscrever.</p>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="text-label">Empenho</TableHead>
									<TableHead className="text-label">Favorecido</TableHead>
									<TableHead className="text-label text-right">{RESTOS_A_PAGAR_LABELS.processado}</TableHead>
									<TableHead className="text-label text-right">{RESTOS_A_PAGAR_LABELS.nao_processado}</TableHead>
									<TableHead className="text-label">Inscrito</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.empenhoId}>
										<TableCell className="font-mono text-caption">{row.numeroEmpenho}</TableCell>
										<TableCell className="text-caption">{row.favorecido ?? "—"}</TableCell>
										<TableCell className="text-caption text-right tabular-nums">{row.processado > 0 ? BRL.format(row.processado) : "—"}</TableCell>
										<TableCell className="text-caption text-right tabular-nums">{row.naoProcessado > 0 ? BRL.format(row.naoProcessado) : "—"}</TableCell>
										<TableCell className="space-x-1">
											{row.inscribed.length === 0 ? (
												<Badge variant="outline">{row.action === "migrate_legacy" ? "inscrição antiga (migrar)" : "não inscrito"}</Badge>
											) : (
												row.inscribed.map((parcel) => (
													<Badge key={parcel.kind} variant="secondary">
														{parcel.kind === "processado" ? "proc." : "não proc."} {BRL.format(parcel.amount)}
													</Badge>
												))
											)}
											{row.action === "replace" && <Badge variant="warning">saldo de 31/12 mudou: recalcular</Badge>}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
							<TableFooter>
								<TableRow>
									<TableCell colSpan={2} className="text-caption">
										Total do exercício
									</TableCell>
									<TableCell className="text-caption text-right tabular-nums">{BRL.format(totals.processado)}</TableCell>
									<TableCell className="text-caption text-right tabular-nums">{BRL.format(totals.naoProcessado)}</TableCell>
									<TableCell />
								</TableRow>
							</TableFooter>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
