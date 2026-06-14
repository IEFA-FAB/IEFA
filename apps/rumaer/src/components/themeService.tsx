import type { ReactNode } from "react"
import { createContext, useContext, useState } from "react"

export type Theme = "dark" | "light"

export interface ThemeContextType {
	theme: Theme
	setTheme: (theme: Theme) => void
	toggle: () => void
}

const STORAGE_KEY = "theme"

export const getStoredTheme = (): Theme => {
	if (typeof window === "undefined") return "light"
	const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
	if (stored === "dark" || stored === "light") return stored
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export const applyThemeToDom = (theme: Theme) => {
	if (typeof window === "undefined") return
	const root = document.documentElement
	root.classList.remove("light", "dark")
	root.classList.add(theme)
	root.style.colorScheme = theme
	localStorage.setItem(STORAGE_KEY, theme)
}

// Inline script that runs before React hydrates — sets the correct CSS class
// on <html> so no flash occurs. Kept in <head> via ThemeScript.
const themeScript = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var t=s==='dark'||s==='light'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t;}catch(e){}})()`

export const ThemeScript = () => (
	// biome-ignore lint/security/noDangerouslySetInnerHtml: inline script prevents theme flash before React hydrates
	<script dangerouslySetInnerHTML={{ __html: themeScript }} />
)

export const ThemeContext = createContext<ThemeContextType>({
	theme: "light",
	setTheme: () => {},
	toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
	// Read theme from the DOM class that ThemeScript already set.
	// On server: no DOM → "light" (SSR-safe neutral default).
	// On client: reads the actual class so toggle() direction is always correct.
	// ThemeProvider renders no theme-dependent DOM itself, so having a different
	// value between server ("light") and client ("dark") does NOT cause a
	// hydration mismatch.
	const [theme, setThemeState] = useState<Theme>(() => {
		if (typeof window === "undefined") return "light"
		return document.documentElement.classList.contains("dark") ? "dark" : "light"
	})

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme)
		applyThemeToDom(newTheme)
	}

	const toggle = () => setTheme(theme === "dark" ? "light" : "dark")

	return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
	return useContext(ThemeContext)
}
