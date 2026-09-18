import { Link, useRouterState } from "@tanstack/react-router"
import { NavArrowRight } from "iconoir-react"
import type { ReactNode } from "react"
import { LegalNoticeBanner } from "@/components/LegalNoticeBanner"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { CONTRATE_MODULES, type ContrateModule, type ContrateModuleId } from "@/lib/modules"
import { AppSidebar } from "./AppSidebar"
import { findActiveNavItem, normalizePath } from "./ModuleNav"
import { readSidebarOpen } from "./sidebar-state"

/**
 * Casca dos módulos (`/aci`, `/alpha`, `/pregoeiro`, `/admin`) — a mesma arquitetura
 * do sisub e do sucont: barra lateral com seletor de módulo e navegação do módulo,
 * e à direita uma barra fina com o gatilho da barra e a trilha.
 *
 * A home, o login e as páginas legais NÃO usam esta casca: ficam no `AppLayout`,
 * que é a porta de entrada e não mostra o miolo dos módulos.
 *
 * Cada rota de módulo monta a sua casca, então trocar de módulo remonta a barra.
 * O estado aberto/recolhido não se perde nisso: ele vem do cookie a cada montagem.
 */
export function ModuleShell({ moduleId, children }: { moduleId: ContrateModuleId; children: ReactNode }) {
	const module = CONTRATE_MODULES.find((m) => m.id === moduleId)
	if (!module) throw new Error(`Módulo desconhecido: ${moduleId}`)

	return (
		<SidebarProvider defaultOpen={readSidebarOpen()}>
			<a
				href="#conteudo"
				className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 bg-primary px-3 py-2 text-primary-foreground text-sm"
			>
				Ir para o conteúdo
			</a>

			<AppSidebar module={module} />

			<SidebarInset>
				<header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:px-6 print:hidden">
					<SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
					<Separator orientation="vertical" className="mx-1 h-5 data-[orientation=vertical]:self-center" />
					<ModuleBreadcrumb module={module} />
				</header>

				<main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
					<div className="mx-auto w-full max-w-[1280px] px-4 py-8 md:px-8 md:py-10 print:max-w-none print:p-0">{children}</div>
				</main>
			</SidebarInset>

			<LegalNoticeBanner />
		</SidebarProvider>
	)
}

interface Crumb {
	label: string
	to: string
	/** Esconde a etapa em tela estreita quando houver outra depois dela. */
	collapsible?: boolean
}

/**
 * Trilha do cabeçalho: Contrate › Módulo › Tela.
 *
 * "Contrate" é a volta para a home — a porta de entrada do app, que apresenta os
 * módulos. O módulo leva à entrada dele; a tela vem do MESMO critério de ativo da
 * barra. Tela fora da navegação (um processo, um relatório) termina no módulo, e o
 * título dela é o `h1` da página logo abaixo — repeti-lo aqui seria título duplo.
 */
function ModuleBreadcrumb({ module }: { module: ContrateModule }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const item = findActiveNavItem(pathname, module)

	const crumbs: Crumb[] = [
		{ label: "Contrate", to: "/" },
		{ label: module.label, to: module.home, collapsible: item !== null },
		...(item ? [{ label: item.label, to: item.to }] : []),
	]

	return (
		<nav aria-label="Trilha de navegação" className="flex min-w-0 items-center">
			<ol className="flex min-w-0 items-center gap-1.5 text-sm">
				{crumbs.map((crumb, i) => {
					const isLast = i === crumbs.length - 1
					const isCurrent = isLast && normalizePath(pathname) === normalizePath(crumb.to)
					const isBrand = i === 0
					return (
						<li key={crumb.to + crumb.label} className={`min-w-0 items-center gap-1.5 ${crumb.collapsible ? "hidden sm:flex" : "flex"}`}>
							{i > 0 && <NavArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
							{isCurrent ? (
								<span className="truncate font-medium text-foreground" aria-current="page">
									{crumb.label}
								</span>
							) : (
								<Link
									to={crumb.to}
									aria-label={isBrand ? "Contrate — página inicial" : undefined}
									className={`truncate transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
										isBrand ? "shrink-0 font-bold text-foreground tracking-tight" : isLast ? "font-medium text-foreground" : "text-muted-foreground"
									}`}
								>
									{crumb.label}
								</Link>
							)}
						</li>
					)
				})}
			</ol>
		</nav>
	)
}
