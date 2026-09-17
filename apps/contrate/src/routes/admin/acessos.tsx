import type { UserEmailSearchRow } from "@iefa/pbac"
import { hasPermission } from "@iefa/pbac"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Search, Trash, UserPlus, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { AppLayout } from "@/components/AppLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/useAuth"
import { myAlphaPermissionsQueryOptions } from "@/lib/alpha/permissions"
import {
	type AlphaGrant,
	type AlphaGrantTarget,
	grantAlphaPermissionFn,
	listAlphaGrantsFn,
	revokeAlphaPermissionFn,
	searchUsersByEmailFn,
} from "@/server/access.fn"

const grantsQueryOptions = () => queryOptions({ queryKey: ["alpha", "grants"] as const, queryFn: () => listAlphaGrantsFn() })

export const Route = createFileRoute("/admin/acessos")({
	beforeLoad: async ({ context, location, preload }) => {
		if (!context.auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		const permissions = await context.queryClient.query({ ...myAlphaPermissionsQueryOptions(), staleTime: "static" })
		// Em preload não se lança redirect: nada renderiza, e o router quebra ao processá-lo.
		if (!hasPermission(permissions, "alpha-admin", 3) && !preload) {
			throw redirect({ to: "/" })
		}
	},
	loader: ({ context }) => {
		void context.queryClient.query({ ...grantsQueryOptions(), staleTime: "static" }).catch(() => {})
	},
	head: () => ({ meta: [{ title: "Acessos | Contrate" }] }),
	component: AcessosPage,
})

/**
 * O que se concede: módulo e nível juntos, porque os níveis dependem do módulo —
 * `alpha-admin` só existe em 3. Um seletor de nível solto ofereceria combinação que o
 * servidor recusa.
 */
const GRANT_OPTIONS = [
	{ value: "alpha:1", label: "Requisitante", hint: "Envia o próprio documento e acompanha a própria verificação", grant: { module: "alpha", level: 1 } },
	{ value: "alpha:2", label: "Licitações", hint: "Vê a fila e os processos de todos os requisitantes", grant: { module: "alpha", level: 2 } },
	{ value: "alpha:3", label: "ACI", hint: "Tria achados, emite parecer e cura regras e fontes", grant: { module: "alpha", level: 3 } },
	{ value: "alpha-admin:3", label: "Administração de acessos", hint: "Concede e revoga os acessos desta tela", grant: { module: "alpha-admin", level: 3 } },
] as const satisfies ReadonlyArray<{ value: string; label: string; hint: string; grant: AlphaGrantTarget }>

type GrantOptionValue = (typeof GRANT_OPTIONS)[number]["value"]

const GRANT_ITEMS = Object.fromEntries(GRANT_OPTIONS.map((o) => [o.value, o.label]))

const ALPHA_LEVEL_LABEL: Record<number, string> = { 1: "Requisitante", 2: "Licitações", 3: "ACI" }

function grantLabel(grant: AlphaGrant): string {
	if (grant.module === "alpha-admin") return "Administração de acessos"
	return ALPHA_LEVEL_LABEL[grant.level] ?? `Nível ${grant.level}`
}

function grantKey(grant: AlphaGrant): string {
	return `${grant.source}:${grant.userId}:${grant.module}`
}

function AcessosPage() {
	const queryClient = useQueryClient()
	const { user } = useAuth()
	const currentUserId = user?.id ?? null
	const grants = useQuery(grantsQueryOptions())
	const invalidate = () => queryClient.invalidateQueries({ queryKey: grantsQueryOptions().queryKey })

	const revoke = useMutation({
		mutationFn: (grant: AlphaGrant) => revokeAlphaPermissionFn({ data: { userId: grant.userId, module: grant.module } }),
		onSuccess: () => {
			toast.success("Acesso revogado")
			invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao revogar"),
	})

	return (
		<AppLayout>
			<div className="flex flex-col gap-10">
				<header className="flex flex-col gap-2">
					<h1 className="font-semibold text-3xl tracking-tighter">Acessos</h1>
					<p className="max-w-2xl text-muted-foreground text-sm">
						Quem usa o copiloto e em que perfil. Os perfis são aninhados: Licitações faz tudo o que o Requisitante faz, e o ACI tudo o que Licitações faz. Sem
						perfil, a pessoa ainda envia o próprio documento.
					</p>
				</header>

				<section aria-labelledby="quem-tem-acesso" className="flex flex-col gap-4">
					<h2 id="quem-tem-acesso" className="font-semibold text-xl tracking-tight">
						Quem tem acesso
					</h2>
					<GrantsList
						grants={grants.data}
						isLoading={grants.isLoading}
						error={grants.error}
						currentUserId={currentUserId}
						onRevoke={(grant) => revoke.mutate(grant)}
						revokingKey={revoke.isPending && revoke.variables ? grantKey(revoke.variables) : null}
					/>
				</section>

				<GrantAccess currentUserId={currentUserId} onGranted={invalidate} />
			</div>
		</AppLayout>
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
	grants: AlphaGrant[] | undefined
	isLoading: boolean
	error: unknown
	currentUserId: string | null
	onRevoke: (grant: AlphaGrant) => void
	revokingKey: string | null
}) {
	// Carregando, falhou e vazio são três telas. Lista vazia depois de erro afirmaria que
	// ninguém tem acesso.
	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		)
	}

	if (error) {
		return (
			<div className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 p-4 text-sm">
				<WarningTriangle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
				<span>A consulta falhou: {error instanceof Error ? error.message : "não foi possível carregar os acessos."}</span>
			</div>
		)
	}

	if (!grants || grants.length === 0) {
		return <p className="border border-border p-4 text-muted-foreground text-sm">Nenhum acesso concedido. Conceda o primeiro abaixo.</p>
	}

	return (
		<ul className="flex flex-col divide-y divide-border border border-border">
			{grants.map((grant) => {
				const key = grantKey(grant)
				const isSelf = grant.userId === currentUserId
				const byPolicy = grant.source === "policy"
				const isExpired = grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= Date.now()
				return (
					<li key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						<div className="flex min-w-0 flex-col">
							<span className="truncate text-sm">{grant.email || grant.userId}</span>
							{isSelf && <span className="text-muted-foreground text-xs">Você</span>}
							{byPolicy && <span className="truncate text-muted-foreground text-xs">Pela política “{grant.policyName}”</span>}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{isExpired && <Badge variant="destructive">Expirado</Badge>}
							{byPolicy && <Badge variant="outline">Política</Badge>}
							<Badge variant={grant.module === "alpha-admin" ? "default" : "secondary"}>{grantLabel(grant)}</Badge>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={isSelf || byPolicy || revokingKey === key}
								onClick={() => onRevoke(grant)}
								title={
									byPolicy
										? "Acesso emprestado por política — desanexe a política para retirá-lo"
										: isSelf
											? "Ninguém altera o próprio acesso — peça a outro administrador"
											: "Revogar acesso"
								}
							>
								<Trash className="size-4" aria-hidden="true" />
								Revogar
							</Button>
						</div>
					</li>
				)
			})}
		</ul>
	)
}

