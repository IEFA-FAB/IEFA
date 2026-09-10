import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { useState } from "react"
import { sucontGrantsQueryOptions } from "#/auth/pbac"
import { authQueryOptions } from "#/auth/service"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { Skeleton } from "#/components/ui/skeleton"
import { toast } from "#/components/ui/toast"
import { describePerson } from "#/lib/identity"
import {
	grantSucontPermissionFn,
	revokeSucontPermissionFn,
	type SucontGrant,
	type SucontGrantTarget,
	type SucontUserSearchResult,
	searchUsersByEmailFn,
} from "#/server/permissions.fn"

/**
 * Gestão de acesso ao SUCONT — a única tela do módulo `admin`.
 *
 * Duas metades, na ordem em que a pergunta aparece: primeiro QUEM TEM acesso (o
 * que a tela responde sozinha, sem interação), depois conceder. O caminho
 * contrário obrigaria a busca por um e-mail para descobrir o que a lista já diz.
 *
 * O acesso é POR MÓDULO desde o split: as três divisões da SUCONT e a
 * administração de acessos são grants separados. Uma pessoa que trabalha na
 * SUCONT-3 e na SUCONT-4 tem duas linhas na lista, e cada uma se revoga sozinha.
 */

/**
 * O que se concede: um módulo, num nível.
 *
 * Os níveis são POR MÓDULO porque não são os mesmos. Divisão vai até 2 (editor); a
 * administração de acessos só existe em 3 — é o nível que o módulo `sucont` único
 * exigia antes do split, e o backfill o preservou. Um seletor de nível universal
 * ofereceria "Administrador" numa divisão, gravando um grant que nenhum guard lê.
 */
const GRANT_OPTIONS = [
	{ value: "sucont-4:1", label: "SUCONT-4 — Acesso", hint: "Abre as ferramentas patrimoniais", grant: { module: "sucont-4", level: 1 } },
	{ value: "sucont-4:2", label: "SUCONT-4 — Editor", hint: "Edita os dados da seção", grant: { module: "sucont-4", level: 2 } },
	{ value: "sucont-3:1", label: "SUCONT-3 — Acesso", hint: "Abre as ferramentas contábeis", grant: { module: "sucont-3", level: 1 } },
	{ value: "sucont-3:2", label: "SUCONT-3 — Editor", hint: "Edita os dados da seção", grant: { module: "sucont-3", level: 2 } },
	{ value: "sucont-1:1", label: "SUCONT-1 — Acesso", hint: "Abre as ferramentas de custos (DGC)", grant: { module: "sucont-1", level: 1 } },
	{ value: "sucont-1:2", label: "SUCONT-1 — Editor", hint: "Edita os dados da seção", grant: { module: "sucont-1", level: 2 } },
	{ value: "sucont-admin:3", label: "Administração — Acessos", hint: "Concede e revoga acessos do SUCONT", grant: { module: "sucont-admin", level: 3 } },
] as const satisfies ReadonlyArray<{ value: string; label: string; hint: string; grant: SucontGrantTarget }>

type GrantOption = (typeof GRANT_OPTIONS)[number]

const GRANT_ITEMS = Object.fromEntries(GRANT_OPTIONS.map((o) => [o.value, o.label]))

/** Rótulo curto do módulo, para a etiqueta de cada linha da lista. */
const MODULE_LABELS: Record<string, string> = {
	"sucont-1": "SUCONT-1",
	"sucont-3": "SUCONT-3",
	"sucont-4": "SUCONT-4",
	"sucont-admin": "Administração",
}

const LEVEL_LABELS: Record<number, string> = { 1: "Acesso", 2: "Editor", 3: "Administrador" }

/** A chave de uma linha da lista — pessoa + módulo + origem, que é o que a torna única. */
function grantKey(grant: SucontGrant): string {
	return `${grant.source}:${grant.userId}:${grant.module}`
}

