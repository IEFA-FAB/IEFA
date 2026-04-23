import {
	Activity,
	Banknote,
	BarChart3,
	Bell,
	BookOpen,
	Brain,
	Calculator,
	Calendar,
	ChevronRight,
	ClipboardList,
	Cloud,
	Cpu,
	Database,
	Edit2,
	FileBarChart,
	FileText,
	Globe,
	Layout,
	LayoutGrid,
	Mail,
	MessageSquare,
	Monitor,
	Plane,
	Plus,
	Save,
	Scale,
	Search,
	ShieldCheck,
	Sparkles,
	StickyNote,
	Terminal,
	Ticket,
	Trash2,
	Users,
	X,
	Zap,
} from "lucide-react"

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	ShieldCheck,
	Activity,
	MessageSquare,
	FileText,
	BookOpen,
	Cpu,
	Terminal,
	Search,
	LayoutGrid,
	Ticket,
	Globe,
	Mail,
	Database,
	Banknote,
	Brain,
	Sparkles,
	Zap,
	Cloud,
	Monitor,
	Calendar,
	ClipboardList,
	Users,
	StickyNote,
	Bell,
	Edit2,
	Plus,
	Trash2,
	X,
	BarChart3,
	FileBarChart,
	Plane,
	Calculator,
	Layout,
	ChevronRight,
	Save,
	Scale,
}

// Custom SVG icons for AI tools
function GeminiIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
			<path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
		</svg>
	)
}

function ChatGPTIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
			<path d="M22.28 7.53c-.52-3.67-3.28-6.44-6.96-6.96C13.42.28 10.58.28 8.68.57 5 1.09 2.24 3.85 1.72 7.53c-.29 1.9-.29 4.74 0 6.64.52 3.67 3.28 6.44 6.96 6.96 1.9.29 4.74.29 6.64 0 3.67-.52 6.44-3.28 6.96-6.96.29-1.9.29-4.74 0-6.64zm-10.28 10.47c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
		</svg>
	)
}

function ClaudeIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
			<path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
		</svg>
	)
}

export function IconRenderer({ iconKey, className }: { iconKey: string; className?: string }) {
	if (iconKey === "Gemini") return <GeminiIcon className={className} />
	if (iconKey === "ChatGPT") return <ChatGPTIcon className={className} />
	if (iconKey === "Claude") return <ClaudeIcon className={className} />

	const Icon = ICON_MAP[iconKey]
	if (Icon) return <Icon className={className} />

	return <Layout className={className} />
}
