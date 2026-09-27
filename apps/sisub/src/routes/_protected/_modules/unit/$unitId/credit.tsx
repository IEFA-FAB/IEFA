import { creditNotesAboveLines } from "@iefa/sisub-domain"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Landmark, TriangleAlert } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { CreditNotesCard } from "@/components/features/finance/CreditNotesCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type BudgetCreditLine, fetchBudgetCreditFn, listCreditNotesFn } from "@/server/budget.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/credit")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: async ({ params }) => {
		const unitId = Number(params.unitId)
		const [lines, notes] = await Promise.all([fetchBudgetCreditFn({ data: { unitId } }), listCreditNotesFn({ data: { unitId } })])
		return { lines, notes }
	},
	component: BudgetCreditPage,
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function fmtCompetencia(iso: string): string {
	const [year, month] = iso.substring(0, 7).split("-")
	return `${month}/${year}`
}

function BudgetRow({ line }: { line: BudgetCreditLine }) {
	const negative = line.saldoProjetado < 0
	// NC registradas que não fecham com o crédito recebido do SIAFI: falta NC (ou sobra)
	const ncDiverge = line.notasCredito !== 0 && Math.abs(line.notasCredito - line.receivedCredit) > 0.009

	return (
		<tr className="hover:bg-muted/40">
			<td className="py-2.5 px-3 text-xs font-mono">{line.nd}</td>
			<td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{line.ptres ?? "—"}</td>
			<td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{line.fonte ?? "—"}</td>
			<td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{[line.pi, line.ugr].map((v) => v ?? "—").join(" · ")}</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">{BRL.format(line.receivedCredit)}</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">
				{line.notasCredito === 0 ? (
					<span className="text-muted-foreground">—</span>
				) : (
					<Tooltip>
						<TooltipTrigger className="cursor-help inline-flex items-center gap-1">
							{BRL.format(line.notasCredito)}
							{ncDiverge && <Badge variant="warning">não fecha</Badge>}
						</TooltipTrigger>
						<TooltipContent>
							{ncDiverge
								? "A soma das NC registradas no sisub não fecha com o crédito recebido do SIAFI: falta registrar NC, ou uma foi registrada em outra classificação."
								: "Soma das NC registradas no sisub nesta classificação e exercício. Fecha com o crédito recebido do SIAFI."}
						</TooltipContent>
					</Tooltip>
				)}
			</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted-foreground">{BRL.format(line.empenhadoSiafi)}</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">
				<Tooltip>
					<TooltipTrigger className="cursor-help underline decoration-dotted">{BRL.format(line.availableCreditSiafi)}</TooltipTrigger>
					<TooltipContent>
						Crédito disponível no SIAFI em {new Date(line.snapshotAt).toLocaleString("pt-BR")}. Não inclui empenhos lançados depois no sisub.
					</TooltipContent>
				</Tooltip>
			</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">
				{line.comprometimentoLocal !== 0 ? (
					<Tooltip>
						<TooltipTrigger className="cursor-help underline decoration-dotted text-warning">{BRL.format(line.comprometimentoLocal)}</TooltipTrigger>
						<TooltipContent>
							Empenhos desta classificação (ND, PTRES, fonte e exercício) lançados no sisub após o snapshot, pelo valor vigente. Reforço e anulação posteriores
							entram também. Não se somam ao saldo oficial.
						</TooltipContent>
					</Tooltip>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</td>
			<td className={`py-2.5 px-2 text-xs text-right tabular-nums text-subheading ${negative ? "text-destructive" : ""}`}>{BRL.format(line.saldoProjetado)}</td>
			<td className="py-2.5 px-2 text-xs text-right">
				<span suppressHydrationWarning className={line.snapshotStale ? "text-warning inline-flex items-center gap-1" : "text-muted-foreground"}>
					{line.snapshotStale && <TriangleAlert className="size-3.5" />}
					{line.snapshotAgeDays === 0 ? "hoje" : `${line.snapshotAgeDays}d`}
				</span>
			</td>
		</tr>
	)
}

function BudgetCreditPage() {
	const { lines, notes } = Route.useLoaderData()
	const { unitId } = Route.useParams()
	const router = useRouter()
	const stale = lines.filter((line) => line.snapshotStale).length
	// NC num nível mais genérico que as linhas (ex.: no elemento 339030, linhas nos
	// subelementos): aparece UMA vez aqui, em vez de somada em cada linha irmã.
	const notesAbove = creditNotesAboveLines(
		lines,
		notes.map((note) => ({
			tipo: note.kind,
			valor: note.amount,
			dataEmissao: note.issued_on,
			ugFavorecida: note.beneficiary_ug,
			nd: note.nd,
			ptres: note.ptres,
			fonte: note.fonte,
		}))
	)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Crédito Disponível"
				description="Snapshot do SIAFI (importado do Tesouro Gerencial) ao lado do comprometimento local do sisub, por classificação. As duas grandezas têm origens diferentes e nunca são somadas — o saldo projetado é a leitura derivada."
			/>

			{stale > 0 && (
				<Card>
					<CardContent className="pt-4 flex items-center gap-2 text-xs text-warning">
						<TriangleAlert className="size-4 shrink-0" />
						{stale} classificação(ões) com snapshot de mais de 7 dias — importe um relatório de crédito atualizado para decidir com dado fresco.
					</CardContent>
				</Card>
			)}

			<Card>
				<CardContent className="px-0 pb-0 pt-2">
					{lines.length === 0 ? (
						<div className="text-center py-10 text-muted-foreground">
							<Landmark className="size-8 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Nenhum crédito importado. Suba um relatório de crédito do Tesouro Gerencial na aba SIAFI.</p>
						</div>
					) : (
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
									<th className="py-2 px-3 text-left text-label w-28">ND</th>
									<th className="py-2 px-2 text-left text-label w-24">PTRES</th>
									<th className="py-2 px-2 text-left text-label w-20">Fonte</th>
									<th className="py-2 px-2 text-left text-label w-28">PI · UGR</th>
									<th className="py-2 px-2 text-right text-label w-32">
										<Tooltip>
											<TooltipTrigger className="cursor-help">Crédito recebido</TooltipTrigger>
											<TooltipContent>
												Numa UG executora não há dotação (ela é da LOA, do órgão): há crédito descentralizado por nota de crédito (provisão ou destaque). É esse
												o valor desta coluna.
											</TooltipContent>
										</Tooltip>
									</th>
									<th className="py-2 px-2 text-right text-label w-32">NC registradas</th>
									<th className="py-2 px-2 text-right text-label w-32">Empenhado (SIAFI)</th>
									<th className="py-2 px-2 text-right text-label w-32">Disponível (SIAFI)</th>
									<th className="py-2 px-2 text-right text-label w-36">Comprometido (local)</th>
									<th className="py-2 px-2 text-right text-label w-32">Saldo projetado</th>
									<th className="py-2 px-2 text-right text-label w-20">Snapshot</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/60">
								{lines.map((line) => (
									<BudgetRow key={line.id} line={line} />
								))}
							</tbody>
						</table>
					)}
				</CardContent>
			</Card>

			{lines.length > 0 && (
				<p className="text-xs text-muted-foreground">
					Competência mais recente: {fmtCompetencia(lines[0]?.competencia ?? "")}. O sisub não recalcula o saldo oficial — ele reflete o SIAFI e mostra o que
					foi comprometido aqui depois da captura, na mesma classificação.
				</p>
			)}

			{lines.length > 0 && notesAbove.length > 0 && (
				<p className="text-xs text-muted-foreground">
					NC registradas num nível acima das linhas, que não se repartem entre elas:{" "}
					{notesAbove
						.map(
							(group) =>
								`ND ${group.nd}${group.ptres ? ` · PTRES ${group.ptres}` : ""}${group.fonte ? ` · fonte ${group.fonte}` : ""} (${group.exercicio ?? "—"}): ${BRL.format(group.total)}`
						)
						.join("; ")}
					.
				</p>
			)}

			<CreditNotesCard unitId={Number(unitId)} notes={notes} onChanged={() => router.invalidate()} />
		</div>
	)
}
