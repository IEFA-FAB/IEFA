import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useRouter, useRouterState } from "@tanstack/react-router"
import { FileBarChart, LayoutGrid, LogOut, type LucideIcon, Menu, Monitor, Search, SquareKanban, X } from "lucide-react"
import type React from "react"
import { useEffect, useId, useRef, useState } from "react"
import { authActions, authQueryOptions } from "#/auth/service"
import { LegalNotice } from "#/components/LegalNotice"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import { useHubFilters } from "#/lib/hub-filters"

/**
 * Navegação do hub — as três telas do app.
 *
 * Antes esta lista morava num herói escuro, como pílulas `bg-white/5 text-white`
 * (branco a 5% de opacidade atrás de texto branco: ilegíveis), enquanto a barra
 * lateral mostrava as etapas do ciclo com a MESMA aparência. Duas coisas
 * diferentes — navegar e filtrar — pintadas igual, e o usuário não tinha como
 * saber qual delas o botão faria.
 *
 * Agora a barra lateral é só navegação; o filtro por etapa mora na tela que
 * filtra (o catálogo), ao lado dos outros filtros.
 */
const NAV_LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
	{ to: "/", label: "Catálogo", icon: LayoutGrid },
	{ to: "/workspace", label: "Área de trabalho", icon: SquareKanban },
	{ to: "/reports", label: "Relatórios", icon: FileBarChart },
]

interface HubLayoutProps {
	children: React.ReactNode
	/** Título da tela. Vira o `h1` da página — os cabeçalhos internos são `h2`. */
	title?: string
	/** Uma linha sobre o que a tela faz, ao lado do título. */
	description?: string
	/** A tela consome `?q=`. Sem isso a barra de busca some — campo que não filtra nada mente sobre o que faz. */
	searchable?: boolean
}

export function HubLayout({ children, title, description, searchable = false }: HubLayoutProps) {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	// O menu mobile guarda a rota em que foi aberto: navegar muda o pathname e o
	// painel — que é overlay e cobriria a tela nova — se fecha sozinho.
	const [menuPath, setMenuPath] = useState<string | null>(null)
	const menuOpen = menuPath === pathname

	return (
		<div className="min-h-screen bg-tech-bg selection:bg-tech-cyan/10 selection:text-tech-cyan flex">
			{/* ── Left Sidebar (desktop) ───────────────────────── */}
			<aside className="w-64 hidden lg:flex flex-col p-6 fixed top-0 left-0 h-screen bg-card border-r border-border z-20">
				<HubBrand />
				<HubNav pathname={pathname} />
				<div className="mt-auto">
					<UserBlock />
				</div>
			</aside>

			{/* ── Mobile top bar + drawer ───────────────────────── */}
			<div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 py-3 bg-card border-b border-border">
				<div className="flex items-center gap-2 min-w-0">
					<div className="w-8 h-8 bg-tech-blue rounded-lg flex items-center justify-center text-white shrink-0">
						<Monitor className="w-4 h-4" />
					</div>
					<span className="text-xs font-bold text-foreground truncate">SUCONT-4 HUB</span>
				</div>
				<Button
					type="button"
					onClick={() => setMenuPath(pathname)}
					aria-label="Abrir menu"
					aria-expanded={menuOpen}
					variant="ghost"
					size="icon"
					className="rounded-lg text-muted-foreground hover:bg-muted"
				>
					<Menu className="w-5 h-5" />
				</Button>
			</div>

			{menuOpen && <MobileMenu pathname={pathname} onClose={() => setMenuPath(null)} />}

			{/* ── Main Area ─────────────────────────────────────── */}
			<div className="flex-grow lg:ml-64 relative z-10 pt-14 lg:pt-0">
				{(title || searchable) && (
					<header className="px-4 md:px-8 pt-8 pb-6 max-w-6xl mx-auto flex flex-col gap-6">
						{title && (
							<div className="flex flex-col gap-1">
								<h1 className="text-heading text-foreground">{title}</h1>
								{description && <p className="text-caption text-muted-foreground">{description}</p>}
							</div>
						)}
						{searchable && <HubSearchBar />}
					</header>
				)}

				<main className={`px-4 md:px-8 pb-24 max-w-6xl mx-auto ${title || searchable ? "" : "pt-8"}`}>{children}</main>

				<footer className="px-4 md:px-8 pb-12 max-w-6xl mx-auto mt-4 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
					<div className="flex flex-col items-center gap-2 md:items-end">
						<LegalFooterLinks
							className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
							linkClassName="text-label font-mono text-muted-foreground transition-colors hover:text-foreground"
						/>
						<p className="text-hint font-mono text-muted-foreground text-center md:text-right">© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB</p>
					</div>
				</footer>
			</div>

			<LegalNotice />
		</div>
	)
}

