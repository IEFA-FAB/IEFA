import type { ReactNode } from "react"
import { createContext, useCallback, useContext, useState } from "react"

/**
 * Tema do sucont — mesma implementação do sisub (`services/themeService.tsx`),
 * que o STYLE_CONTRACT nomeia como contrato irmão.
 *
 * Antes disto o tema escuro existia só DENTRO do auditor: um `useState(true)` e
 * uma classe `dark` numa `<div>` de rota. Entrar na ferramenta escurecia a tela e
 * sair a clareava, e as outras onze telas não tinham como chegar ao escuro apesar
 * de todos os tokens `.dark` estarem escritos. O §5 do contrato já proibia rota
 * mutar o tema; faltava o lugar certo para a escolha morar.
 */
export type Theme = "dark" | "light"

export interface ThemeContextType {
	theme: Theme
	setTheme: (theme: Theme) => void
	toggle: () => void
}

export const THEME_COOKIE_NAME = "theme"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const parseTheme = (value: string | null | undefined): Theme | null => (value === "dark" || value === "light" ? value : null)

// `document.cookie` lança em iframe sandboxed sem allow-same-origin, e esta
// leitura roda no render do shell: deixar a exceção subir derrubaria a página.
export const readCookieOnClient = (): Theme | null => {
	try {
		const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/)
		return parseTheme(match?.[1])
	} catch {
		return null
	}
}

/**
 * Grava a escolha. Cookie bloqueado (armazenamento desligado, iframe sandboxed)
 * não vira erro nem aviso: a classe já foi aplicada no DOM, então a escolha vale
 * pela sessão inteira — navegação do TanStack Router é client-side e não repinta
 * o shell. Só um recarregamento duro volta ao claro, e não há nada a fazer sobre
 * isso sem reintroduzir o script inline que o cookie existe para evitar.
 */
const persistTheme = (theme: Theme): void => {
	try {
		const secure = window.location.protocol === "https:" ? "; secure" : ""
		// biome-ignore lint/suspicious/noDocumentCookie: a CookieStore API não existe no Safari nem no Firefox, e escrever o tema precisa ser síncrono — o próximo render do shell lê esse cookie.
		document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`
	} catch {
		// nada a fazer: o DOM já está no tema certo para esta sessão
	}
}

export const applyThemeToDom = (theme: Theme) => {
	if (typeof window === "undefined") return
	const root = document.documentElement
	root.classList.remove("light", "dark")
	root.classList.add(theme)
	root.style.colorScheme = theme
}

export const ThemeContext = createContext<ThemeContextType>({
	theme: "light",
	setTheme: () => {},
	toggle: () => {},
})

/**
 * `initialTheme` é obrigatório e nunca nulo: o shell resolve o cookie (padrão
 * claro) e escreve a classe no `<html>` antes do primeiro byte, então o React
 * hidrata com o mesmo valor que o servidor pintou.
 *
 * O sisub aceita `null` para "segue o SO" porque o `styles.css` dele tem o bloco
 * de tokens escuros repetido dentro de uma `@media (prefers-color-scheme: dark)`.
 * Aqui o `.dark` é a única fonte dos tokens escuros — duplicá-lo criaria duas
 * declarações da mesma decisão, livres para divergir sem ninguém notar.
 */
export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>(initialTheme)

	const setTheme = useCallback((next: Theme): void => {
		// Cookie e DOM antes do estado: o `<html>` do shell é renderizado a partir
		// do cookie, então ele precisa já estar escrito quando o React repintar.
		persistTheme(next)
		applyThemeToDom(next)
		setThemeState(next)
	}, [])

	const toggle = () => setTheme(theme === "dark" ? "light" : "dark")

	return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
	return useContext(ThemeContext)
}
