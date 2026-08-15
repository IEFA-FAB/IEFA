import { createFileRoute } from "@tanstack/react-router"
import { Landmark, TriangleAlert } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { type BudgetCreditLine, fetchBudgetCreditFn } from "@/server/budget.fn"

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/credit")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	loader: ({ params }) => fetchBudgetCreditFn({ data: { unitId: Number(params.unitId) } }),
	component: BudgetCreditPage,
	head: () => ({
		meta: [{ title: "Crédito Disponível — SISUB" }],
	}),
})

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function fmtCompetencia(iso: string): string {
	const [year, month] = iso.substring(0, 7).split("-")
	return `${month}/${year}`
}

function BudgetRow({ line }: { line: BudgetCreditLine }) {
	const negative = line.saldoProjetado < 0

	return (
		<tr className="hover:bg-muted/40">
			<td className="py-2.5 px-3 text-xs font-mono">{line.nd}</td>
			<td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{line.ptres ?? "—"}</td>
			<td className="py-2.5 px-2 text-xs font-mono text-muted-foreground">{line.fonte ?? "—"}</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">{BRL.format(line.dotacao)}</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums text-muted-foreground">{BRL.format(line.empenhadoSiafi)}</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">
				<Tooltip>
					<TooltipTrigger className="cursor-help underline decoration-dotted">{BRL.format(line.saldoSiafi)}</TooltipTrigger>
					<TooltipContent className="max-w-xs">
						Saldo conforme o SIAFI no momento do snapshot ({new Date(line.snapshotAt).toLocaleString("pt-BR")}). Não inclui empenhos lançados no sisub depois
						disso.
					</TooltipContent>
				</Tooltip>
			</td>
			<td className="py-2.5 px-2 text-xs text-right tabular-nums">
				{line.comprometimentoLocal > 0 ? (
					<Tooltip>
						<TooltipTrigger className="cursor-help underline decoration-dotted text-warning">{BRL.format(line.comprometimentoLocal)}</TooltipTrigger>
						<TooltipContent className="max-w-xs">
							Empenhos ativos registrados no sisub APÓS o snapshot — grandeza distinta do oficial, nunca somada a ele.
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
	const lines = Route.useLoaderData()
	const stale = lines.filter((line) => line.snapshotStale).length

	return (
		<div className="space-y-6">
			<PageHeader
				title="Crédito Disponível"
				description="Snapshot do SIAFI (importado do Tesouro Gerencial) ao lado do comprometimento local do sisub. As duas grandezas têm origens diferentes e nunca são somadas — o saldo projetado é a leitura derivada."
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
									<th className="py-2 px-2 text-right text-label w-32">Dotação</th>
									<th className="py-2 px-2 text-right text-label w-32">Empenhado (SIAFI)</th>
									<th className="py-2 px-2 text-right text-label w-32">Saldo (SIAFI)</th>
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
					foi comprometido aqui depois da captura.
				</p>
			)}
		</div>
	)
}
