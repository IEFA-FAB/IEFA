import type { SnackRequestSummary } from "@iefa/sisub-domain"
import { SNACK_REQUEST_STATUS_LABELS } from "@iefa/sisub-domain/utils"
import { AlertTriangle, CalendarClock, Clock, PackageOpen, Split, Users } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { asStatus, requestFlags, STATUS_BADGE_VARIANTS } from "./format"

export function SnackStatusBadge({ status }: { status: string }) {
	const s = asStatus(status)
	return <Badge variant={STATUS_BADGE_VARIANTS[s] ?? "secondary"}>{SNACK_REQUEST_STATUS_LABELS[s] ?? status}</Badge>
}

/** As marcas da fila (spec "Fila de requisições da cozinha"). */
export function SnackRequestFlagBadges({ request }: { request: SnackRequestSummary }) {
	const flags = requestFlags(request)
	if (!flags.late && !flags.divergent && !flags.optionalPax && !flags.materialPending && !flags.reviewOverdue) return null
	return (
		<div className="flex flex-wrap gap-1.5">
			{flags.late && (
				<Badge variant="warning">
					<Clock aria-hidden="true" />
					Fora do prazo
				</Badge>
			)}
			{flags.divergent && (
				<Badge variant="warning">
					<Split aria-hidden="true" />
					Diverge da sugestão
				</Badge>
			)}
			{flags.optionalPax && (
				<Badge variant="outline">
					<Users aria-hidden="true" />
					Passageiros opcionais
				</Badge>
			)}
			{flags.reviewOverdue && (
				<Badge variant="outline">
					<CalendarClock aria-hidden="true" />
					Revisão do padrão vencida
				</Badge>
			)}
			{flags.materialPending && (
				<Badge variant="destructive">
					<PackageOpen aria-hidden="true" />
					Material a devolver
				</Badge>
			)}
		</div>
	)
}

/** Falha de leitura — distinta do estado vazio: "não consegui ler" não é "não há nada". */
export function SnackLoadError({ what, error, onRetry }: { what: string; error: Error; onRetry?: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertTriangle aria-hidden="true" />
			<AlertTitle>Não foi possível carregar {what}.</AlertTitle>
			<AlertDescription>
				<p>{error.message}</p>
				{onRetry && (
					<Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
						Tentar de novo
					</Button>
				)}
			</AlertDescription>
		</Alert>
	)
}
