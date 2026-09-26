import { FileText, Trash2 } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAssuredAction } from "@/hooks/auth/useAssuredAction"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { type CreditNoteRow, createCreditNoteFn, deleteCreditNoteFn } from "@/server/budget.fn"

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

const KIND_LABELS: Record<CreditNoteRow["kind"], string> = {
	descentralizacao: "Descentralização",
	anulacao: "Anulação / devolução",
}

const SPHERE_LABELS: Record<"1" | "2" | "3", string> = {
	"1": "1 · Fiscal",
	"2": "2 · Seguridade social",
	"3": "3 · Investimento",
}

const EMPTY = {
	number: "",
	issuedOn: new Date().toISOString().substring(0, 10),
	kind: "descentralizacao" as CreditNoteRow["kind"],
	issuerUg: "",
	beneficiaryUg: "",
	budgetSphere: null as "1" | "2" | "3" | null,
	nd: "",
	ptres: "",
	fonte: "",
	pi: "",
	ugr: "",
	amount: "",
	notes: "",
}

/**
 * Notas de Crédito recebidas pela UG: o documento que traz (ou devolve) o crédito que o
 * snapshot do SIAFI mostra como saldo. Registrar a NC é registro do ato já feito no SIAFI.
 */
export function CreditNotesCard({ unitId, notes, onChanged }: { unitId: number; notes: CreditNoteRow[]; onChanged: () => void }) {
	const [form, setForm] = useState(EMPTY)
	const [busy, setBusy] = useState(false)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	// `createCreditNoteFn`/`deleteCreditNoteFn` são `"session"` no registro de garantia (`unit` nível 2).
	const runAssured = useAssuredAction()

	const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((current) => ({ ...current, [key]: value }))

	async function submit(event: React.SyntheticEvent) {
		event.preventDefault()
		const amount = Number(form.amount)
		if (!form.number.trim() || !(amount > 0)) return
		setBusy(true)
		try {
			await runAssured(() =>
				createCreditNoteFn({
					data: {
						unitId,
						number: form.number,
						issuedOn: form.issuedOn,
						kind: form.kind,
						issuerUg: form.issuerUg,
						beneficiaryUg: form.beneficiaryUg,
						budgetSphere: form.budgetSphere,
						nd: form.nd.replace(/\D/g, ""),
						ptres: form.ptres,
						fonte: form.fonte,
						pi: form.pi,
						ugr: form.ugr,
						amount,
						notes: form.notes,
					},
				})
			)
			toast.success(`NC ${form.number.toUpperCase()} registrada`)
			setForm({ ...EMPTY, issuedOn: form.issuedOn, issuerUg: form.issuerUg, beneficiaryUg: form.beneficiaryUg })
			onChanged()
		} catch (err) {
			// Desistir da confirmação de identidade não é falha: o formulário continua preenchido.
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao registrar a nota de crédito")
		} finally {
			setBusy(false)
		}
	}

	async function remove(note: CreditNoteRow) {
		setDeletingId(note.id)
		try {
			await runAssured(() => deleteCreditNoteFn({ data: { unitId, creditNoteId: note.id } }))
			toast.success(`NC ${note.number} apagada`)
			onChanged()
		} catch (err) {
			if (!isElevationCancelled(err)) toast.error(err instanceof Error ? err.message : "Falha ao apagar a nota de crédito")
		} finally {
			setDeletingId(null)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notas de crédito</CardTitle>
				<CardDescription>
					A NC é o documento que traz o crédito à UG (provisão ou destaque) ou o devolve. Registre aqui as que chegaram; a coluna “NC registradas” da tabela
					acima confere a soma com o crédito recebido do SIAFI.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<form onSubmit={submit}>
					<FieldGroup className="grid sm:grid-cols-4">
						<Field>
							<FieldLabel htmlFor="nc-number">Número da NC *</FieldLabel>
							<Input id="nc-number" value={form.number} onChange={(e) => set("number", e.target.value.toUpperCase())} placeholder="2026NC000123" required />
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-date">Emissão *</FieldLabel>
							<Input id="nc-date" type="date" value={form.issuedOn} onChange={(e) => set("issuedOn", e.target.value)} required />
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-kind">Tipo</FieldLabel>
							<Select value={form.kind} onValueChange={(value) => value && set("kind", value as CreditNoteRow["kind"])}>
								<SelectTrigger id="nc-kind">
									<SelectValue>{KIND_LABELS[form.kind]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="descentralizacao">{KIND_LABELS.descentralizacao}</SelectItem>
									<SelectItem value="anulacao">{KIND_LABELS.anulacao}</SelectItem>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-amount">Valor (R$) *</FieldLabel>
							<Input id="nc-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} required />
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-issuer">UG emitente</FieldLabel>
							<Input
								id="nc-issuer"
								inputMode="numeric"
								maxLength={6}
								value={form.issuerUg}
								onChange={(e) => set("issuerUg", e.target.value.replace(/\D/g, ""))}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-beneficiary">UG favorecida</FieldLabel>
							<Input
								id="nc-beneficiary"
								inputMode="numeric"
								maxLength={6}
								value={form.beneficiaryUg}
								onChange={(e) => set("beneficiaryUg", e.target.value.replace(/\D/g, ""))}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-sphere">Esfera</FieldLabel>
							<Select value={form.budgetSphere ?? null} onValueChange={(value) => set("budgetSphere", (value as "1" | "2" | "3" | null) ?? null)}>
								<SelectTrigger id="nc-sphere">
									<SelectValue>{form.budgetSphere ? SPHERE_LABELS[form.budgetSphere] : "Não informada"}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{(["1", "2", "3"] as const).map((sphere) => (
										<SelectItem key={sphere} value={sphere}>
											{SPHERE_LABELS[sphere]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-nd">Natureza de despesa</FieldLabel>
							<Input
								id="nc-nd"
								inputMode="numeric"
								maxLength={8}
								value={form.nd}
								onChange={(e) => set("nd", e.target.value.replace(/\D/g, ""))}
								placeholder="339030"
							/>
							<FieldDescription>6 ou 8 dígitos, sem pontos.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-ptres">PTRES</FieldLabel>
							<Input id="nc-ptres" value={form.ptres} onChange={(e) => set("ptres", e.target.value)} />
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-fonte">Fonte</FieldLabel>
							<Input id="nc-fonte" value={form.fonte} onChange={(e) => set("fonte", e.target.value)} />
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-pi">PI</FieldLabel>
							<Input id="nc-pi" value={form.pi} onChange={(e) => set("pi", e.target.value.toUpperCase())} />
						</Field>
						<Field>
							<FieldLabel htmlFor="nc-ugr">UGR</FieldLabel>
							<Input id="nc-ugr" value={form.ugr} onChange={(e) => set("ugr", e.target.value)} />
						</Field>
						<Field className="sm:col-span-3">
							<FieldLabel htmlFor="nc-notes">Observação</FieldLabel>
							<Input id="nc-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
						</Field>
						<div className="flex items-end justify-end">
							<Button type="submit" size="sm" disabled={busy || !form.number.trim() || !(Number(form.amount) > 0)}>
								{busy ? <Spinner className="size-3.5" /> : "Registrar NC"}
							</Button>
						</div>
					</FieldGroup>
				</form>

				{notes.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<FileText className="size-8 mx-auto mb-2" />
						<p className="text-body">Nenhuma nota de crédito registrada.</p>
					</div>
				) : (
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="text-label">NC</TableHead>
									<TableHead className="text-label">Emissão</TableHead>
									<TableHead className="text-label">Tipo</TableHead>
									<TableHead className="text-label">UG emitente → favorecida</TableHead>
									<TableHead className="text-label">ND · PTRES · Fonte</TableHead>
									<TableHead className="text-label">PI · UGR</TableHead>
									<TableHead className="text-label text-right">Valor</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{notes.map((note) => (
									<TableRow key={note.id}>
										<TableCell className="font-mono text-caption">{note.number}</TableCell>
										<TableCell className="text-caption text-muted-foreground">{note.issued_on}</TableCell>
										<TableCell>
											<Badge variant={note.kind === "anulacao" ? "warning" : "secondary"}>{KIND_LABELS[note.kind]}</Badge>
										</TableCell>
										<TableCell className="font-mono text-caption text-muted-foreground">
											{note.issuer_ug ?? "—"} → {note.beneficiary_ug ?? "—"}
										</TableCell>
										<TableCell className="font-mono text-caption">{[note.nd, note.ptres, note.fonte].map((v) => v ?? "—").join(" · ")}</TableCell>
										<TableCell className="font-mono text-caption text-muted-foreground">{[note.pi, note.ugr].map((v) => v ?? "—").join(" · ")}</TableCell>
										<TableCell className="text-caption text-right tabular-nums">
											{note.kind === "anulacao" ? "−" : ""}
											{BRL.format(note.amount)}
										</TableCell>
										<TableCell className="text-right">
											{note.origin === "manual" && (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																size="icon-sm"
																variant="ghost"
																aria-label={`Apagar a NC ${note.number}`}
																disabled={deletingId === note.id}
																onClick={() => remove(note)}
															/>
														}
													>
														{deletingId === note.id ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
													</TooltipTrigger>
													<TooltipContent>Apagar o registro feito por engano. A anulação de uma NC verdadeira é outra NC, do tipo anulação.</TooltipContent>
												</Tooltip>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