function HubBrand() {
	return (
		<Link to="/" className="flex items-center gap-3 mb-10 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
			<div className="w-10 h-10 bg-tech-blue rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
				<Monitor className="w-6 h-6" />
			</div>
			<div className="flex flex-col">
				<span className="text-sm font-bold text-foreground leading-tight">SUCONT-4 HUB</span>
				<span className="text-label text-muted-foreground">DIREF • COMAER</span>
			</div>
		</Link>
	)
}

function HubNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
	return (
		<nav className="flex flex-col gap-2" aria-label="Telas do hub">
			{NAV_LINKS.map((item) => {
				const Icon = item.icon
				const isActive = pathname === item.to
				return (
					<Link
						key={item.to}
						to={item.to}
						onClick={onNavigate}
						aria-current={isActive ? "page" : undefined}
						className={`flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-colors ${
							isActive ? "bg-tech-blue text-white shadow-md" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
						}`}
					>
						<Icon className="w-4 h-4 shrink-0" />
						<span>{item.label}</span>
					</Link>
				)
			})}
		</nav>
	)
}

function MobileMenu({ pathname, onClose }: { pathname: string; onClose: () => void }) {
	const panelRef = useRef<HTMLDivElement>(null)

	// Esc fecha; o foco vai para o painel para que o leitor de tela anuncie o menu.
	useEffect(() => {
		panelRef.current?.focus()
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [onClose])

	return (
		<div className="lg:hidden fixed inset-0 z-50 flex">
			<button
				type="button"
				aria-label="Fechar menu"
				onClick={onClose}
				className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px] focus-visible:ring-[3px] focus-visible:ring-ring/50"
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label="Menu do hub"
				tabIndex={-1}
				className="relative w-72 max-w-[85vw] h-full bg-card p-6 flex flex-col overflow-y-auto shadow-xl outline-none"
			>
				<div className="flex items-start justify-between gap-2">
					<HubBrand />
					<Button
						type="button"
						onClick={onClose}
						aria-label="Fechar menu"
						variant="ghost"
						size="icon-sm"
						className="rounded-lg text-muted-foreground hover:bg-muted"
					>
						<X className="w-4 h-4" />
					</Button>
				</div>

				<HubNav pathname={pathname} onNavigate={onClose} />

				<div className="mt-auto pt-6">
					<UserBlock />
				</div>
			</div>
		</div>
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
		<div className="flex items-center gap-3 bg-card p-3 rounded-2xl border border-border shadow-sm">
			<Search className="w-4 h-4 text-muted-foreground ml-2 shrink-0" aria-hidden="true" />
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
					className="w-7 h-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<X className="w-3.5 h-3.5" />
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
 * Identidade + saída. O rótulo "Sessão" que ficava aqui não dizia nada que a
 * própria presença do e-mail já não dissesse; quem lê a barra quer saber com que
 * conta está e como sair dela.
 */
function UserBlock() {
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
		return <div className="h-12 w-full rounded-2xl bg-muted animate-pulse" aria-hidden="true" />
	}

	if (!user) {
		return (
			<Button render={<Link to="/auth" />} nativeButton={false} variant="outline" className="w-full justify-center rounded-xl text-xs font-bold">
				Entrar
			</Button>
		)
	}

	const name = displayName(user.user_metadata?.name as string | undefined, email)

	return (
		<div className="flex items-center gap-3 p-3 bg-card rounded-2xl border border-border">
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tech-blue text-white text-label font-bold" aria-hidden="true">
				{initials(name)}
			</div>
			{/* O e-mail trunca na largura da barra; o tooltip mostra o endereço inteiro
			    sem recorrer ao atributo `title`, que o contrato proíbe (§5). */}
			<Tooltip>
				<TooltipTrigger
					render={
						<div className="flex min-w-0 cursor-default flex-col text-left">
							<span className="text-xs font-bold text-foreground truncate">{name}</span>
							<span className="text-hint text-muted-foreground truncate">{email}</span>
						</div>
					}
				/>
				<TooltipContent>{email}</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							type="button"
							onClick={logout}
							aria-label="Sair"
							variant="ghost"
							size="icon-sm"
							className="ml-auto shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						>
							<LogOut className="w-4 h-4" />
						</Button>
					}
				/>
				<TooltipContent>Sair</TooltipContent>
			</Tooltip>
		</div>
	)
}
