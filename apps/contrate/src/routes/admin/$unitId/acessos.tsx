import type { UserEmailSearchRow } from "@iefa/pbac"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Search, Trash, UserPlus, WarningTriangle } from "iconoir-react"
import { useState } from "react"
import { SectionHeader } from "@/components/alpha/SectionNav"
import { GLOBAL_UNIT, type UnitChoice, UnitSelect } from "@/components/alpha/UnitSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/components/ui/toast"
import { useAuth } from "@/hooks/useAuth"
import { ALPHA_GRANT_ROLES, type AlphaGrantRole, canChangeOwnAccess, roleOfModule } from "@/lib/alpha/admin-access"
import type { ScopeContext } from "@/lib/scope"
import {
	type AlphaGrant,
	fetchAdminScopeFn,
	grantAlphaPermissionFn,
	listAlphaGrantsFn,
	revokeAlphaPermissionFn,
	searchUsersByEmailFn,
} from "@/server/access.fn"

const grantsQueryOptions = (unitId: number | null) =>
	queryOptions({ queryKey: ["alpha", "grants", unitId ?? "todas"] as const, queryFn: () => listAlphaGrantsFn({ data: { unitId } }) })

const adminScopeQueryOptions = () => queryOptions({ queryKey: ["alpha", "adminScope"] as const, queryFn: () => fetchAdminScopeFn(), staleTime: 60_000 })

export const Route = createFileRoute("/admin/$unitId/acessos")({
	// A OM já foi conferida pela rota-mãe; as server functions reconferem a cobertura.
	loader: ({ context }) => {
		void context.queryClient.query({ ...grantsQueryOptions(context.scopeContext.unitId), staleTime: "static" }).catch(() => {})
	},
	head: () => ({ meta: [{ title: "Acessos | Contrate" }] }),
	component: AcessosPage,
})

/**
 * Os papéis concedíveis. Não são aninhados: cada um é um grant próprio, por OM — a mesma
 * pessoa pode ser Licitações no GAP-SJ e Requisitante no IEFA-SJ.
 */
const ROLE_INFO: Record<AlphaGrantRole, { label: string; hint: string }> = {
	requester: { label: "Requisitante", hint: "Vê todas as submissões da OM — enviar documento não exige papel" },
	procurement: { label: "Licitações", hint: "Vê a fila e os processos da OM" },
	aci: { label: "ACI", hint: "Tria achados e emite parecer nos processos da OM; o global também cura regras e fontes" },
	admin: { label: "Administração de acessos", hint: "Concede e revoga papéis na OM e nas que ela apoia" },
}

const ROLE_ITEMS = Object.fromEntries(ALPHA_GRANT_ROLES.map((role) => [role, ROLE_INFO[role].label]))

function grantLabel(grant: AlphaGrant): string {
	return ROLE_INFO[roleOfModule(grant.module)].label
}

/**
 * Chave de uma linha. OM e nome da política entram junto porque a mesma pessoa pode ter o
 * mesmo papel em duas OMs, e duas políticas podem emprestar o MESMO papel — sem eles, as
 * linhas nascem com a mesma chave de React e uma delas some da lista.
 */
function grantKey(grant: AlphaGrant): string {
	return `${grant.source}:${grant.userId}:${grant.module}:${grant.unitId ?? "global"}:${grant.policyName ?? ""}`
}

function AcessosPage() {
	const queryClient = useQueryClient()
	const { user } = useAuth()
	const { scopeContext } = Route.useRouteContext()
	const currentUserId = user?.id ?? null
	const grants = useQuery(grantsQueryOptions(scopeContext.unitId))
	const isGlobalAdmin = useQuery(adminScopeQueryOptions()).data?.isGlobal ?? false
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["alpha", "grants"] })

	const revoke = useMutation({
		mutationFn: (grant: AlphaGrant) => revokeAlphaPermissionFn({ data: { userId: grant.userId, module: grant.module, unitId: grant.unitId } }),
		onSuccess: () => {
			toast.success("Acesso revogado")
			invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao revogar"),
	})

	return (
		<div className="flex flex-col gap-10">
			<SectionHeader
				eyebrow={`Projeto α · Acessos · ${scopeContext.label}`}
				title="Acessos"
				subtitle={
					scopeContext.kind === "all"
						? "Os papéis do Projeto α em todas as OMs, inclusive os globais. Cada concessão e revogação fica registrada com quem a fez."
						: `Os papéis do Projeto α em ${scopeContext.label}. Quem tem papel na OM que apoia outras alcança também as apoiadas. Cada concessão e revogação fica registrada com quem a fez.`
				}
			/>

			<section aria-labelledby="quem-tem-acesso" className="flex flex-col gap-4">
				<h2 id="quem-tem-acesso" className="font-semibold text-xl tracking-tight">
					Quem tem acesso
				</h2>
				<GrantsList
					grants={grants.data}
					isLoading={grants.isLoading}
					error={grants.error}
					currentUserId={currentUserId}
					isGlobalAdmin={isGlobalAdmin}
					showUnit={scopeContext.kind === "all"}
					onRevoke={(grant) => revoke.mutate(grant)}
					revokingKey={revoke.isPending && revoke.variables ? grantKey(revoke.variables) : null}
				/>
			</section>

			<GrantAccess scope={scopeContext} currentUserId={currentUserId} onGranted={invalidate} />
		</div>
	)
}

