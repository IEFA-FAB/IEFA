import { motion } from "motion/react"
import { IconRenderer } from "#/components/icon-renderer"
import type { Tool } from "#/lib/types"

interface SidebarRailItemProps {
	tool: Tool
	index: number
	side: "left" | "right"
}

export function SidebarRailItem({ tool, index, side }: SidebarRailItemProps) {
	return (
		<motion.a
			href={tool.url}
			target="_blank"
			rel="noopener noreferrer"
			initial={{ opacity: 0, scale: 0.8 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ delay: index * 0.05 }}
			whileHover={{ scale: 1.1 }}
			className="relative group flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:bg-slate-100"
			title={tool.title}
		>
			<div className="text-slate-400 group-hover:text-tech-cyan transition-colors">
				<IconRenderer iconKey={tool.icon} className="w-4 h-4" />
			</div>
			{/* Tooltip */}
			<div
				className={`
          absolute z-50 px-2 py-1 text-[10px] font-bold bg-slate-800 text-white rounded
          whitespace-nowrap pointer-events-none
          opacity-0 group-hover:opacity-100 transition-opacity
          ${side === "left" ? "left-full ml-2" : "right-full mr-2"}
        `}
			>
				{tool.title}
			</div>
		</motion.a>
	)
}
