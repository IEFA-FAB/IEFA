import { useContext } from "react"
import { ThemeContext } from "@/components/common/shared/themeService"

export function useTheme() {
	return useContext(ThemeContext)
}