export function SucontPermissionsManager() {
	const queryClient = useQueryClient()
	const { data: auth } = useQuery(authQueryOptions())
	const currentUserId = auth?.user?.id ?? null

	const grants = useQuery(sucontGrantsQueryOptions())
	const invalidateGrants = () => queryClient.invalidateQueries({ queryKey: sucontGrantsQueryOptions().queryKey })

	// Revoga UM grant — pessoa e módulo. Sem o módulo, retirar o acesso à SUCONT-3
	// de quem também tem a SUCONT-4 apagaria os dois.
	const revoke = useMutation({
		mutationFn: (grant: SucontGrant) => revokeSucontPermissionFn({ data: { userId: grant.userId, module: grant.module } }),
		onSuccess: () => {
			toast.success("Acesso revogado")
			invalidateGrants()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao revogar"),
	})

	return (
		<div className="flex flex-col gap-8">
			<Card>
				<CardHeader>
					<CardTitle>Quem tem acesso</CardTitle>
					<CardDescription>
						O acesso é por divisão: cada linha é uma pessoa em um módulo, e quem trabalha em duas divisões aparece duas vezes. Quem aparece como “Política”
						recebeu o acesso de uma política anexada, e ele não se revoga por aqui.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<GrantsList
						grants={grants.data}
						isLoading={grants.isLoading}
						error={grants.error}
						currentUserId={currentUserId}
						onRevoke={(grant) => revoke.mutate(grant)}
						revokingKey={revoke.isPending && revoke.variables ? grantKey(revoke.variables) : null}
					/>
				</CardContent>
			</Card>

			<GrantAccessCard currentUserId={currentUserId} onGranted={invalidateGrants} />
		</div>
	)
}

function GrantsList({
	grants,
	isLoading,
	error,
	currentUserId,
	onRevoke,
	revokingKey,
}: {
	grants: SucontGrant[] | undefined
	isLoading: boolean
	error: unknown
	currentUserId: string | null
	onRevoke: (grant: SucontGrant) => void
	revokingKey: string | null
}) {
	// Carregando, falhou e vazio são três telas — nunca a mesma. Uma lista vazia
	// depois de um erro afirmaria que ninguém tem acesso ao SUCONT.
	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		)
	}

	if (error) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AlertTriangle />
					</EmptyMedia>
					<EmptyTitle>A consulta falhou</EmptyTitle>
					<EmptyDescription>{error instanceof Error ? error.message : "Não foi possível carregar os acessos."}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	if (!grants || grants.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<ShieldCheck />
					</EmptyMedia>
					<EmptyTitle>Nenhum acesso concedido</EmptyTitle>
					<EmptyDescription>Conceda o primeiro acesso abaixo.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
			{grants.map((grant) => {
				const isSelf = grant.userId === currentUserId
				const isExpired = grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= Date.now()
				const byPolicy = grant.source === "policy"
				const key = grantKey(grant)
				const { primary, secondary } = describePerson(grant)
				return (
					<li key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div className="flex min-w-0 flex-col">
							{/* Posto + nome de guerra quando o SARAM está vinculado, e-mail quando
							    não — o servidor já escolheu, aqui só se pinta. */}
							<span className="truncate text-body text-foreground">{primary}</span>
							{secondary && <span className="truncate text-hint text-muted-foreground">{secondary}</span>}
							{isSelf && <span className="text-hint text-muted-foreground">Você</span>}
							{byPolicy && <span className="truncate text-hint text-muted-foreground">Pela política “{grant.policyName}”</span>}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{isExpired && <Badge variant="warning">Expirado</Badge>}
							{byPolicy && <Badge variant="outline">Política</Badge>}
							{/* Módulo e nível são duas informações, e a etiqueta única de antes só
							    cabia uma: "Editor" sem dizer de qual divisão não é um acesso. */}
							<Badge variant="outline">{MODULE_LABELS[grant.module] ?? grant.module}</Badge>
							<Badge variant={grant.module === "sucont-admin" ? "destructive" : "muted"}>{LEVEL_LABELS[grant.level] ?? `Nível ${grant.level}`}</Badge>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={isSelf || byPolicy || revokingKey === key}
								onClick={() => onRevoke(grant)}
								title={
									// Apagar a linha de `user_permissions` não desfaz um anexo de política:
									// o botão responderia sucesso e o acesso continuaria de pé.
									byPolicy
										? "Acesso emprestado por política — desanexe a política para retirá-lo"
										: isSelf
											? "Ninguém altera o próprio acesso — peça a outro administrador"
											: "Revogar acesso"
								}
								className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							>
								{revokingKey === key ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
								Revogar
							</Button>
						</div>
					</li>
				)
			})}
		</ul>
	)
}

/**
 * Rótulo de uma pessoa nos resultados da busca — o mesmo par (identificação
 * militar, e-mail) que a lista de acessos mostra. Conceder nível a quem tem o
 * e-mail parecido com o de outra pessoa é o erro que esta tela existe para não
 * cometer, e um endereço sozinho não desfaz a ambiguidade.
 */
