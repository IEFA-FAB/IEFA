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
import { grantSucontPermissionFn, revokeSucontPermissionFn, type SucontGrant, type SucontUserSearchResult, searchUsersByEmailFn } from "#/server/permissions.fn"

/**
 * Gestão de acesso ao SUCONT — a única tela do módulo `admin`.
 *
 * Duas metades, na ordem em que a pergunta aparece: primeiro QUEM TEM acesso (o
 * que a tela responde sozinha, sem interação), depois conceder. O caminho
 * contrário obrigaria a busca por um e-mail para descobrir o que a lista já diz.
 */

const LEVELS = [
	{ value: "1", label: "Acesso", hint: "Abre o hub e as ferramentas" },
	{ value: "2", label: "Editor", hint: "Edita área de trabalho, relatórios e mensagens" },
	{ value: "3", label: "Administrador", hint: "Edita e gerencia os acessos" },
] as const

const LEVEL_LABELS: Record<number, string> = { 1: "Acesso", 2: "Editor", 3: "Administrador" }
const LEVEL_ITEMS = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]))

export function SucontPermissionsManager() {
	const queryClient = useQueryClient()
	const { data: auth } = useQuery(authQueryOptions())
	const currentUserId = auth?.user?.id ?? null

	const grants = useQuery(sucontGrantsQueryOptions())
	const invalidateGrants = () => queryClient.invalidateQueries({ queryKey: sucontGrantsQueryOptions().queryKey })

	const revoke = useMutation({
		mutationFn: (userId: string) => revokeSucontPermissionFn({ data: { userId } }),
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
						Cada pessoa tem um nível só, válido em todo o hub — o acesso não é por seção nem por ferramenta. Quem aparece como “Política” recebeu o acesso de
						uma política anexada, e ele não se revoga por aqui.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<GrantsList
						grants={grants.data}
						isLoading={grants.isLoading}
						error={grants.error}
						currentUserId={currentUserId}
						onRevoke={(userId) => revoke.mutate(userId)}
						revokingUserId={revoke.isPending ? revoke.variables : null}
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
	revokingUserId,
}: {
	grants: SucontGrant[] | undefined
	isLoading: boolean
	error: unknown
	currentUserId: string | null
	onRevoke: (userId: string) => void
	revokingUserId: string | null
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
				return (
					<li key={`${grant.source}:${grant.userId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div className="flex min-w-0 flex-col">
							{/* Sem linha em `core.user_data` não há e-mail para mostrar. O id é feio,
							    mas identifica; "—" faria a linha parecer corrompida. */}
							<span className="truncate text-body text-foreground">{grant.email || grant.userId}</span>
							{isSelf && <span className="text-hint text-muted-foreground">Você</span>}
							{byPolicy && <span className="truncate text-hint text-muted-foreground">Pela política “{grant.policyName}”</span>}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{isExpired && <Badge variant="warning">Expirado</Badge>}
							{byPolicy && <Badge variant="outline">Política</Badge>}
							<Badge variant={grant.level === 3 ? "destructive" : "muted"}>{LEVEL_LABELS[grant.level] ?? `Nível ${grant.level}`}</Badge>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={isSelf || byPolicy || revokingUserId === grant.userId}
								onClick={() => onRevoke(grant.userId)}
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
								{revokingUserId === grant.userId ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
								Revogar
							</Button>
						</div>
					</li>
				)
			})}
		</ul>
	)
}

function GrantAccessCard({ currentUserId, onGranted }: { currentUserId: string | null; onGranted: () => void }) {
	const [email, setEmail] = useState("")
	const [selected, setSelected] = useState<SucontUserSearchResult | null>(null)
	const [level, setLevel] = useState("1")

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
			return grantSucontPermissionFn({ data: { userId: selected.id, level: Number(level) } })
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
				<CardDescription>Reaplicar um nível sobre quem já tem acesso ATUALIZA o grant — não cria um segundo.</CardDescription>
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
									<span className="truncate">{user.email}</span>
								</button>
							</li>
						))}
					</ul>
				)}

				{selected && (
					<div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
						<div className="flex flex-col gap-1">
							<span className="text-subheading text-foreground">{selected.email}</span>
							{isSelf && <span className="text-hint text-warning">Este é o seu próprio acesso — outro administrador precisa alterá-lo.</span>}
						</div>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							<div className="flex min-w-56 flex-col gap-1.5">
								<span className="text-label text-muted-foreground">Nível de acesso</span>
								{/* `items` porque valor e rótulo diferem: o Base UI renderiza o VALOR
								    cru no trigger, e "1" não diz nada a ninguém. */}
								<Select items={LEVEL_ITEMS} value={level} onValueChange={(v) => setLevel(v ?? "1")}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{LEVELS.map((l) => (
											<SelectItem key={l.value} value={l.value}>
												{l.label} — {l.hint}
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
