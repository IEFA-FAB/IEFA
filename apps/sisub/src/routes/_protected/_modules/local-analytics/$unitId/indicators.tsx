import { createFileRoute } from "@tanstack/react-router"
import { ExternalLink, Maximize2 } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import LocalIndicatorsCard, { powerBiUrl } from "@/components/features/analytics/LocalIndicatorsCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export const Route = createFileRoute("/_protected/_modules/local-analytics/$unitId/indicators")({
	beforeLoad: ({ context }) => requirePermission(context, "local-analytics", 1),
	component: LocalIndicatorsPage,
	head: () => ({
		meta: [{ title: "Indicadores da Unidade" }, { name: "description", content: "Indicadores e relatórios Power BI da unidade" }],
	}),
})

function LocalIndicatorsPage() {
	const { unitId } = Route.useParams()
	const [expanded, setExpanded] = useState(false)

	return (
		<div className="space-y-6">
			<PageHeader title="Indicadores da Unidade">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								onClick={() => window.open(powerBiUrl, "_blank", "noopener,noreferrer")}
								variant="outline"
								size="sm"
								className="gap-2"
								aria-label="Abrir relatório em nova aba"
							>
								<ExternalLink className="h-4 w-4" aria-hidden="true" />
								Abrir
							</Button>
						}
					/>
					<TooltipContent>Abrir em nova aba</TooltipContent>
				</Tooltip>

				<Button
					onClick={() => setExpanded((e) => !e)}
					variant="outline"
					size="sm"
					className="gap-2"
					aria-pressed={expanded}
					aria-label={expanded ? "Reduzir" : "Expandir"}
				>
					<Maximize2 className="h-4 w-4" aria-hidden="true" />
					{expanded ? "Reduzir" : "Expandir"}
				</Button>
			</PageHeader>

			<LocalIndicatorsCard expanded={expanded} unitId={Number(unitId)} />
		</div>
	)
}
