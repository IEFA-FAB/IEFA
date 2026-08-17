import { Link } from "@tanstack/react-router"

/**
 * Links legais dentro da área autenticada.
 *
 * Antes eles existiam só no rodapé do layout `_public`: quem estava logado — a
 * totalidade do uso real do SISUB — não tinha como chegar à Política de
 * Privacidade sem deslogar. Some no modo ícone da sidebar, onde não há largura
 * para texto.
 */
export function SidebarLegalLinks() {
	return (
		<nav aria-label="Documentos legais" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1 group-data-[collapsible=icon]:hidden">
			<Link to="/termos-de-uso" className="text-[10px] text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground">
				Termos
			</Link>
			<span aria-hidden="true" className="text-[10px] text-sidebar-foreground/30">
				·
			</span>
			<Link to="/politica-de-privacidade" className="text-[10px] text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground">
				Privacidade
			</Link>
			<span aria-hidden="true" className="text-[10px] text-sidebar-foreground/30">
				·
			</span>
			<Link to="/politica-de-cookies" className="text-[10px] text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground">
				Cookies
			</Link>
		</nav>
	)
}
