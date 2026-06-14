import { CheckCircle, InfoCircle, Refresh, WarningTriangle, XmarkCircle } from "iconoir-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/hooks/useTheme"

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme } = useTheme()

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <CheckCircle className="size-4" />,
				info: <InfoCircle className="size-4" />,
				warning: <WarningTriangle className="size-4" />,
				error: <XmarkCircle className="size-4" />,
				loading: <Refresh className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	)
}

export { Toaster }
