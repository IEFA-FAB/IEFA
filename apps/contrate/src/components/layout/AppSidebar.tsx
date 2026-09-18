import { Link } from "@tanstack/react-router"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail, SidebarSeparator } from "@/components/ui/sidebar"
import type { ContrateModule } from "@/lib/modules"
import type { ScopeContext } from "@/lib/scope"
import { ModuleNav } from "./ModuleNav"
import { ModuleSwitcher } from "./ModuleSwitcher"
import { ScopeSwitcher } from "./ScopeSwitcher"
import { SidebarUser } from "./SidebarUser"

const LEGAL_LINKS = [
	{ to: "/termos-de-uso", label: "Termos" },
	{ to: "/politica-de-privacidade", label: "Privacidade" },
	{ to: "/politica-de-cookies", label: "Cookies" },
] as const

/**
 * Documentos legais na base da barra — o lugar que o sisub e o sucont usam. Dentro
 * de um módulo a página não tem rodapé (ela rola; o bloco ficaria pendurado sob
 * tabelas de altura variável), e o LGPD.md pede caminho até o documento em todo app
 * que trata dado pessoal.
 *
 * Some no modo ícone, onde não há largura para texto. Não fica inalcançável: a barra
 * volta em um clique, a gaveta mobile mostra o rodapé inteiro, e as três rotas
 * seguem linkadas na home e na tela de login.
 */
function SidebarLegalLinks() {
	return (
		<nav aria-label="Documentos legais" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1 group-data-[collapsible=icon]:hidden">
			{LEGAL_LINKS.map((link, index) => (
				<span key={link.to} className="flex items-center gap-x-2">
					{index > 0 && (
						<span aria-hidden="true" className="text-[11px] text-sidebar-foreground/30">
							·
						</span>
					)}
					<Link
						to={link.to}
						className="text-[11px] text-sidebar-foreground/60 underline-offset-4 transition-colors hover:text-sidebar-foreground hover:underline focus-visible:outline-2 focus-visible:outline-sidebar-ring focus-visible:outline-offset-2"
					>
						{link.label}
					</Link>
				</span>
			))}
		</nav>
	)
}

/**
 * Barra lateral de um módulo: seletor de módulo no topo (e o de OM logo abaixo, nos módulos
 * com escopo), navegação do módulo no meio, tema, pessoa e documentos legais embaixo.
 * Recolhe para trilho de ícones no desktop e vira gaveta no celular.
 */
export function AppSidebar({ module, scope }: { module: ContrateModule; scope: ScopeContext | null }) {
	return (
		<Sidebar collapsible="icon" mobileTitle={`Menu — ${module.label}`} mobileDescription="Troca de módulo, telas do módulo e conta.">
			<SidebarHeader className="border-sidebar-border border-b">
				<ModuleSwitcher active={module} />
				{scope ? <ScopeSwitcher module={module} scope={scope} /> : null}
			</SidebarHeader>

			<SidebarContent>
				<ModuleNav module={module} scope={scope} />
			</SidebarContent>

			<SidebarFooter>
				<SidebarSeparator className="mx-0" />
				<SidebarUser />
				<SidebarLegalLinks />
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	)
}
