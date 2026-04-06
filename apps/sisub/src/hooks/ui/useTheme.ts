import { useContext } from "react"
import { ThemeContext } from "@/services/themeService"

export function useTheme() {
	return useContext(ThemeContext)
}
