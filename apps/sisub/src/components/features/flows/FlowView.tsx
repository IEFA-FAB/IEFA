import { Link } from "@tanstack/react-router"
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Circle, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import type { FlowAction, FlowIssue, FlowStep, IssueSeverity, StepStatus } from "@/lib/flows/model"

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
	done: "Em dia",
	attention: "Atenção",
	blocked: "Bloqueada",
	todo: "A fazer",
}

export const STEP_STATUS_VARIANTS: Record<StepStatus, "success" | "warning" | "destructive" | "outline"> = {
	done: "success",
	attention: "warning",
	blocked: "destructive",
	todo: "outline",
}

const SEVERITY_ICONS: Record<IssueSeverity, typeof Info> = {
	blocking: AlertOctagon,
	warning: AlertTriangle,
	info: Info,
}

const SEVERITY_LABELS: Record<IssueSeverity, string> = {
	blocking: "Bloqueia",
	warning: "Atenção",
	info: "Informação",
}

/** Origem do fluxo, levada no history state: a tela de destino oferece "Voltar ao fluxo". */
export interface FlowOrigin {
	href: string
	label: string
}

/** "/unit/1/procurement/new?step=2&draft=x" → caminho + busca, para o `Link` do router. */
function splitHref(href: string): { to: string; search: Record<string, string> | undefined } {
	const [to, query] = href.split("?")
	return { to, search: query ? Object.fromEntries(new URLSearchParams(query)) : undefined }
}

export function FlowLink({ action, origin, variant = "outline" }: { action: FlowAction; origin: FlowOrigin; variant?: "outline" | "default" | "link" }) {
	const { to, search } = splitHref(action.href)
	return (
		<Button
			size="sm"
			variant={variant}
			nativeButton={false}
			render={
				<Link to={to as never} search={search as never} state={{ fromFlow: origin } as never}>
					{action.label}
					<ArrowRight data-icon="inline-end" aria-hidden="true" />
				</Link>
			}
		/>
	)
}

function StepMarker({ index, status }: { index: number; status: StepStatus }) {
	if (status === "done") return <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
	if (status === "blocked") return <AlertOctagon className="size-6 shrink-0 text-destructive" aria-hidden="true" />
	if (status === "attention") return <AlertTriangle className="size-6 shrink-0 text-warning" aria-hidden="true" />
	return (
		<span className="relative flex size-6 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true">
			<Circle className="absolute size-6" />
			<span className="text-caption">{index}</span>
		</span>
	)
}

function IssueRow({ issue, origin }: { issue: FlowIssue; origin: FlowOrigin }) {
	const Icon = SEVERITY_ICONS[issue.severity]
	return (
		<Item variant="outline" size="sm">
			<ItemMedia>
				<Icon
					className={
						issue.severity === "blocking" ? "size-4 text-destructive" : issue.severity === "warning" ? "size-4 text-warning" : "size-4 text-muted-foreground"
					}
					aria-label={SEVERITY_LABELS[issue.severity]}
				/>
			</ItemMedia>
			<ItemContent>
				<ItemTitle className="font-normal">{issue.message}</ItemTitle>
			</ItemContent>
			{issue.action && (
				<ItemActions>
					<FlowLink action={issue.action} origin={origin} />
				</ItemActions>
			)}
		</Item>
	)
}

/** Pendências soltas, fora de um fluxo (o painel "a caminho" do Estoque), no mesmo formato. */
export function FlowIssueList({ issues, origin }: { issues: FlowIssue[]; origin: FlowOrigin }) {
	return (
		<ItemGroup>
			{issues.map((issue) => (
				<IssueRow key={`${issue.severity}:${issue.message}`} issue={issue} origin={origin} />
			))}
		</ItemGroup>
	)
}

/**
 * Um fluxo guiado: as etapas em ordem, cada uma com o objetivo, o que já está feito, o que falta
 * (com quem resolve) e o atalho para a tela que resolve.
 */
export function FlowView({ steps, origin }: { steps: FlowStep[]; origin: FlowOrigin }) {
	return (
		<ol className="space-y-4" aria-label="Etapas do fluxo">
			{steps.map((step, index) => (
				<li key={step.id}>
					<Card>
						<CardHeader>
							<div className="flex items-start gap-3">
								<StepMarker index={index + 1} status={step.status} />
								<div className="min-w-0 flex-1">
									<CardTitle>
										{index + 1}. {step.title}
									</CardTitle>
									<CardDescription>{step.objective}</CardDescription>
								</div>
								<Badge variant={STEP_STATUS_VARIANTS[step.status]}>{STEP_STATUS_LABELS[step.status]}</Badge>
							</div>
						</CardHeader>
						{(step.summary || step.issues.length > 0 || step.action) && (
							<CardContent className="space-y-3">
								{step.summary && <p className="text-sm text-muted-foreground">{step.summary}</p>}
								{step.issues.length > 0 && (
									<ItemGroup>
										{step.issues.map((issue) => (
											<IssueRow key={`${issue.severity}:${issue.message}`} issue={issue} origin={origin} />
										))}
									</ItemGroup>
								)}
								{step.action && (
									<div className="flex justify-end">
										<FlowLink action={step.action} origin={origin} variant={step.status === "done" ? "outline" : "default"} />
									</div>
								)}
							</CardContent>
						)}
					</Card>
				</li>
			))}
		</ol>
	)
}
