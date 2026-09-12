import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { KeyRound, LifeBuoy, Loader2, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useMfaOverview, useVerifyMfaChallenge } from "@/hooks/data/useMfa"
import { verificationCodeErrorMessage } from "@/lib/mfa-messages"

/**
 * Segundo passo do login: o código de 6 dígitos do aplicativo autenticador.
 *
 * Tela própria, e não um estado interno de `/auth`, porque recarregar a página no meio do
 * desafio não pode devolver o usuário ao formulário de senha — a senha já foi aceita, e a
 * sessão existe (em AAL1). O `beforeLoad` do layout `/auth` abre exceção para esta rota
 * justamente por isso.
 */
export const Route = createFileRoute("/auth/challenge")({
	beforeLoad: ({ context, location }) => {
		// Sem sessão não há o que desafiar: o caminho é a senha, preservando o destino.
		if (!context.auth.user) throw redirect({ to: "/auth", search: { redirect: location.href } })
	},
	component: ChallengePage,
	head: () => ({
		meta: [{ title: "Verificação em duas etapas — SISUB" }],
	}),
})

function ChallengePage() {
	const search = Route.useSearch()
	const { data: overview, isLoading, error: overviewError } = useMfaOverview()
	const verifyChallenge = useVerifyMfaChallenge()

	const [selectedFactorId, setSelectedFactorId] = useState<string | null>(null)
	const [code, setCode] = useState("")
	const [failedAttempts, setFailedAttempts] = useState(0)
	const [error, setError] = useState<string | null>(null)

	const factors = overview?.factors ?? []
	const factorId = selectedFactorId ?? factors[0]?.id ?? null
	const destination = search.redirect || "/hub"

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault()
		if (!factorId) return
		setError(null)
		try {
			await verifyChallenge.mutateAsync({ factorId, code })
			// Navegação de página INTEIRA, e não `navigate()`: a verificação emitiu tokens novos
			// nos cookies, e o client do navegador ainda tem a sessão antiga em memória. Só um
			// boot novo o faz reler os cookies.
			window.location.assign(destination)
		} catch (caught) {
			const attempts = failedAttempts + 1
			setFailedAttempts(attempts)
			setCode("")
			setError(verificationCodeErrorMessage(attempts, caught instanceof Error && caught.message ? caught.message : "Não foi possível verificar o código."))
		}
	}

	return (
		<div className="flex-1 flex w-full items-center justify-center px-4 py-12">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
						Verificação em duas etapas
					</CardTitle>
					<CardDescription>Abra seu aplicativo autenticador e informe o código de 6 dígitos gerado para o SISUB.</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoading && <Skeleton className="h-24 w-full rounded-lg" />}

					{/* Falha de leitura não pode virar "não há dispositivo": isso mandaria para dentro
					    do sistema, em AAL1, justamente quem deveria ter sido desafiado. */}
					{!isLoading && overviewError && (
						<div className="space-y-4">
							<p className="text-body text-destructive">Não foi possível carregar seus dispositivos de verificação.</p>
							<Button variant="outline" onClick={() => window.location.reload()}>
								Tentar de novo
							</Button>
						</div>
					)}

					{!isLoading && !overviewError && factors.length === 0 && (
						<div className="space-y-4">
							<p className="text-body text-muted-foreground">Nenhum dispositivo de verificação está cadastrado nesta conta.</p>
							<Button onClick={() => window.location.assign(destination)}>Continuar</Button>
						</div>
					)}

					{!isLoading && !overviewError && factors.length > 0 && (
						<form onSubmit={handleSubmit} className="space-y-4">
							<FieldGroup>
								{factors.length > 1 && (
									<Field>
										<FieldLabel htmlFor="challenge-factor">Dispositivo</FieldLabel>
										<Select value={factorId} onValueChange={(value) => setSelectedFactorId(value as string)}>
											<SelectTrigger id="challenge-factor" className="w-full">
												<SelectValue>{factors.find((factor) => factor.id === factorId)?.friendlyName ?? "Dispositivo sem nome"}</SelectValue>
											</SelectTrigger>
											<SelectContent alignItemWithTrigger={false}>
												{factors.map((factor) => (
													<SelectItem key={factor.id} value={factor.id}>
														{factor.friendlyName ?? "Dispositivo sem nome"}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>
								)}

								<Field>
									<FieldLabel htmlFor="challenge-code">Código de 6 dígitos</FieldLabel>
									<Input
										id="challenge-code"
										value={code}
										onChange={(event) => setCode(event.target.value)}
										inputMode="numeric"
										autoComplete="one-time-code"
										autoFocus
										maxLength={7}
										placeholder="000000"
										className="font-mono text-center"
										required
									/>
									<FieldDescription>O código muda a cada 30 segundos. Se ele for recusado, aguarde o próximo.</FieldDescription>
									<FieldError>{error}</FieldError>
								</Field>
							</FieldGroup>

							<Button type="submit" className="w-full" disabled={verifyChallenge.isPending || code.trim().length < 6}>
								{verifyChallenge.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
								Confirmar
							</Button>

							{/* Atalho AUSENTE para conta protegida e para quem não tem código restante
							    (design.md D9): a decisão vem do servidor, em `canUseRecoveryCode`, e não
							    de um cálculo repetido aqui. Oferecê-lo sem código levaria a pessoa, no
							    pior momento possível, a uma tela sem saída. */}
							{overview?.canUseRecoveryCode && (
								<Button
									variant="ghost"
									size="sm"
									className="w-full"
									nativeButton={false}
									render={
										<Link to="/auth/recovery-code" className="gap-1.5">
											<LifeBuoy className="size-3.5" aria-hidden />
											Perdi o aparelho: usar um código de recuperação
										</Link>
									}
								/>
							)}
						</form>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