function GrantsList({
	grants,
	isLoading,
	error,
	currentUserId,
	isGlobalAdmin,
	showUnit,
	onRevoke,
	revokingKey,
}: {
	grants: AlphaGrant[] | undefined
	isLoading: boolean
	error: unknown
	currentUserId: string | null
	isGlobalAdmin: boolean
	/** Na lista de todas as OMs, a OM de cada grant; numa OM só, ela é o título da página. */
	showUnit: boolean
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
		return <p className="border border-border p-4 text-muted-foreground text-sm">Nenhum acesso concedido aqui. Conceda o primeiro abaixo.</p>
	}

	return (
		<ul className="flex flex-col divide-y divide-border border border-border">
			{grants.map((grant) => {
				const key = grantKey(grant)
				const isSelf = grant.userId === currentUserId
				const selfBlocked = isSelf && !canChangeOwnAccess(isGlobalAdmin, { action: "revoke", module: grant.module })
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
							{showUnit || grant.unitId === null ? (
								<Badge variant="outline">{grant.unitId === null ? "Global" : (grant.unitCode ?? `OM ${grant.unitId}`)}</Badge>
							) : null}
							<Badge variant={grant.module === "alpha-admin" ? "default" : "secondary"}>{grantLabel(grant)}</Badge>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={selfBlocked || byPolicy || revokingKey === key}
								onClick={() => onRevoke(grant)}
								title={
									byPolicy
										? "Acesso emprestado por política — desanexe a política para retirá-lo"
										: selfBlocked
											? grant.module === "alpha-admin"
												? "Ninguém revoga a própria administração de acessos — peça a outro administrador"
												: "Só um administrador global altera o próprio acesso — peça a outro administrador"
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

function GrantAccess({ scope, currentUserId, onGranted }: { scope: ScopeContext; currentUserId: string | null; onGranted: () => void }) {
	const [email, setEmail] = useState("")
	const [selected, setSelected] = useState<UserEmailSearchRow | null>(null)
	const [role, setRole] = useState<AlphaGrantRole>("requester")
	// Parte da OM aberta. Em "todas", nada é pré-escolhido: grant global às cegas é o erro caro.
	const [unit, setUnit] = useState<UnitChoice | null>(scope.unitId)
	const adminScope = useQuery(adminScopeQueryOptions())

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
			if (unit === null) throw new Error("Escolha a OM do acesso")
			return grantAlphaPermissionFn({ data: { userId: selected.id, role, unitId: unit === GLOBAL_UNIT ? null : unit } })
		},
		onSuccess: () => {
			toast.success("Acesso concedido")
			setSelected(null)
			setEmail("")
			onGranted()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao conceder"),
	})

	// O global pode conceder a si mesmo (fica no log como qualquer concessão); o de OM, não.
	const selfBlocked = selected !== null && selected.id === currentUserId && !canChangeOwnAccess(adminScope.data?.isGlobal ?? false, { action: "grant" })

	return (
		<section aria-labelledby="conceder-acesso" className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 id="conceder-acesso" className="font-semibold text-xl tracking-tight">
					Conceder acesso
				</h2>
				<p className="text-muted-foreground text-sm">
					Conceder de novo o mesmo papel na mesma OM não cria um segundo acesso. Você concede só nas OMs que administra
					{adminScope.data?.isGlobal ? ", e só você, como administrador global, concede acesso global" : ""}.
				</p>
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
				<div className="flex max-w-3xl flex-col gap-4 border border-border p-4">
					<div className="flex flex-col gap-1">
						<span className="font-medium">{selected.email}</span>
						{selfBlocked && <span className="text-destructive text-xs">Este é o seu próprio acesso — só um administrador global o altera.</span>}
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="flex min-w-0 flex-col gap-1.5">
							<label htmlFor="grant-role" className="text-muted-foreground text-xs uppercase tracking-wider">
								Papel
							</label>
							{/* `items` porque valor e rótulo diferem: sem ele o trigger mostra "procurement". */}
							<Select items={ROLE_ITEMS} value={role} onValueChange={(v) => setRole((v as AlphaGrantRole | null) ?? "requester")}>
								<SelectTrigger id="grant-role" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{ALPHA_GRANT_ROLES.map((value) => (
										<SelectItem key={value} value={value}>
											{ROLE_INFO[value].label} — {ROLE_INFO[value].hint}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex min-w-0 flex-col gap-1.5">
							<label htmlFor="grant-unit" className="text-muted-foreground text-xs uppercase tracking-wider">
								OM
							</label>
							{adminScope.isError ? (
								<p className="text-destructive text-sm">Não foi possível carregar as OMs que você administra.</p>
							) : (
								<UnitSelect
									id="grant-unit"
									units={adminScope.data?.units ?? []}
									value={unit}
									onChange={setUnit}
									allowGlobal={adminScope.data?.isGlobal ?? false}
									placeholder={adminScope.isLoading ? "carregando as OMs…" : "selecione a OM"}
									disabled={adminScope.isLoading}
									className="max-w-none"
								/>
							)}
						</div>
					</div>
					<div>
						<Button type="button" onClick={() => grant.mutate()} disabled={selfBlocked || unit === null || grant.isPending}>
							<UserPlus className="size-4" aria-hidden="true" />
							Conceder
						</Button>
					</div>
				</div>
			)}
		</section>
	)
}
