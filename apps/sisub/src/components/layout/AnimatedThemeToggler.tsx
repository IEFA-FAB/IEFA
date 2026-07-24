import { Moon, Sun } from "lucide-react"
import { startTransition, useRef } from "react"
import { cn } from "@/lib/cn"

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {
	duration?: number
	toggle: () => void
}

export const AnimatedThemeToggler = ({ className, duration = 400, toggle, ...props }: AnimatedThemeTogglerProps) => {
	const buttonRef = useRef<HTMLButtonElement>(null)

	const handleToggle = () => {
		if (!document.startViewTransition) {
			toggle()
			return
		}

		const button = buttonRef.current
		if (!button) return

		const { top, left, width, height } = button.getBoundingClientRect()

		const x = left + width / 2
		const y = top + height / 2

		const right = window.innerWidth - left
		const bottom = window.innerHeight - top
		const maxRadius = Math.hypot(Math.max(left, right), Math.max(top, bottom))

		document.documentElement.style.setProperty("--vt-clip-x", `${x}px`)
		document.documentElement.style.setProperty("--vt-clip-y", `${y}px`)
		document.documentElement.style.setProperty("--vt-clip-r", `${maxRadius}px`)
		document.documentElement.style.setProperty("--vt-duration", `${duration}ms`)

		document.startViewTransition(() => {
			startTransition(() => {
				toggle()
			})
		})
	}

	return (
		<button
			ref={buttonRef}
			onClick={handleToggle}
			className={cn(
				"relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full p-2 transition-colors hover:bg-accent",
				className
			)}
			{...props}
		>
			<div className="relative size-5">
				<Sun className={"absolute inset-0 size-full transition-all duration-300 rotate-0 scale-100 opacity-100 dark:rotate-90 dark:scale-0 dark:opacity-0"} />
				<Moon className={"absolute inset-0 size-full transition-all duration-300 dark:rotate-0 -rotate-90 scale-0 opacity-0 dark:scale-100 dark:opacity-100"} />
			</div>
			<span className="sr-only">Alternar tema</span>
		</button>
	)
}
