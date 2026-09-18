import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"
import { SIDEBAR_COOKIE_NAME } from "@/components/ui/sidebar"

/** Sem cookie a barra abre: quem chega pela primeira vez precisa ver os rótulos. */
const parseSidebarOpen = (value: string | null | undefined): boolean => value !== "false"

const readCookieOnClient = (): boolean => {
	try {
		const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE_NAME}=([^;]*)`))
		return parseSidebarOpen(match?.[1])
	} catch {
		// `document.cookie` lança em iframe sandboxed — e isto roda no render do shell.
		return true
	}
}

/**
 * Barra lateral aberta ou recolhida, lida do cookie `sidebar_state` — o mesmo nome
 * do sisub e do sucont.
 *
 * Isomórfica e síncrona, como a leitura do tema (`themeService.tsx`): no servidor
 * vem do cookie da requisição, no cliente do `document.cookie`, e os dois lados
 * dão o MESMO valor. Por isso o HTML do SSR já sai com a barra na largura certa e a
 * hidratação não salta 13rem. O sisub faz a mesma leitura no `beforeLoad` da rota
 * de módulos; aqui os módulos são quatro rotas irmãs sem layout comum, e ler no
 * render do shell evita repetir o `beforeLoad` em cada uma.
 *
 * O valor só serve de estado INICIAL do `SidebarProvider`; depois quem manda é o
 * estado do componente, e cada troca regrava o cookie.
 */
export const readSidebarOpen = createIsomorphicFn()
	.server((): boolean => parseSidebarOpen(getCookie(SIDEBAR_COOKIE_NAME)))
	.client(readCookieOnClient)
