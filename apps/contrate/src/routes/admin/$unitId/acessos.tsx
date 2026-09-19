import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { NavArrowLeft, NavArrowRight, Search, UserPlus, WarningTriangle, Xmark } from "iconoir-react"
import { useCallback, useEffect, useState } from "react"
import { GrantRolesForm } from "@/components/access/GrantRolesForm"
import { PeopleTable } from "@/components/access/PeopleTable"
import { PersonPanel } from "@/components/access/PersonPanel"
import { SectionHeader } from "@/components/alpha/SectionNav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/useAuth"
import { ALPHA_GRANT_ROLES, type AlphaGrantRole, initialGrantUnit, ROLE_INFO } from "@/lib/alpha/admin-access"
import { formatCount } from "@/lib/alpha/format"
import { PAGE_SIZES, type PageSize, type PeopleQuery, type PeopleSearch, PeopleSearchSchema, type PeopleStatusFilter, peopleQueryOf } from "@/lib/alpha/people"
import { fetchAdminScopeFn, listAlphaPeopleFn } from "@/server/access.fn"

const peopleQueryOptions = (scopeUnitId: number | null, query: PeopleQuery) =>
	queryOptions({
		queryKey: ["alpha", "access", "people", scopeUnitId ?? "todas", query] as const,
		queryFn: () => listAlphaPeopleFn({ data: { scopeUnitId, ...query } }),
	})

const adminScopeQueryOptions = () => queryOptions({ queryKey: ["alpha", "adminScope"] as const, queryFn: () => fetchAdminScopeFn(), staleTime: 60_000 })

export const Route = createFileRoute("/admin/$unitId/acessos")({
	// Busca, filtros, ordem, página e a pessoa aberta moram na URL: o F5 e o link copiado
	// abrem a mesma lista. Valor que não serve cai no padrão (`PeopleSearchSchema`).
	validateSearch: (search: Record<string, unknown>): PeopleSearch => PeopleSearchSchema.parse(search),
	loaderDeps: ({ search }) => ({ query: peopleQueryOf(search) }),
	// A OM já foi conferida pela rota-mãe; as server functions reconferem a cobertura.
	loader: ({ context, deps }) => {
		void context.queryClient.prefetchQuery(peopleQueryOptions(context.scopeContext.unitId, deps.query))
	},
	head: () => ({ meta: [{ title: "Acessos | Contrate" }] }),
	component: AcessosPage,
})

const STATUS_LABEL: Record<PeopleStatusFilter, string> = {
	ativo: "Com acesso valendo",
	bloqueado: "Com bloqueio",
	anulado: "Anulados por bloqueio",
	expira: "Vencem em 30 dias",
	vencido: "Com acesso vencido",
}

const ALL = "todos"

