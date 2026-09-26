import { createFileRoute, useParams } from "@tanstack/react-router"
import { useState } from "react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { AcquisitionsPanel } from "@/components/features/unit/acquisition/AcquisitionsPanel"
import { PageHeader } from "@/components/layout/PageHeader"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAcquisitionsOverview } from "@/hooks/data/useAcquisitions"
import { currentFiscalYear } from "@/lib/expense-execution"

/**
 * GESTÃO UNIDADE — Contratações de origem
 * URL: /unit/:unitId/acquisitions
 *
 * De onde vem o direito de gastar de cada empenho: ata própria ou de outro órgão, dispensa,
 * inexigibilidade, contrato, Contrata+Brasil, suprimento de fundos. Nasce incompleta e se completa
 * no próprio card; dispensa por valor mostra o somatório do exercício (Lei 14.133/2021, art. 75,
 * § 1º). Mesma palavra "contratação" da Segmentação, outro momento: lá é o processo planejado,
 * aqui o que já foi contratado.
 */
export const Route = createFileRoute("/_protected/_modules/unit/$unitId/acquisitions")({
	beforeLoad: (opts) => requirePermission(opts, "unit", 1),
	component: AcquisitionsPage,
	head: () => ({ meta: [{ name: "description", content: "Contratações de origem da unidade: o que sustenta cada empenho" }] }),
})

function AcquisitionsPage() {
	const { unitId: unitIdStr } = useParams({ strict: false })
	const unitId = Number(unitIdStr)
	const { can } = usePBAC()
	const thisYear = currentFiscalYear()
	// O somatório da dispensa é do exercício (art. 75, § 1º, I): a tela mostra um por vez.
	const [fiscalYear, setFiscalYear] = useState(thisYear)
	const { data: overview, isLoading, isError, error } = useAcquisitionsOverview(unitId, fiscalYear)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Contratações de origem"
				description="O que sustenta cada empenho: a ata (própria ou de outro órgão), o contrato, a dispensa, a inexigibilidade. Registre com o mínimo e complete depois; o que falta aparece como pendência."
			/>
			<div className="flex items-center gap-2">
				<span className="text-caption text-muted-foreground">Exercício</span>
				<Select value={String(fiscalYear)} onValueChange={(next) => next && setFiscalYear(Number(next))}>
					<SelectTrigger aria-label="Exercício" className="w-28">
						<SelectValue>{fiscalYear}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((year) => (
							<SelectItem key={year} value={String(year)}>
								{year}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{isLoading ? (
				<div className="h-48 animate-pulse rounded-md border bg-muted" aria-hidden="true" />
			) : isError || !overview ? (
				<p className="text-body text-destructive">Não foi possível carregar as contratações{error instanceof Error ? `: ${error.message}` : "."}</p>
			) : (
				<AcquisitionsPanel unitId={unitId} overview={overview} canEdit={can("unit", 2, { type: "unit", id: unitId })} />
			)}
		</div>
	)
}