function GrantAccess({ currentUserId, onGranted }: { currentUserId: string | null; onGranted: () => void }) {
	const [email, setEmail] = useState("")
	const [selected, setSelected] = useState<UserEmailSearchRow | null>(null)
	const [target, setTarget] = useState<GrantOptionValue>("alpha:1")

	const term = email.trim()
	const search = useQuery({
		queryKey: ["alpha", "userSearch", term],
		queryFn: () => searchUsersByEmailFn({ data: { email: term } }),
		enabled: term.length >= 3,
		staleTime: 30_000,
	})

	const grant = useMutation({
		mutationFn: () => {
			if (!selected) throw new Error("Nenhum usuário selecionado")
			const option = GRANT_OPTIONS.find((o) => o.value === target)
			if (!option) throw new Error("Acesso inválido")
			return grantAlphaPermissionFn({ data: { userId: selected.id, ...option.grant } })
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
		<section aria-labelledby="conceder-acesso" className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 id="conceder-acesso" className="font-semibold text-xl tracking-tight">
					Conceder acesso
				</h2>
				<p className="text-muted-foreground text-sm">Conceder de novo o mesmo perfil ATUALIZA o nível — não cria um segundo acesso.</p>
			</div>

			<div className="relative max-w-xl">
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

			{term.length >= 3 && (
				<ul className="flex max-w-xl flex-col divide-y divide-border border border-border">
					{search.isLoading && <li className="px-4 py-3 text-muted-foreground text-sm">Buscando…</li>}
					{search.error && <li className="px-4 py-3 text-destructive text-sm">A busca falhou. Tente de novo.</li>}
					{search.data?.length === 0 && (
						// O cadastro de pessoas do ERP só recebe a linha no login: sem esta explicação o
						// administrador concluiria que a conta não existe.
						<li className="px-4 py-3 text-muted-foreground text-sm">
							Ninguém encontrado. Só aparece aqui quem já entrou ao menos uma vez em um sistema do IEFA que registra o cadastro — peça à pessoa que entre e
							busque de novo.
						</li>
					)}
					{search.data?.map((row) => (
						<li key={row.id}>
							<button
								type="button"
								onClick={() => setSelected(row)}
								aria-pressed={selected?.id === row.id}
								className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted ${selected?.id === row.id ? "bg-muted" : ""}`}
							>
								<span className="truncate">{row.email}</span>
								{row.nrOrdem && <span className="shrink-0 font-mono text-muted-foreground text-xs">{row.nrOrdem}</span>}
							</button>
						</li>
					))}
				</ul>
			)}

			{selected && (
				<div className="flex max-w-xl flex-col gap-4 border border-border p-4">
					<div className="flex flex-col gap-1">
						<span className="font-medium">{selected.email}</span>
						{isSelf && <span className="text-destructive text-xs">Este é o seu próprio acesso — outro administrador precisa alterá-lo.</span>}
					</div>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
						<div className="flex min-w-72 flex-col gap-1.5">
							<span className="text-muted-foreground text-xs uppercase tracking-wider">Perfil a conceder</span>
							{/* `items` porque valor e rótulo diferem: sem ele o trigger mostra "alpha:2". */}
							<Select items={GRANT_ITEMS} value={target} onValueChange={(v) => setTarget((v as GrantOptionValue | null) ?? "alpha:1")}>
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
							<UserPlus className="size-4" aria-hidden="true" />
							Conceder
						</Button>
					</div>
				</div>
			)}
		</section>
	)
}