function PersonLabel({
	person,
	primaryClassName = "truncate",
	secondaryClassName = "truncate text-hint text-muted-foreground",
}: {
	person: SucontUserSearchResult
	primaryClassName?: string
	secondaryClassName?: string
}) {
	const { primary, secondary } = describePerson({ ...person, userId: person.id })
	return (
		<span className="flex min-w-0 flex-col">
			<span className={primaryClassName}>{primary}</span>
			{secondary && <span className={secondaryClassName}>{secondary}</span>}
		</span>
	)
}

function GrantAccessCard({ currentUserId, onGranted }: { currentUserId: string | null; onGranted: () => void }) {
	const [email, setEmail] = useState("")
	const [selected, setSelected] = useState<SucontUserSearchResult | null>(null)
	// Uma escolha só: módulo e nível vêm juntos porque os níveis dependem do módulo.
	const [target, setTarget] = useState<GrantOption["value"]>("sucont-4:1")

	const term = email.trim()
	const search = useQuery({
		queryKey: ["sucont", "userSearch", term],
		queryFn: () => searchUsersByEmailFn({ data: { email: term } }),
		enabled: term.length >= 2,
		staleTime: 30_000,
	})

	const grant = useMutation({
		mutationFn: () => {
			if (!selected) throw new Error("Nenhum usuário selecionado")
			const option = GRANT_OPTIONS.find((o) => o.value === target)
			if (!option) throw new Error("Acesso inválido")
			// O par vai INTEIRO (`...option.grant`), e não como dois campos lidos à parte:
			// o validator da fn correlaciona módulo e nível, e desmontar o par aqui perderia
			// a correlação que a própria lista de opções garante.
			return grantSucontPermissionFn({ data: { userId: selected.id, ...option.grant } })
		},
		onSuccess: () => {
			toast.success("Acesso concedido")
			setSelected(null)
			setEmail("")
			onGranted()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao conceder"),
	})

	const isSelf = selected !== null && selected.id === currentUserId

	return (
		<Card>
			<CardHeader>
				<CardTitle>Conceder acesso</CardTitle>
				<CardDescription>
					Um acesso por vez: quem trabalha em duas divisões recebe duas concessões. Reaplicar o mesmo módulo ATUALIZA o grant — não cria um segundo.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="relative">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" aria-hidden="true" />
					<Input
						type="search"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value)
							setSelected(null)
						}}
						placeholder="Buscar por e-mail…"
						aria-label="Buscar usuário por e-mail"
						className="pl-9"
					/>
				</div>

				{term.length >= 2 && (
					<ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
						{search.isLoading && <li className="px-4 py-3 text-caption text-muted-foreground">Buscando…</li>}
						{search.error && <li className="px-4 py-3 text-caption text-destructive">A busca falhou. Tente de novo.</li>}
						{search.data?.length === 0 && (
							// A ausência tem uma causa concreta, e escondê-la faria o administrador
							// concluir que a conta não existe: o cadastro de pessoas do ERP só
							// recebe a linha no login.
							<li className="px-4 py-3 text-caption text-muted-foreground">
								Ninguém encontrado. Só aparece aqui quem já entrou ao menos uma vez em um dos sistemas do IEFA — peça à pessoa que faça login no SUCONT e busque
								de novo.
							</li>
						)}
						{search.data?.map((user) => (
							<li key={user.id}>
								<button
									type="button"
									onClick={() => setSelected(user)}
									aria-pressed={selected?.id === user.id}
									className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-body transition-colors hover:bg-muted ${
										selected?.id === user.id ? "bg-muted" : ""
									}`}
								>
									<PersonLabel person={user} />
								</button>
							</li>
						))}
					</ul>
				)}

				{selected && (
					<div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
						<div className="flex flex-col gap-1">
							<PersonLabel person={selected} primaryClassName="text-subheading text-foreground" secondaryClassName="text-caption text-muted-foreground" />
							{isSelf && <span className="text-hint text-warning">Este é o seu próprio acesso — outro administrador precisa alterá-lo.</span>}
						</div>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							<div className="flex min-w-72 flex-col gap-1.5">
								<span className="text-label text-muted-foreground">Acesso a conceder</span>
								{/* `items` porque valor e rótulo diferem: o Base UI renderiza o VALOR
								    cru no trigger, e "sucont-4:1" não diz nada a ninguém. */}
								<Select items={GRANT_ITEMS} value={target} onValueChange={(v) => setTarget((v as GrantOption["value"]) ?? "sucont-4:1")}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{GRANT_OPTIONS.map((o) => (
											<SelectItem key={o.value} value={o.value}>
												{o.label} — {o.hint}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<Button type="button" onClick={() => grant.mutate()} disabled={isSelf || grant.isPending}>
								{grant.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
								Conceder acesso
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
