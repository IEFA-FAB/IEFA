import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { motion } from "motion/react"
import { IconRenderer } from "#/components/icon-renderer"
import type { Tool } from "#/lib/types"

interface ToolCardProps {
	tool: Tool
	index: number
	onDelete?: () => void
}

const MotionLink = motion(Link)

const cardMotionProps = {
	initial: { opacity: 0, y: 20 },
	animate: { opacity: 1, y: 0 },
	whileHover: {
		y: -8,
		boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
	},
} as const

const cardClassName = "block bg-white rounded-2xl p-8 flex flex-col h-full transition-all duration-300 border border-slate-100 shadow-sm"

function CardInner({ tool }: { tool: Tool }) {
	return (
		<>
			<div className="flex justify-between items-start mb-6">
				<div className={`p-4 ${tool.iconColor || "bg-tech-cyan"} rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
					<IconRenderer iconKey={tool.icon} className="w-6 h-6" />
				</div>
				<span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
					{tool.category}
				</span>
			</div>

			<h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-tech-cyan transition-colors">{tool.title}</h3>

			<p className="text-slate-500 text-sm leading-relaxed mb-8 flex-grow">{tool.description}</p>

			<div className="flex items-center text-tech-cyan text-sm font-bold uppercase tracking-tight">
				Acessar Ferramenta <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
			</div>
		</>
	)
}

export function ToolCard({ tool, index, onDelete }: ToolCardProps) {
	return (
		<div className="relative group">
			{tool.internalPath ? (
				<MotionLink to={tool.internalPath} {...cardMotionProps} transition={{ delay: index * 0.07 }} className={cardClassName}>
					<CardInner tool={tool} />
				</MotionLink>
			) : (
				<motion.a
					href={tool.url ?? "#"}
					target="_blank"
					rel="noopener noreferrer"
					{...cardMotionProps}
					transition={{ delay: index * 0.07 }}
					className={cardClassName}
				>
					<CardInner tool={tool} />
				</motion.a>
			)}

			{onDelete && (
				<button
					type="button"
					onClick={onDelete}
					className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm z-20"
					title="Excluir"
				>
					<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
				</button>
			)}
		</div>
	)
}
