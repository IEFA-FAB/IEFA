import { motion, useReducedMotion } from "motion/react"
import { IconRenderer } from "#/components/icon-renderer"
import type { Tool } from "#/lib/types"

interface SidebarRailItemProps {
	tool: Tool
	index: number
	side: "left" | "right"
}

export function SidebarRailItem({ tool, index, side }: SidebarRailItemProps) {
	const reduceMotion = useReducedMotion()
	const motionProps = reduceMotion
		? {}
		: {
				initial: { opacity: 0, scale: 0.8 },
				animate: { opacity: 1, scale: 1 },
				transition: { delay: Math.min(index, 8) * 0.05 },
				whileHover: { scale: 1.1 },
			}

	return (
		<motion.a
			href={tool.url ?? "#"}
			target="_blank"
			rel="noopener noreferrer"
			{...motionProps}
			className="relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-muted"
		>
			<div className="text-muted-foreground group-hover:text-tech-cyan transition-colors">
				<IconRenderer iconKey={tool.icon} className="w-4 h-4" />
			</div>
			{/* Nome do sistema: o balão abaixo é a versão visual, o texto oculto é o que o leitor de tela anuncia. */}
			<span className="sr-only">{tool.title}</span>
			<div
				aria-hidden="true"
				className={`
          absolute z-50 px-2 py-1 text-[10px] font-bold bg-slate-800 text-white rounded
          whitespace-nowrap pointer-events-none
          opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity
          ${side === "left" ? "left-full ml-2" : "right-full mr-2"}
        `}
			>
				{tool.title}
			</div>
		</motion.a>
	)
}
