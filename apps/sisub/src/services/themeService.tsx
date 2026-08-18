import { createIsomorphicFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"
import type { ReactNode } from "react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Theme = "dark" | "light"

export interface ThemeContextType {
	theme: Theme
	setTheme: (theme: Theme) => void
	toggle: () => void
}

const COOKIE_NAME = "theme"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365
/** Onde a escolha morava antes do cookie. Só é lido, para migrar quem já tinha escolhido. */
const LEGACY_STORAGE_KEY = "theme"

const parseTheme = (value: string | null | undefined): Theme | null => (value === "dark" || value === "light" ? value : null)

// `document.cookie` lança em iframe sandboxed sem allow-same-origin, e esta
// leitura roda no render do shell: deixar a exceção subir derrubaria a página.
const readCookieOnClient = (): Theme | null => {
	try {
		const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/)
		return parseTheme(match?.[1])
	} catch {
		return null
	}
}

/**
 * Escolha explícita do usuário, ou `null` para "segue o sistema" — caso em que
 * ninguém escreve classe nenhuma no <html> e a media query do CSS decide.
 *
 * Precisa ser isomórfico e dar o MESMO valor dos dois lados: é o que o servidor
 * escreve no <html> e o que o React encontra ao hidratar. Cookie (e não
 * localStorage) exatamente por isso — o servidor consegue ler.
 */
export const readThemePreference = createIsomorphicFn()
	.server((): Theme | null => parseTheme(getCookie(COOKIE_NAME)))
	.client(readCookieOnClient)

/** Devolve se a escrita pegou — cookie bloqueado não vira erro, vira silêncio. */
const persistTheme = (theme: Theme): boolean => {
	try {
		const secure = window.location.protocol === "https:" ? "; secure" : ""
		// biome-ignore lint/suspicious/noDocumentCookie: a CookieStore API não existe no Safari nem no Firefox, e escrever o tema precisa ser síncrono — o próximo render do shell lê esse cookie.
		document.cookie = `${COOKIE_NAME}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`
		return readCookieOnClient() === theme
	} catch {
		return false
	}
}

// localStorage lança (SecurityError) quando o site está com armazenamento
// bloqueado. O script inline que isso substituiu tinha try/catch; sem ele, a
// exceção sobe de dentro de um efeito já commitado e derruba a página inteira
// no error boundary — por causa de uma migração de preferência de tema.
const readLegacyTheme = (): Theme | null => {
	try {
		return parseTheme(localStorage.getItem(LEGACY_STORAGE_KEY))
	} catch {
		return null
	}
}

const dropLegacyTheme = () => {
	try {
		localStorage.removeItem(LEGACY_STORAGE_KEY)
	} catch {
		// nada a fazer: a escolha já está no cookie
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

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme | null; children: ReactNode }) {
	// Sem escolha explícita (`initialTheme` null) o CSS já está pintando pela
	// preferência do SO, mas o React não sabe qual é sem tocar em `window` — e
	// tocar durante o primeiro render voltaria a divergir do HTML do servidor.
	// Então o primeiro render usa "light" nos dois lados e o efeito abaixo
	// alinha o estado depois da hidratação. Só consumidores em JS (o Toaster, o
	// ícone do botão) dependem desse valor; as cores não.
	const [theme, setThemeState] = useState<Theme>(initialTheme ?? "light")

	const setTheme = useCallback((next: Theme): boolean => {
		// Cookie e DOM antes do estado: o <html> do shell é renderizado a partir
		// do cookie, então ele precisa já estar escrito quando o React repintar.
		const persisted = persistTheme(next)
		applyThemeToDom(next)
		setThemeState(next)
		return persisted
	}, [])

	useEffect(() => {
		if (initialTheme) return

		const legacy = readLegacyTheme()
		if (legacy) {
			// Quem escolheu tema quando a escolha vivia no localStorage mantém a
			// escolha — ela passa para o cookie e o servidor acerta já na próxima
			// visita. Custo: uma única troca visível, nesta primeira carga.
			// A chave antiga só sai se o cookie tiver pegado: com cookie bloqueado,
			// apagá-la jogaria a escolha fora sem ter para onde mudá-la.
			if (setTheme(legacy)) dropLegacyTheme()
			return
		}

		// O CSS acompanha o SO ao vivo pela media query; o estado em JS precisa
		// acompanhar junto, senão quem troca o tema do sistema com a página aberta
		// fica com o valor velho — e o primeiro clique no botão não faz nada.
		const query = window.matchMedia("(prefers-color-scheme: dark)")
		const sync = () => setThemeState(query.matches ? "dark" : "light")
		sync()
		query.addEventListener("change", sync)
		return () => query.removeEventListener("change", sync)
	}, [initialTheme, setTheme])

	const toggle = () => setTheme(theme === "dark" ? "light" : "dark")

	return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
	return useContext(ThemeContext)
}
