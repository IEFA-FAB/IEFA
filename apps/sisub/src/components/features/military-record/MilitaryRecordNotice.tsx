import { describeSaramStatus, type SaramStatus } from "@iefa/database/saram-link"
import { Link, useRouterState } from "@tanstack/react-router"
import { Clock, ShieldAlert, UserRoundSearch, X } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/auth/useAuth"
import { useSaramStatus } from "@/hooks/business/useUserSaram"

/** Rota da tela "Meu cadastro militar": o aviso não aparece nela (a tela já é a ação). */
export const MILITARY_RECORD_PATH = "/diner/military-record"

/**
 * Dispensa do aviso, em MEMÓRIA, por conta e por estado — a mesma decisão do aviso de segundo
 * fator (`MfaMandateNotice`): chave nova de armazenamento pediria versão nova da Política de
 * Cookies, reaparecer a cada sessão é o comportamento certo para uma pendência, e o estado na
 * chave faz o aviso voltar quando a situação muda (o pedido foi recusado, o bloqueio passou).
 */
const dismissedByUser = new Map<string, string>()

/**
 * Aviso de entrada do vínculo de SARAM: faixa no topo do conteúdo, nunca modal. Aparece para quem
 * tem algo a fazer (sugestão, homônimos, sem identificação, bloqueio) ou a acompanhar (pedido,
 * contestação), com o botão que leva direto à tela onde a ação está — a ação fica a 2 cliques de
 * qualquer página. Conta verificada, vínculo antigo e conta de seção não veem nada.
 */
export function MilitaryRecordNotice() {
	const { user } = useAuth()
	const pathname = useRouterState({ select: (state) => state.location.pathname })
	const { data: status } = useSaramStatus()
	const userId = user?.id ?? ""
	const [dismissed, setDismissed] = useState<string | null>(() => dismissedByUser.get(userId) ?? null)

	if (!status || pathname.startsWith(MILITARY_RECORD_PATH)) return null
	if (dismissed === status.status) return null

	return (
		<MilitaryRecordNoticeView
			status={status}
			onDismiss={() => {
				dismissedByUser.set(userId, status.status)
				setDismissed(status.status)
			}}
		/>
	)
}

export function MilitaryRecordNoticeView({ status, onDismiss }: { status: SaramStatus; onDismiss: () => void }) {
	const view = describeSaramStatus(status)
	if (!view.needsAttention || !view.notice) return null
	const waiting = status.status === "pending_request" || status.status === "contested"
	const Icon = waiting ? Clock : status.status === "locked_out" ? ShieldAlert : UserRoundSearch

	return (
		<section aria-label="Aviso sobre o seu cadastro militar" className="mb-6">
			<Alert variant={waiting ? "info" : "warning"} role="status">
				<Icon aria-hidden />
				<AlertDescription className="text-foreground">{view.notice.text}</AlertDescription>
				{/* Fora da descrição: o `Alert` sublinha link dentro dela, e o botão-link sairia sublinhado. */}
				<div className="col-start-2 mt-2 flex flex-wrap items-center gap-2">
					<Button nativeButton={false} size="sm" render={<Link to={MILITARY_RECORD_PATH}>{view.notice.cta}</Link>} />
					<Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dispensar aviso até a próxima sessão">
						<X aria-hidden />
						Agora não
					</Button>
				</div>
			</Alert>
		</section>
	)
}
