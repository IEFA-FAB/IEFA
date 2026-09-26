import { Link } from "@tanstack/react-router"
import { ArrowRight, Route as RouteIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type FlowStep, overallStatus } from "@/lib/flows/model"
import { STEP_STATUS_LABELS, STEP_STATUS_VARIANTS } from "./FlowView"

/** Um fluxo no índice "Fluxos" do módulo: o objetivo, o estado geral e quantas pendências há. */
export function FlowHubCard({ title, description, href, steps }: { title: string; description: string; href: string; steps: FlowStep[] | null }) {
	const status = steps ? overallStatus(steps) : null
	const open = steps ? steps.flatMap((s) => s.issues).filter((i) => i.severity !== "info").length : 0
	const done = steps ? steps.filter((s) => s.status === "done").length : 0
	return (
		<Link to={href as never} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
			<Card>
				<CardHeader>
					<div className="flex items-start gap-3">
						<RouteIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
						<div className="min-w-0 flex-1">
							<CardTitle>{title}</CardTitle>
							<CardDescription>{description}</CardDescription>
						</div>
						{status && <Badge variant={STEP_STATUS_VARIANTS[status]}>{STEP_STATUS_LABELS[status]}</Badge>}
					</div>
				</CardHeader>
				<CardContent>
					<p className="flex items-center justify-between text-sm text-muted-foreground">
						<span>
							{steps
								? `${done} de ${steps.length} etapas em dia${open > 0 ? ` · ${open} pendência${open === 1 ? "" : "s"}` : ""}`
								: "Carregando o estado das etapas…"}
						</span>
						<ArrowRight className="size-4" aria-hidden="true" />
					</p>
				</CardContent>
			</Card>
		</Link>
	)
}
