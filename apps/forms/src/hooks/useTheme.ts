import { useContext } from "react"
import { ThemeContext } from "@/components/themeService"

export function useTheme() {
	return useContext(ThemeContext)
}
