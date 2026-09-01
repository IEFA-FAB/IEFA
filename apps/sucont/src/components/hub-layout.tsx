import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useRouteContext, useRouter, useRouterState } from "@tanstack/react-router"
import { ChevronRight, FileBarChart, LayoutGrid, LogOut, type LucideIcon, Monitor, Search, SquareKanban, X } from "lucide-react"
import type React from "react"
import { useEffect, useId, useRef, useState } from "react"
import { authActions, authQueryOptions } from "#/auth/service"
import { IconRenderer } from "#/components/icon-renderer"
import { LegalNotice } from "#/components/LegalNotice"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Separator } from "#/components/ui/separator"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
} from "#/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import { sucontTools } from "#/lib/data"
import { useHubFilters } from "#/lib/hub-filters"
import { buildToolCrumbs, buildToolNav, findToolByPath, toolScopeLabel } from "#/lib/tool-nav"

/**
 * Navegação do hub — as três telas do app.
 *
 * A barra lateral é só navegação; o filtro por etapa mora na tela que filtra (o
 * catálogo). Antes as duas coisas tinham a mesma aparência e o usuário não tinha
 * como saber qual delas o botão faria.
 */
const NAV_LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
	{ to: "/", label: "Catálogo", icon: LayoutGrid },
	{ to: "/workspace", label: "Área de trabalho", icon: SquareKanban },
	{ to: "/reports", label: "Relatórios", icon: FileBarChart },
]

/** Ferramentas de rota interna, agrupadas por etapa — a mesma ordem do catálogo. */
const TOOL_NAV = buildToolNav(sucontTools)

interface HubLayoutProps {
	children: React.ReactNode
	/** Título da tela. Vira o `h1` da página — os cabeçalhos internos são `h2`. */
	title?: string
	/** Uma linha sobre o que a tela faz, abaixo do título. */
	description?: string
	/** A tela consome `?q=`. Sem isso a barra de busca some — campo que não filtra nada mente sobre o que faz. */
	searchable?: boolean
}

export function HubLayout({ children, title, description, searchable = false }: HubLayoutProps) {
	// Estado da barra lida do cookie no `beforeLoad` da raiz: o HTML do SSR já sai
	// no estado certo, sem o salto de 16rem na hidratação.
	const { sidebarOpen } = useRouteContext({ from: "__root__" })

	return (
		<SidebarProvider defaultOpen={sidebarOpen} className="bg-tech-bg selection:bg-tech-cyan/10 selection:text-tech-cyan">
			<HubSidebar />

			<SidebarInset className="bg-transparent min-w-0">
				<header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-tech-bg/80 px-4 backdrop-blur supports-backdrop-filter:bg-tech-bg/60 md:px-6">
					<SidebarTrigger className="text-muted-foreground hover:text-foreground" />
					<Separator orientation="vertical" className="mx-1 h-6 data-[orientation=vertical]:self-center" />
					<HubBreadcrumb title={title} />
				</header>

				<div className="flex-1">
					<div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-24 md:px-8">
						{(description || searchable) && (
							<div className="mb-8 flex flex-col gap-6">
								{description && <p className="text-caption text-muted-foreground">{description}</p>}
								{searchable && <HubSearchBar />}
							</div>
						)}
						{children}
					</div>

					<footer className="mx-auto mt-4 flex max-w-6xl flex-col items-center justify-between gap-6 border-t border-border px-4 pt-8 pb-12 md:flex-row md:px-8">
						<div className="flex flex-col items-center gap-2 md:items-end">
							<LegalFooterLinks
								className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
								linkClassName="text-label font-mono text-muted-foreground transition-colors hover:text-foreground"
							/>
							<p className="text-hint font-mono text-muted-foreground text-center md:text-right">© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB</p>
						</div>
					</footer>
				</div>
			</SidebarInset>

			<LegalNotice />
		</SidebarProvider>
	)
}

function HubSidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const activeTool = findToolByPath(sucontTools, pathname)

	return (
		<Sidebar collapsible="icon" variant="sidebar">
			<SidebarHeader>
				<HubBrand />
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Hub</SidebarGroupLabel>
					<SidebarMenu>
						{NAV_LINKS.map((item) => {
							const Icon = item.icon
							const isActive = pathname === item.to
							return (
								<SidebarMenuItem key={item.to}>
									<SidebarMenuButton
										tooltip={item.label}
										isActive={isActive}
										render={
											<Link to={item.to} aria-current={isActive ? "page" : undefined}>
												<Icon />
												<span>{item.label}</span>
											</Link>
										}
									/>
								</SidebarMenuItem>
							)
						})}
					</SidebarMenu>
				</SidebarGroup>

				{/*
				 * As ferramentas ficam na barra, agrupadas pela etapa do ciclo — é o que
				 * dá orientação DENTRO de uma ferramenta: qual está aberta, e o que mais
				 * existe na mesma etapa. Antes a barra só listava as três telas do hub, e
				 * ao entrar numa ferramenta nada indicava onde o usuário estava.
				 */}
				{TOOL_NAV.map((group) => (
					<SidebarGroup key={group.id}>
						<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
						<SidebarMenu>
							{group.tools.map((tool) => {
								const target = tool.internalPath as string
								const isActive = activeTool?.id === tool.id
								const scope = toolScopeLabel(tool)
								return (
									<SidebarMenuItem key={tool.id}>
										<SidebarMenuButton
											tooltip={scope ? `${tool.title} · ${scope}` : tool.title}
											isActive={isActive}
											render={
												<Link to={target} aria-current={isActive ? "page" : undefined}>
													<IconRenderer iconKey={tool.icon} />
													<span>{tool.title}</span>
												</Link>
											}
										/>
									</SidebarMenuItem>
								)
							})}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>

			<SidebarFooter>
				<SidebarSeparator />
				<NavUser />
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	)
}

/**
 * Trilha do cabeçalho. Dentro de uma ferramenta mostra Catálogo › Etapa ›
 * Ferramenta, com a etapa levando ao catálogo já filtrado por ela; fora, mostra
 * só o título da tela.
 *
 * O `h1` fica no último item da trilha quando há ferramenta — é o nome da página,
 * e duplicá-lo abaixo criaria dois títulos para a mesma coisa.
 */
function HubBreadcrumb({ title }: { title?: string }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const tool = findToolByPath(sucontTools, pathname)
	const crumbs = buildToolCrumbs(tool)
	const scope = toolScopeLabel(tool)

	if (crumbs.length === 0) {
		return title ? (
			<h1 className="text-subheading text-foreground truncate">{title}</h1>
		) : (
			<span className="text-subheading text-muted-foreground truncate">SUCONT-4 HUB</span>
		)
	}

	return (
		<nav aria-label="Trilha de navegação" className="flex min-w-0 items-center gap-1">
			<ol className="flex min-w-0 items-center gap-1">
				{crumbs.map((crumb, i) => {
					const isLast = i === crumbs.length - 1
					return (
						<li key={crumb.label} className="flex min-w-0 items-center gap-1">
							{i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
							{isLast ? (
								<h1 className="text-subheading text-foreground truncate">{crumb.label}</h1>
							) : (
								<Link
									to={crumb.to as string}
									search={crumb.search}
									className="text-subheading shrink-0 text-muted-foreground transition-colors hover:text-foreground"
								>
									{crumb.label}
								</Link>
							)}
						</li>
					)
				})}
			</ol>
			{/* O escopo da ferramenta: as questões do RAC que ela responde. Mesmo papel
			    do nome da cozinha/unidade no cabeçalho do sisub. */}
			{scope && (
				<span className="ml-2 hidden shrink-0 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-label text-muted-foreground sm:inline">
					{scope}
				</span>
			)}
		</nav>
	)
}

function HubBrand() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					size="lg"
					tooltip="SUCONT-4 HUB"
					render={
						<Link to="/">
							<div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-tech-blue text-white">
								<Monitor className="size-4" />
							</div>
							<div className="grid flex-1 text-left leading-tight">
								<span className="truncate text-sm font-bold text-foreground">SUCONT-4 HUB</span>
								<span className="truncate text-label text-muted-foreground">DIREF • COMAER</span>
							</div>
						</Link>
					}
				/>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}

function HubSearchBar() {
	const { query, setQuery } = useHubFilters()
	const inputId = useId()
	// Estado local para o campo responder instantaneamente; a URL recebe o valor
	// com atraso curto para não gravar uma navegação por tecla digitada.
	const [draft, setDraft] = useState(query)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		setDraft(query)
	}, [query])

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[]
	)

	function onChange(value: string) {
		setDraft(value)
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => setQuery(value), 200)
	}

	function clear() {
		if (timer.current) clearTimeout(timer.current)
		setDraft("")
		setQuery("")
	}

	return (
		<div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
			<Search className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<label htmlFor={inputId} className="sr-only">
				Buscar no hub
			</label>
			<Input
				id={inputId}
				type="search"
				placeholder="Buscar por módulo, assunto, Q35, SIAFI, Restos a Pagar..."
				className="h-auto w-full border-none bg-transparent p-0 text-sm text-muted-foreground shadow-none outline-none focus-visible:border-none focus-visible:ring-0 dark:bg-transparent"
				value={draft}
				onChange={(e) => onChange(e.target.value)}
			/>
			{draft !== "" && (
				<Button
					type="button"
					onClick={clear}
					aria-label="Limpar busca"
					variant="ghost"
					size="icon-xs"
					className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<X className="size-3.5" />
				</Button>
			)}
		</div>
	)
}