function AcessosPage() {
	const { user } = useAuth()
	const currentUserId = user?.id ?? null
	const { scopeContext } = Route.useRouteContext()
	const search = Route.useSearch()
	const navigate = Route.useNavigate()
	const query = peopleQueryOf(search)
	const scopeUnitId = scopeContext.unitId

	const list = useQuery({ ...peopleQueryOptions(scopeUnitId, query), placeholderData: keepPreviousData })
	const adminScope = useQuery(adminScopeQueryOptions())
	const isGlobalAdmin = adminScope.data?.isGlobal ?? false
	const [granting, setGranting] = useState(false)

	/** Muda a URL. Filtro novo volta à página 1; a pessoa aberta fica. */
	const updateSearch = useCallback(
		(patch: Partial<PeopleSearch>, { resetPage = true, replace = true } = {}) =>
			navigate({ search: (prev: PeopleSearch) => ({ ...prev, ...patch, ...(resetPage ? { page: undefined } : {}) }), replace }),
		[navigate]
	)
	const openPerson = useCallback((userId: string) => updateSearch({ person: userId }, { resetPage: false, replace: false }), [updateSearch])

	const filtered = query.q !== undefined || query.role !== undefined || query.unit !== undefined || query.status !== undefined
	const units = adminScope.data?.units ?? []
	const listedUnits = list.data?.units
	const unitOptions = listedUnits === undefined ? [] : listedUnits === "all" ? units : units.filter((unit) => listedUnits.includes(unit.id))
	const showUnitFilter = listedUnits === "all" || unitOptions.length > 1
	const defaultUnit = initialGrantUnit(scopeContext)

	return (
		<div className="flex flex-col gap-6">
			<SectionHeader
				eyebrow={`Projeto α · Acessos · ${scopeContext.label}`}
				title="Acessos"
				subtitle={
					scopeContext.kind === "all"
						? "Quem tem papel do Projeto α em todas as OMs, inclusive os globais. Cada concessão e revogação fica registrada com quem a fez."
						: `Quem tem papel do Projeto α em ${scopeContext.label} e nas OMs que ela apoia. Cada concessão e revogação fica registrada com quem a fez.`
				}
				actions={
					<Button type="button" onClick={() => setGranting(true)}>
						<UserPlus aria-hidden="true" />
						Conceder acesso
					</Button>
				}
			/>

			<section aria-labelledby="quem-tem-acesso" className="flex flex-col gap-3">
				<h2 id="quem-tem-acesso" className="sr-only">
					Quem tem acesso
				</h2>

				<div className="flex flex-col gap-2 lg:flex-row lg:items-center">
					<SearchField value={query.q ?? ""} onChange={(q) => updateSearch({ q: q || undefined })} />
					<div className="flex flex-wrap items-center gap-2">
						<Select<string>
							value={query.role ?? ALL}
							onValueChange={(value) => updateSearch({ role: value === ALL || value === null ? undefined : (value as AlphaGrantRole) })}
						>
							<SelectTrigger aria-label="Filtrar por papel" className="h-9 min-w-36">
								<SelectValue>{query.role ? ROLE_INFO[query.role].label : "Todos os papéis"}</SelectValue>
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectItem value={ALL}>Todos os papéis</SelectItem>
								<SelectSeparator />
								{ALPHA_GRANT_ROLES.map((role) => (
									<SelectItem key={role} value={role}>
										{ROLE_INFO[role].label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{showUnitFilter ? (
							<Select<string> value={search.unit ?? ALL} onValueChange={(value) => updateSearch({ unit: value === ALL || value === null ? undefined : value })}>
								<SelectTrigger aria-label="Filtrar por OM" className="h-9 min-w-32">
									<SelectValue>
										{search.unit === undefined
											? "Todas as OMs"
											: search.unit === "global"
												? "Só global"
												: (units.find((unit) => String(unit.id) === search.unit)?.code ?? `OM ${search.unit}`)}
									</SelectValue>
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false} className="max-h-80">
									<SelectItem value={ALL}>Todas as OMs</SelectItem>
									{listedUnits === "all" ? <SelectItem value="global">Só global</SelectItem> : null}
									<SelectSeparator />
									{unitOptions.map((unit) => (
										<SelectItem key={unit.id} value={String(unit.id)}>
											<span className="font-medium">{unit.code}</span>
											{unit.display_name && unit.display_name !== unit.code ? (
												<span className="truncate text-muted-foreground">{unit.display_name}</span>
											) : null}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : null}

						<Select<string>
							value={query.status ?? ALL}
							onValueChange={(value) => updateSearch({ status: value === ALL || value === null ? undefined : (value as PeopleStatusFilter) })}
						>
							<SelectTrigger aria-label="Filtrar por situação" className="h-9 min-w-40">
								<SelectValue>{query.status ? STATUS_LABEL[query.status] : "Qualquer situação"}</SelectValue>
							</SelectTrigger>
							<SelectContent alignItemWithTrigger={false}>
								<SelectItem value={ALL}>Qualquer situação</SelectItem>
								<SelectSeparator />
								{(Object.keys(STATUS_LABEL) as PeopleStatusFilter[]).map((status) => (
									<SelectItem key={status} value={status}>
										{STATUS_LABEL[status]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{filtered ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => updateSearch({ q: undefined, role: undefined, unit: undefined, status: undefined })}
							>
								<Xmark aria-hidden="true" />
								Limpar filtros
							</Button>
						) : null}
					</div>
				</div>

				<ListSummary data={list.data} filtered={filtered} isLoading={list.isLoading} />

				{list.isError && !list.data ? (
					<div role="alert" className="flex items-start gap-3 border border-destructive/40 bg-destructive/5 p-4 text-sm">
						<WarningTriangle className="size-5 shrink-0 text-destructive" aria-hidden="true" />
						<span>
							A consulta falhou: {list.error instanceof Error ? list.error.message : "não foi possível carregar os acessos."} Nada aqui significa que ninguém
							tem acesso.
						</span>
					</div>
				) : list.isLoading || !list.data ? (
					<div role="status" className="flex flex-col gap-1.5" aria-busy="true" aria-label="Carregando a lista de acessos">
						{Array.from({ length: 6 }, (_, index) => (
							<Skeleton key={index} className="h-14 w-full" />
						))}
					</div>
				) : (
					<>
						<PeopleTable
							rows={list.data.rows}
							sort={query.sort}
							dir={query.dir}
							onSortChange={(sort, dir) => updateSearch({ sort, dir }, { resetPage: true })}
							onOpen={openPerson}
							currentUserId={currentUserId}
							isFetching={list.isPlaceholderData}
							caption={`Pessoas com papel do Projeto α em ${scopeContext.label}`}
							empty={
								list.data.grandTotal === 0 ? (
									<div className="flex flex-col items-start gap-3">
										<p className="text-sm">Ninguém tem papel do Projeto α aqui ainda.</p>
										<Button type="button" variant="outline" size="sm" onClick={() => setGranting(true)}>
											<UserPlus aria-hidden="true" />
											Conceder o primeiro acesso
										</Button>
									</div>
								) : (
									<div className="flex flex-col items-start gap-3">
										<p className="text-sm">Nenhuma pessoa com esses filtros, entre {formatCount(list.data.grandTotal)} com papel aqui.</p>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => updateSearch({ q: undefined, role: undefined, unit: undefined, status: undefined })}
										>
											Limpar filtros
										</Button>
									</div>
								)
							}
						/>
						<Pagination
							page={list.data.page}
							pageCount={list.data.pageCount}
							size={query.size}
							onPage={(page) => updateSearch({ page: page === 1 ? undefined : page }, { resetPage: false })}
							onSize={(size) => updateSearch({ size: size === 50 ? undefined : size })}
						/>
					</>
				)}
			</section>

			<Sheet open={granting} onOpenChange={setGranting}>
				<SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-lg">
					<SheetHeader className="border-border border-b pr-12">
						<p className="text-label text-muted-foreground">Projeto α · {scopeContext.label}</p>
						<SheetTitle className="font-semibold text-xl tracking-tight">Conceder acesso</SheetTitle>
						<SheetDescription>
							Escolha a pessoa, a OM e quantos papéis quiser. Você concede só nas OMs que administra
							{isGlobalAdmin ? ", e só o administrador global concede acesso global" : ""}.
						</SheetDescription>
					</SheetHeader>
					<div className="px-4 pb-8">
						{adminScope.isError ? (
							<p className="text-destructive text-sm">Não foi possível carregar as OMs que você administra.</p>
						) : adminScope.isLoading ? (
							<Skeleton className="h-40 w-full" />
						) : (
							<GrantRolesForm
								units={units}
								allowGlobal={isGlobalAdmin}
								initialUnit={defaultUnit}
								currentUserId={currentUserId}
								isGlobalAdmin={isGlobalAdmin}
								onClose={() => setGranting(false)}
							/>
						)}
					</div>
				</SheetContent>
			</Sheet>

			<PersonPanel
				userId={search.person ?? null}
				onOpenChange={(open) => {
					if (!open) updateSearch({ person: undefined }, { resetPage: false })
				}}
				currentUserId={currentUserId}
				isGlobalAdmin={isGlobalAdmin}
				units={units}
				defaultUnit={defaultUnit}
			/>
		</div>
	)
}

/** Busca com espera: a URL (e o servidor) só mudam 300 ms depois da última tecla. */
function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
	const [draft, setDraft] = useState(value)

	// A URL mudou por fora (limpar filtros, voltar): o campo acompanha.
	useEffect(() => setDraft(value), [value])

	useEffect(() => {
		if (draft.trim() === value) return
		const handle = setTimeout(() => onChange(draft.trim()), 300)
		return () => clearTimeout(handle)
	}, [draft, value, onChange])

	return (
		<div className="relative w-full lg:max-w-sm">
			<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
			<Input
				type="search"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") onChange(draft.trim())
				}}
				placeholder="Buscar por nome, e-mail ou Nr. de ordem"
				aria-label="Buscar pessoa por nome, e-mail ou Nr. de ordem"
				className="h-9 pl-8"
			/>
		</div>
	)
}

/** "1.024 pessoas" — o total do recorte, e de quantas ele é recorte. */
function ListSummary({
	data,
	filtered,
	isLoading,
}: {
	data: { total: number; grandTotal: number; from: number; to: number } | undefined
	filtered: boolean
	isLoading: boolean
}) {
	if (isLoading || !data) return <p className="h-5 text-muted-foreground text-sm">&nbsp;</p>
	const people = (count: number) => `${formatCount(count)} ${count === 1 ? "pessoa" : "pessoas"}`
	return (
		<p className="text-muted-foreground text-sm" aria-live="polite">
			{filtered ? (
				<>
					<span className="font-medium text-foreground">{people(data.total)}</span> no filtro, de {people(data.grandTotal)} com papel
				</>
			) : (
				<>
					<span className="font-medium text-foreground">{people(data.total)}</span> com papel
				</>
			)}
			{data.total > 0 ? ` · mostrando ${formatCount(data.from)}–${formatCount(data.to)}` : ""}
		</p>
	)
}

function Pagination({
	page,
	pageCount,
	size,
	onPage,
	onSize,
}: {
	page: number
	pageCount: number
	size: PageSize
	onPage: (page: number) => void
	onSize: (size: PageSize) => void
}) {
	return (
		<nav aria-label="Paginação da lista de acessos" className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<span id="por-pagina">Por página</span>
				<Select<string> value={String(size)} onValueChange={(value) => value && onSize(Number(value) as PageSize)}>
					<SelectTrigger aria-labelledby="por-pagina" className="h-8 w-20">
						<SelectValue>{String(size)}</SelectValue>
					</SelectTrigger>
					<SelectContent alignItemWithTrigger={false}>
						{PAGE_SIZES.map((option) => (
							<SelectItem key={option} value={String(option)}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex items-center gap-2">
				<Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
					<NavArrowLeft aria-hidden="true" />
					Anterior
				</Button>
				<span className="min-w-28 text-center text-sm tabular-nums" aria-current="page">
					Página {formatCount(page)} de {formatCount(pageCount)}
				</span>
				<Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
					Próxima
					<NavArrowRight aria-hidden="true" />
				</Button>
			</div>
		</nav>
	)
}
