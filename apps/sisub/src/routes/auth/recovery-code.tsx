import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { ArrowLeft, LifeBuoy, Loader2 } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useMfaOverview } from "@/hooks/data/useMfa"
import { useConsumeRecoveryCode } from "@/hooks/data/useMfaRecovery"

/**
 * Saída do desafio de segundo fator para quem perdeu o aparelho.
 *
 * O código de recuperação **não** entra como segundo fator: ele REMOVE o fator e leva ao
 * recadastro obrigatório (design.md D8). A sessão continua AAL1 o tempo todo, e enquanto o
 * novo fator não for cadastrado nenhuma operação classificada é alcançável — o que está
 * certo, porque o titular ainda não provou um segundo fator.
 */
export const Route = createFileRoute("/auth/recovery-code")({
	beforeLoad: ({ context, location }) => {
		// Sem sessão não há conta a recuperar: o caminho é a senha, preservando o destino.
		if (!context.auth.user) throw redirect({ to: "/auth", search: { redirect: location.href } })
	},
	component: RecoveryCodePage,
	head: () => ({
		meta: [{ title: "Código de recuperação — SISUB" }],
	}),
})

function RecoveryCodePage() {
	const { data: overview, isLoading, error: overviewError } = useMfaOverview()
	const consume = useConsumeRecoveryCode()

	const [code, setCode] = useState("")
	const [error, setError] = useState<string | null>(null)

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		setError(null)
		try {
			await consume.mutateAsync(code)
			// Página INTEIRA, e não `navigate()`: remover um fator verificado encerra as sessões
			// do titular no GoTrue. O boot novo lê os cookies (ou a falta deles) e o layout de
			// `/auth` encaminha para a senha, guardando o recadastro como destino.
			window.location.assign(`/auth?redirect=${encodeURIComponent("/auth/mfa-enrollment")}`)
		} catch (caught) {
			setError(caught instanceof Error && caught.message ? caught.message : "Não foi possível validar o código de recuperação.")
			setCode("")
		}
	}

	return (
		<div className="flex-1 flex w-full items-center justify-center px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<LifeBuoy className="size-4 text-muted-foreground" aria-hidden />
						Usar um código de recuperação
					</CardTitle>
					<CardDescription>
						Informe um dos códigos que você guardou ao configurar a verificação em duas etapas. Cada código funciona uma única vez.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading && <Skeleton className="h-24 w-full rounded-lg" />}

					{/* Falha de leitura tem tela própria: cair no formulário afirmaria que a conta
					    aceita código de recuperação justamente quando o sistema não conseguiu saber. */}
					{!isLoading && overviewError && (
						<div className="space-y-4">
							<p className="text-body text-destructive">Não foi possível verificar as opções de recuperação da sua conta.</p>
							<Button variant="outline" onClick={() => window.location.reload()}>
								Tentar de novo
							</Button>
						</div>
					)}

					{!isLoading && !overviewError && !overview?.canUseRecoveryCode && (
						<Alert>
							<LifeBuoy aria-hidden />
							<AlertTitle>Esta conta não usa códigos de recuperação</AlertTitle>
							<AlertDescription>
								{overview?.isProtectedAccount
									? "Sua conta alcança operações críticas do sistema. Use o dispositivo reserva ou procure um administrador para restabelecer a verificação em duas etapas."
									: "Não há códigos de recuperação disponíveis nesta conta. Procure um administrador para restabelecer a verificação em duas etapas."}
							</AlertDescription>
						</Alert>
					)}

					{!isLoading && !overviewError && overview?.canUseRecoveryCode && (
						<form onSubmit={handleSubmit} className="space-y-4">
							<Alert>
								<LifeBuoy aria-hidden />
								<AlertTitle>O código remove a verificação em duas etapas</AlertTitle>
								<AlertDescription>
									Ao confirmar, os dispositivos cadastrados são removidos e você precisará cadastrar um novo antes de voltar a usar as funções protegidas do
									sistema.
								</AlertDescription>
							</Alert>

							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="recovery-code">Código de recuperação</FieldLabel>
									<Input
										id="recovery-code"
										value={code}
										onChange={(event) => setCode(event.target.value)}
										autoComplete="one-time-code"
										autoFocus
										maxLength={20}
										placeholder="XXXX-XXXX-XXXX"
										className="font-mono tracking-wide"
										required
									/>
									<FieldDescription>Pode digitar com ou sem os hifens, em maiúsculas ou minúsculas.</FieldDescription>
									<FieldError>{error}</FieldError>
								</Field>
							</FieldGroup>

							<Button type="submit" className="w-full" disabled={consume.isPending || code.trim().length === 0}>
								{consume.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
								Confirmar e remover a verificação
							</Button>
						</form>
					)}

					<Button
						variant="ghost"
						size="sm"
						nativeButton={false}
						render={
							<Link to="/auth/challenge" search={{ redirect: "/hub" }} className="gap-1.5">
								<ArrowLeft className="size-3.5" aria-hidden />
								Voltar ao código do aplicativo
							</Link>
						}
					/>
				</CardContent>
			</Card>
		</div>
	)
}
