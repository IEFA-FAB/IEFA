import { Link } from "@tanstack/react-router"
import { BookOpen, ChevronRight, ExternalLink, Layout, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { IconRenderer } from "#/components/icon-renderer"
import { getToolKind, type ToolKind } from "#/lib/tool-kind"
import type { Tool } from "#/lib/types"

interface ToolCardProps {
	tool: Tool
	index: number
	onDelete?: () => void
}

const MotionLink = motion(Link)

const cardClassName = "block bg-white rounded-2xl p-8 flex flex-col h-full transition-all duration-300 border border-slate-100 shadow-sm"

const KIND_TAG: Record<ToolKind, { label: string; cta: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
	internal: {
		label: "Ferramenta do próprio hub",
		cta: "Acessar Ferramenta",
		icon: Layout,
		className: "bg-tech-cyan/10 text-tech-blue border-tech-cyan/25",
	},
	notebooklm: {
		label: "Caderno externo no NotebookLM",
		cta: "Abrir no NotebookLM",
		icon: BookOpen,
		className: "bg-amber-50 text-amber-600 border-amber-200",
	},
	external: {
		label: "Site externo",
		cta: "Abrir site externo",
		icon: ExternalLink,
		className: "bg-slate-50 text-slate-400 border-slate-200",
	},
}

function KindTag({ kind }: { kind: ToolKind }) {
	const tag = KIND_TAG[kind]
	const Icon = tag.icon
	return (
		<span className={`flex items-center justify-center w-7 h-7 rounded-full border ${tag.className}`} title={tag.label}>
			<Icon className="w-3.5 h-3.5" />
			<span className="sr-only">{tag.label}</span>
		</span>
	)
}

function CardInner({ tool }: { tool: Tool }) {
	const kind = getToolKind(tool)
	return (
		<>
			<div className="flex justify-between items-start mb-6">
				<div className={`p-4 ${tool.iconColor || "bg-tech-cyan"} rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
					<IconRenderer iconKey={tool.icon} className="w-6 h-6" />
				</div>
				<div className="flex items-center gap-2">
					<KindTag kind={kind} />
					<span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
						{tool.category}
					</span>
				</div>
			</div>

			<h3 className="text-2xl font-bold text-slate-800 mb-3 group-hover:text-tech-cyan transition-colors">{tool.title}</h3>

			<p className="text-slate-500 text-sm leading-relaxed mb-8 flex-grow">{tool.description}</p>

			<div className="flex items-center text-tech-cyan text-sm font-bold uppercase tracking-tight">
				{KIND_TAG[kind].cta} <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
			</div>
		</>
	)
}

export function ToolCard({ tool, index, onDelete }: ToolCardProps) {
	const reduceMotion = useReducedMotion()

	// Escalonar a entrada com teto: com 18 cards um `index * 0.07` cru deixava o
	// último aparecer mais de um segundo depois do primeiro.
	const motionProps = reduceMotion
		? ({ initial: false } as const)
		: ({
				initial: { opacity: 0, y: 20 },
				animate: { opacity: 1, y: 0 },
				whileHover: {
					y: -8,
					boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
				},
				transition: { delay: Math.min(index, 8) * 0.04 },
			} as const)

	return (
		<div className="relative group">
			{tool.internalPath ? (
				<MotionLink to={tool.internalPath} {...motionProps} className={cardClassName}>
					<CardInner tool={tool} />
				</MotionLink>
			) : (
				<motion.a href={tool.url ?? "#"} target="_blank" rel="noopener noreferrer" {...motionProps} className={cardClassName}>
					<CardInner tool={tool} />
				</motion.a>
			)}

			{onDelete && (
				// Canto inferior: no topo o botão cobria a tag de origem e a categoria.
				<button
					type="button"
					onClick={onDelete}
					className="absolute bottom-6 right-6 p-2 bg-white/80 backdrop-blur-sm rounded-full text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all shadow-sm z-20"
					aria-label={`Excluir ${tool.title}`}
					title="Excluir"
				>
					<Trash2 className="w-4 h-4" />
				</button>
			)}
		</div>
	)
}