/**
 * Nome de exibição a partir do que o cadastro tem. `user_metadata.name` é o que o
 * `signUp` grava; sem ele, a parte local do e-mail é o melhor palpite — melhor que
 * repetir o endereço inteiro duas vezes na mesma linha.
 */
function displayName(name: string | undefined, email: string): string {
	const raw = name?.trim() || email.split("@")[0]?.replace(/[._-]+/g, " ") || ""
	return raw.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

function initials(label: string): string {
	const parts = label.split(/\s+/).filter(Boolean)
	if (parts.length === 0) return "?"
	const first = parts[0]?.[0] ?? ""
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
	return (first + last).toUpperCase()
}

/**
 * Identidade + saída, no formato do `NavUser` do sisub: linha de menu que colapsa
 * para o avatar quando a barra está em modo ícone.
 */
function NavUser() {
	const router = useRouter()
	const queryClient = useQueryClient()
	const { data: auth, isPending } = useQuery(authQueryOptions())
	const user = auth?.user ?? null
	const email = user?.email ?? ""

	async function logout() {
		await authActions.signOut()
		queryClient.clear()
		await router.navigate({ to: "/auth" })
	}

	if (isPending) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuSkeleton showIcon />
				</SidebarMenuItem>
			</SidebarMenu>
		)
	}

	if (!user) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton tooltip="Entrar" render={<Link to="/auth">Entrar</Link>} />
				</SidebarMenuItem>
			</SidebarMenu>
		)
	}

	const name = displayName(user.user_metadata?.name as string | undefined, email)

	return (
		<SidebarMenu>
			<SidebarMenuItem className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0">
				{/* O e-mail trunca; o tooltip mostra o endereço inteiro sem recorrer ao
				    atributo `title`, que o contrato proíbe (§5). O gatilho é o botão do
				    próprio primitivo, alcançável por teclado. */}
				<Tooltip>
					<TooltipTrigger
						render={
							<SidebarMenuButton size="lg" className="cursor-default">
								<div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-tech-blue text-label font-bold text-white">
									{initials(name)}
								</div>
								<div className="grid flex-1 text-left leading-tight">
									<span className="truncate text-xs font-bold text-foreground">{name}</span>
									<span className="truncate text-hint text-muted-foreground">{email}</span>
								</div>
							</SidebarMenuButton>
						}
					/>
					<TooltipContent side="right">{email}</TooltipContent>
				</Tooltip>

				{/* Continua visível colapsada — escondê-lo deixaria "sair" inalcançável
				    para quem trabalha com a barra em modo ícone. */}
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								type="button"
								onClick={logout}
								aria-label="Sair"
								variant="ghost"
								size="icon-sm"
								className="shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
							>
								<LogOut className="size-4" />
							</Button>
						}
					/>
					<TooltipContent side="right">Sair</TooltipContent>
				</Tooltip>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
