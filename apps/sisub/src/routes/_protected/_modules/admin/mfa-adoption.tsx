import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ShieldAlert, ShieldCheck, TriangleAlert, UserCheck } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { queryKeys } from "@/lib/query-keys"
import { getMfaAdoptionFn, type ProtectedAccountAdoption } from "@/server/mfa-adoption.fn"

/**
 * Rota: /admin/mfa-adoption
 * ACL: módulo "admin" nível 3 — aqui E na server fn de leitura. O `beforeLoad` sozinho não
 * protege nada: `/_serverFn/<id>` é chamável direto por HTTP, sem passar pelo router.
 *
 * A tela existe para responder UMA pergunta operacional: dá para ligar o piso de garantia sem
 * trancar ninguém do lado de fora? A resposta é "contas protegidas sem fator = 0", e é por
 * isso que esse número aparece primeiro, sozinho, e em destaque.
 */
export const Route = createFileRoute("/_protected/_modules/admin/mfa-adoption")({
	beforeLoad: (opts) => requirePermission(opts, "admin", 3),
	component: MfaAdoptionPage,
	head: () => ({
		meta: [
			{ title: "Adoção da Verificação em Duas Etapas — SISUB" },
			{ name: "description", content: "Quem tem segundo fator, quem tem dispositivo reserva e quem ainda não tem nenhum" },
		],
	}),
})

/** Estado de uma conta protegida, na linguagem da tela. */
function accountStatus(account: ProtectedAccountAdoption): { label: string; variant: "destructive" | "warning" | "success" } {
	if (account.verifiedFactors === 0) return { label: "Sem segundo fator", variant: "destructive" }
	if (account.verifiedFactors === 1) return { label: "Sem dispositivo reserva", variant: "warning" }
	return { label: "Fator e reserva", variant: "success" }
}

function MfaAdoptionPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: queryKeys.audit.mfaAdoption(),
		queryFn: () => getMfaAdoptionFn(),
		// Curto: o administrador costuma abrir a tela logo depois de pedir a alguém que
		// cadastre, e um número velho o faria cobrar de novo quem já resolveu.
		staleTime: 30 * 1000,
	})

	return (
		<div className="space-y-6">
			<PageHeader
				title="Adoção da Verificação em Duas Etapas"
				description="Contas que alcançam alguma operação sensível — permissões, políticas, execução orçamentária, chave de API — precisam de segundo fator antes de o sistema passar a exigi-lo. Enquanto houver conta protegida sem fator, ligar a exigência tranca essa pessoa para fora da própria função."
			/>

			{error ? (
				<Alert variant="destructive">
					<TriangleAlert className="size-4" />
					<AlertTitle>Não foi possível carregar o painel</AlertTitle>
					<AlertDescription>{(error as Error).message}</AlertDescription>
				</Alert>
			) : null}

			{isLoading ? (
				<Skeleton className="h-40 w-full" />
			) : data?.available === false ? (
				// Leitura indisponível NÃO cai em zero: um painel que dissesse "0 contas com
				// fator" sem ter conseguido ler produziria a decisão exatamente oposta à certa.
				<Alert variant="destructive">
					<TriangleAlert className="size-4" />
					<AlertTitle>Não foi possível ler os fatores cadastrados</AlertTitle>
					<AlertDescription>{data.reason}</AlertDescription>
				</Alert>
			) : data?.available ? (
				<>
					<Card>
						<CardHeader>
							<CardTitle>Contas protegidas sem segundo fator</CardTitle>
							<CardDescription>É este número que decide a virada da exigência. Enquanto ele não for zero, o piso continua desligado.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-display">{data.totals.protectedWithoutFactor}</p>
							<div className="flex flex-wrap gap-2">
								<Badge variant="secondary">{data.totals.protectedTotal} contas protegidas no total</Badge>
								<Badge variant="warning">{data.totals.protectedWithoutBackup} com um dispositivo só</Badge>
								<Badge variant="success">{data.totals.protectedWithBackup} com dispositivo reserva</Badge>
							</div>
							<p className="text-caption text-muted-foreground">
								Demais contas (cadastro voluntário): {data.totals.otherWithFactor} de {data.totals.otherTotal} com segundo fator.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Contas protegidas</CardTitle>
							<CardDescription>
								Quem está sem fator aparece primeiro — é a fila de quem precisa ser procurado. Conta protegida é derivada do registro de classificação das
								operações, não de um nível de permissão.
							</CardDescription>
						</CardHeader>
						<CardContent>
							{data.protectedAccounts.length === 0 ? (
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<ShieldCheck className="size-5" />
										</EmptyMedia>
										<EmptyTitle>Nenhuma conta protegida</EmptyTitle>
										<EmptyDescription>
											Nenhuma conta alcança hoje uma operação classificada como sensível. Se isso surpreende, confira as permissões antes de concluir que está
											tudo certo.
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							) : (
								<ItemGroup>
									{data.protectedAccounts.map((account) => {
										const status = accountStatus(account)
										return (
											<Item key={account.userId} variant="outline" size="sm">
												<ItemMedia variant="icon">
													{account.verifiedFactors === 0 ? <ShieldAlert className="size-5" /> : <UserCheck className="size-5" />}
												</ItemMedia>
												<ItemContent>
													<ItemTitle>{account.email}</ItemTitle>
													<ItemDescription>
														{account.nrOrdem ? `Nº de ordem ${account.nrOrdem} · ` : ""}
														{account.verifiedFactors === 0
															? "nenhum dispositivo cadastrado"
															: `${account.verifiedFactors} dispositivo${account.verifiedFactors > 1 ? "s" : ""} verificado${account.verifiedFactors > 1 ? "s" : ""}`}
													</ItemDescription>
												</ItemContent>
												<Badge variant={status.variant}>{status.label}</Badge>
											</Item>
										)
									})}
								</ItemGroup>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>O que fazer com este número</CardTitle>
							<CardDescription>A exigência é ligada em código, por módulo e por grau, e cada passo é uma revisão em PR.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<p className="text-body">
								A ordem de ativação recomendada está documentada em <span className="font-mono text-caption">src/server/assurance-registry.ts</span>: primeiro o
								grau <span className="font-mono text-caption">fresh</span> no módulo de administração, depois as operações de conta própria, e só então o grau{" "}
								<span className="font-mono text-caption">session</span> na execução orçamentária.
							</p>
							<p className="text-body">
								Quem perdeu o dispositivo não fica sem saída: a remoção do segundo fator de outra pessoa é feita na tela de permissões, com justificativa e
								registro nominal.
							</p>
							<div className="flex flex-wrap gap-2">
								<Button nativeButton={false} variant="outline" size="sm" render={<Link to="/admin/permissions">Ir para Permissões</Link>} />
								<Button nativeButton={false} variant="outline" size="sm" render={<Link to="/admin/audit-log">Ver operações sensíveis</Link>} />
							</div>
						</CardContent>
					</Card>
				</>
			) : null}
		</div>
	)
}
