import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { ShieldAlert, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMfaOverview } from "@/hooks/data/useMfa"
import { daysUntilDeadline, formatDeadline, MFA_MANDATE, mfaMandateAction, mfaMandatePhase } from "@/lib/assurance/mfa-mandate"

/**
 * Aviso de obrigatoriedade do segundo fator — faixa antes do prazo, cadastro depois dele.
 *
 * Vive no layout `_protected`, ao lado do aviso de ciência da LGPD, e pelo mesmo motivo: é
 * informação que acompanha a pessoa por todo o sistema, não conteúdo de uma tela.
 *
 * ## Faixa, e nunca modal (spec `mfa-enrollment`)
 *
 * Antes do prazo, o aviso é uma faixa dispensável no topo. Um modal bloqueante pediria, antes
 * da hora, uma ação que a pessoa ainda não é obrigada a tomar — e o efeito colateral de
 * bloquear a navegação com uma caixa que dá para fechar é ensinar todo mundo a fechar caixa
 * de diálogo sem ler. É a mesma razão pela qual o aviso de ciência da LGPD não bloqueia nada.
 *
 * Depois do prazo, a conta protegida sem fator é levada a `/auth/mfa-enrollment` — a mesma
 * rota que o fluxo de código de recuperação já usa, com a ação de sair SEMPRE visível. Levar
 * a uma rota, e não montar um modal sem saída, é o que garante que exista um caminho para
 * fora: quem chegou ali por engano sai pela própria tela.
 *
 * ## Onde mora a dispensa da faixa
 *
 * Num registro em MEMÓRIA, por usuário e por prazo — não em `localStorage`, não em cookie e
 * não em banco. Três razões, nesta ordem:
 *
 * 1. **Chave de armazenamento nova exige versão nova da Política de Cookies.** O inventário do
 *    `@iefa/legal-kit` lista cada chave nominalmente, e o guard `cookie-inventory.test.ts`
 *    reprova o build quando aparece uma que não está publicada. Publicar é migration nova (a
 *    versão anterior NÃO pode ser reescrita: `user_legal_acceptances.document_id` é FK
 *    `on delete restrict`) e faz o aviso de ciência reaparecer para todo mundo. É preço alto
 *    demais para um "não me mostre isto agora".
 * 2. **Reaparecer a cada sessão é o comportamento certo, não um defeito.** Um prazo que some
 *    para sempre no primeiro clique deixa de ser prazo. A dispensa serve para tirar a faixa do
 *    caminho do trabalho de agora, e a navegação inteira do app é client-side: ela sobrevive a
 *    todas as telas da sessão.
 * 3. **A chave inclui o usuário e o prazo.** Máquina compartilhada não herda a dispensa de
 *    outra pessoa, e prazo novo volta a avisar.
 */
const dismissedDeadlineByUser = new Map<string, string>()

export function MfaMandateNotice() {
	const { user } = useAuth()
	const navigate = useNavigate()
	const pathname = useRouterState({ select: (state) => state.location.pathname })

	const phase = mfaMandatePhase(new Date())
	// Sem prazo anunciado, a consulta NÃO roda: o painel de MFA custa uma ida ao GoTrue por
	// chamada, e pendurá-la em toda navegação do sistema por uma faixa que ninguém vai ver é
	// exatamente o tipo de peso que este repo já pagou em 502 por TTFB.
	const { data: overview } = useMfaOverview({ enabled: phase !== "off" && !!user?.id })

	const action = overview
		? mfaMandateAction(phase, {
				isProtectedAccount: overview.isProtectedAccount,
				verifiedCount: overview.verifiedCount,
				canManageFactors: overview.canManageFactors,
			})
		: "none"

	const dismissalKey = user?.id ?? ""
	const [dismissed, setDismissed] = useState(() => dismissedDeadlineByUser.get(dismissalKey) === MFA_MANDATE.deadline)

	// Depois do prazo, a conta protegida sem fator é levada ao cadastro. `useEffect` e não
	// `redirect` no `beforeLoad`: o guard de rota roda antes de qualquer dado de MFA existir, e
	// buscá-lo ali colocaria uma ida ao GoTrue no caminho crítico de toda navegação protegida.
	useEffect(() => {
		if (action !== "enroll") return
		if (pathname.startsWith("/auth")) return
		navigate({ to: "/auth/mfa-enrollment" })
	}, [action, pathname, navigate])

	if (action !== "notice" || dismissed) return null

	const deadline = formatDeadline()
	const remaining = daysUntilDeadline(new Date())

	return (
		<section
			className="fixed inset-x-0 top-0 z-40 border-b border-border bg-card/95 px-4 py-3 backdrop-blur"
			aria-label="Aviso sobre verificação em duas etapas"
		>
			<div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="flex items-start gap-2 text-caption text-muted-foreground">
					<ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
					<span>
						Sua conta alcança operações sensíveis e passará a exigir verificação em duas etapas
						{deadline ? ` em ${deadline}` : ""}
						{remaining !== null && remaining > 0 ? ` (em ${remaining} ${remaining === 1 ? "dia" : "dias"})` : ""}. Leva cerca de dois minutos e você continua
						usando o sistema normalmente até lá.
					</span>
				</p>

				<div className="flex shrink-0 items-center gap-2">
					<Button nativeButton={false} size="sm" render={<Link to="/diner/security">Configurar agora</Link>} />
					<Button
						variant="ghost"
						size="sm"
						aria-label="Dispensar aviso"
						onClick={() => {
							if (MFA_MANDATE.deadline) dismissedDeadlineByUser.set(dismissalKey, MFA_MANDATE.deadline)
							setDismissed(true)
						}}
					>
						<X className="size-4" aria-hidden />
						Agora não
					</Button>
				</div>
			</div>
		</section>
	)
}
