export type Theme = "dark" | "light"

export interface ThemeContextType {
	theme: Theme
	setTheme: (theme: Theme) => void
	toggle: () => void
}

// Chave do LocalStorage
const STORAGE_KEY = "theme"

// 1. Função para ler o tema (Síncrona)
export const getStoredTheme = (): Theme => {
	if (typeof window === "undefined") return "light" // Fallback para SSR

	const localTheme = localStorage.getItem(STORAGE_KEY) as Theme | null
	if (localTheme) return localTheme

	// Se não tiver no storage, verifica preferência do sistema
	if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
		return "dark"
	}

	return "light"
}

// 2. Função para aplicar ao DOM (Síncrona e Imediata)
export const applyThemeToDom = (theme: Theme) => {
	if (typeof window === "undefined") return

	const root = window.document.documentElement

	root.classList.remove("light", "dark")
	root.classList.add(theme)
	root.style.colorScheme = theme

	localStorage.setItem(STORAGE_KEY, theme)
}

// 3. Script de Inicialização (Critical Path)
// Isso roda antes do React hidratar para evitar "flash"
const themeScript = `
(function() {
  try {
    var localTheme = localStorage.getItem('${STORAGE_KEY}');
    var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (localTheme === 'dark' || (!localTheme && supportDarkMode)) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`

export const ThemeScript = () => {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: injecting theme script to prevent flash of wrong theme
	return <script dangerouslySetInnerHTML={{ __html: themeScript }} />
}
