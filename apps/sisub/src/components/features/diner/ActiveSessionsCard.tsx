import { AlertTriangle, Loader2, Monitor } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import type { ActiveSessionList } from "@/server/mfa.fn"

/**
 * Sessões ativas do titular e o botão de encerrar as demais.
 *
 * Quando a consulta não está disponível a tela DIZ isso, em vez de mostrar lista vazia: uma
 * lista vazia afirmaria "você não tem nenhuma outra sessão aberta" justamente no caso em que
 * o sistema não sabe — e é a partir dessa afirmação que a pessoa decide não encerrar nada.
 */

interface ActiveSessionsCardProps {
	data: ActiveSessionList | undefined
	isLoading: boolean
	isSigningOut: boolean
	onSignOutOthers: () => void
}

/** Navegador e sistema, a partir do user agent. Sem biblioteca: a lista só precisa ser reconhecível. */
function describeUserAgent(userAgent: string | null): string {
	if (!userAgent) return "Dispositivo não identificado"

	const browser = /edg\//i.test(userAgent)
		? "Edge"
		: /opr\/|opera/i.test(userAgent)
			? "Opera"
			: /chrome|crios/i.test(userAgent)
				? "Chrome"
				: /firefox|fxios/i.test(userAgent)
					? "Firefox"
					: /safari/i.test(userAgent)
						? "Safari"
						: "Navegador"

	const platform = /android/i.test(userAgent)
		? "Android"
		: /iphone|ipad|ipod/i.test(userAgent)
			? "iOS"
			: /windows/i.test(userAgent)
				? "Windows"
				: /mac os/i.test(userAgent)
					? "macOS"
					: /linux/i.test(userAgent)
						? "Linux"
						: "Sistema não identificado"

	return `${browser} · ${platform}`
}

function formatMoment(value: string | null): string {
	if (!value) return "—"
	const date = new Date(value)
	return Number.isNaN(date.getTime())
		? "—"
		: date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function ActiveSessionsCard({ data, isLoading, isSigningOut, onSignOutOthers }: ActiveSessionsCardProps) {
	const sessions = data?.sessions ?? []
	const otherSessions = sessions.filter((session) => !session.isCurrent).length

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sessões ativas</CardTitle>
				<CardDescription>Onde sua conta está aberta agora. Encerre as demais se reconhecer algo que não é seu.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading && (
					<div className="space-y-2">
						<Skeleton className="h-14 w-full rounded-lg" />
						<Skeleton className="h-14 w-full rounded-lg" />
					</div>
				)}

				{!isLoading && data?.available === false && (
					<Alert>
						<AlertTriangle aria-hidden />
						<AlertTitle>Não foi possível listar as sessões</AlertTitle>
						<AlertDescription>
							A lista de sessões não está disponível no momento. Você ainda pode encerrar as demais sessões — a ação abaixo não depende desta consulta.
						</AlertDescription>
					</Alert>
				)}

				{!isLoading && data?.available && sessions.length > 0 && (
					<ItemGroup>
						{sessions.map((session) => (
							<Item key={session.id} variant="outline" size="sm">
								<ItemMedia variant="icon">
									<Monitor className="size-4" aria-hidden />
								</ItemMedia>
								<ItemContent>
									<ItemTitle className="flex items-center gap-2">
										{describeUserAgent(session.userAgent)}
										{session.isCurrent && <Badge variant="success">Este dispositivo</Badge>}
										{session.aal === "aal2" && <Badge variant="outline">Verificada em duas etapas</Badge>}
									</ItemTitle>
									<ItemDescription>
										Última atividade em {formatMoment(session.lastSeenAt)}
										{session.ip ? ` · ${session.ip}` : ""}
									</ItemDescription>
								</ItemContent>
							</Item>
						))}
					</ItemGroup>
				)}

				<AlertDialog>
					<AlertDialogTrigger
						render={
							<Button variant="outline" size="sm" disabled={isSigningOut}>
								{isSigningOut && <Loader2 className="size-4 animate-spin" aria-hidden />}
								Encerrar todas as outras sessões
							</Button>
						}
					/>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Encerrar as outras sessões?</AlertDialogTitle>
							<AlertDialogDescription>
								{otherSessions > 0
									? `As demais sessões (${otherSessions}) serão desconectadas. Esta, de onde você está agora, continua ativa.`
									: "As demais sessões serão desconectadas. Esta, de onde você está agora, continua ativa."}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction onClick={onSignOutOthers}>Encerrar</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	)
}
