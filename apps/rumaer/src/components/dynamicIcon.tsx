import * as LucideIcons from "lucide-react"
import type React from "react"
import { useMemo } from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }
type IconComponent = React.ComponentType<IconProps>

const ICON_EXPORTS = LucideIcons as unknown as Record<string, unknown>
const DEFAULT_ICON = LucideIcons.Settings as IconComponent

/**
 * Mapeia nomes vindos do banco (kebab, lucide-style ou legado iconoir) para o
 * nome PascalCase exportado pelo lucide-react. Chaves sempre em kebab/lowercase.
 */
const ICON_ALIASES: Record<string, string> = {
	activity: "Activity",
	airplane: "Plane",
	plane: "Plane",
	archive: "Archive",
	archery: "Target",
	target: "Target",
	"arrow-down": "ArrowDown",
	"arrow-left": "ArrowLeft",
	"arrow-right": "ArrowRight",
	"arrow-up": "ArrowUp",
	"arrow-separate-vertical": "ChevronsUpDown",
	"arrow-up-down": "ChevronsUpDown",
	"chevrons-up-down": "ChevronsUpDown",
	bell: "Bell",
	book: "Book",
	"book-stack": "Library",
	library: "Library",
	"book-open": "BookOpen",
	"open-book": "BookOpen",
	building: "Building2",
	"building-2": "Building2",
	calendar: "Calendar",
	camera: "Camera",
	check: "Check",
	"check-circle": "CircleCheck",
	"circle-check": "CircleCheck",
	circle: "Circle",
	clock: "Clock",
	"clipboard-check": "ClipboardCheck",
	"file-check": "ClipboardCheck",
	cloud: "Cloud",
	"cloud-upload": "CloudUpload",
	code: "Code",
	copy: "Copy",
	cpu: "Cpu",
	bot: "Bot",
	dashboard: "LayoutDashboard",
	"layout-dashboard": "LayoutDashboard",
	database: "Database",
	download: "Download",
	"drag-hand-gesture": "GripVertical",
	"grip-vertical": "GripVertical",
	"edit-pencil": "Pencil",
	edit: "Pencil",
	pencil: "Pencil",
	expand: "Expand",
	eye: "Eye",
	"eye-closed": "EyeOff",
	"eye-off": "EyeOff",
	"file-not-found": "FileX",
	"file-text": "FileText",
	page: "FileText",
	filter: "Funnel",
	funnel: "Funnel",
	flag: "Flag",
	flask: "FlaskConical",
	"flask-conical": "FlaskConical",
	"floppy-disk": "Save",
	save: "Save",
	folder: "Folder",
	"git-branch": "GitBranch",
	"git-fork": "GitFork",
	globe: "Globe",
	"graduation-cap": "GraduationCap",
	group: "Users",
	users: "Users",
	people: "Users",
	hashtag: "Hash",
	hash: "Hash",
	tag: "Tag",
	heart: "Heart",
	home: "House",
	house: "House",
	"info-circle": "Info",
	info: "Info",
	link: "Link",
	list: "List",
	lock: "Lock",
	"log-out": "LogOut",
	logout: "LogOut",
	mail: "Mail",
	"map-pin": "MapPin",
	medal: "Medal",
	award: "Award",
	menu: "Menu",
	hamburger: "Menu",
	"message-text": "MessageSquareText",
	"message-square": "MessageSquare",
	"chat-bubble": "MessageCircle",
	microscope: "Microscope",
	"more-horiz": "Ellipsis",
	"more-horizontal": "Ellipsis",
	ellipsis: "Ellipsis",
	"more-vert": "EllipsisVertical",
	"more-vertical": "EllipsisVertical",
	"nav-arrow-down": "ChevronDown",
	"chevron-down": "ChevronDown",
	"nav-arrow-left": "ChevronLeft",
	"chevron-left": "ChevronLeft",
	"nav-arrow-right": "ChevronRight",
	"chevron-right": "ChevronRight",
	"nav-arrow-up": "ChevronUp",
	"chevron-up": "ChevronUp",
	"open-new-window": "ExternalLink",
	"external-link": "ExternalLink",
	palette: "Palette",
	pin: "Pin",
	plus: "Plus",
	"plus-circle": "CirclePlus",
	refresh: "RefreshCw",
	"refresh-cw": "RefreshCw",
	"refresh-double": "RefreshCcw",
	"refresh-ccw": "RefreshCcw",
	search: "Search",
	"send-diagonal": "SendHorizontal",
	send: "Send",
	server: "Server",
	settings: "Settings",
	wrench: "Wrench",
	gear: "Settings",
	"share-android": "Share2",
	share: "Share2",
	shield: "Shield",
	"sidebar-expand": "PanelLeft",
	"panel-left": "PanelLeft",
	sparks: "Sparkles",
	sparkles: "Sparkles",
	"sun-light": "Sun",
	sun: "Sun",
	"half-moon": "Moon",
	moon: "Moon",
	"table-2-columns": "Table",
	table: "Table",
	trash: "Trash2",
	"trash-2": "Trash2",
	upload: "Upload",
	user: "User",
	"view-grid": "LayoutGrid",
	"layout-grid": "LayoutGrid",
	"warning-circle": "CircleAlert",
	"alert-circle": "CircleAlert",
	"warning-triangle": "TriangleAlert",
	"alert-triangle": "TriangleAlert",
	xmark: "X",
	x: "X",
	close: "X",
	"xmark-circle": "CircleX",
	"x-circle": "CircleX",
}

const toKebabName = (name: string) =>
	name
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[\s_]+/g, "-")
		.toLowerCase()

const toPascalName = (name: string) =>
	name
		.trim()
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
		.join("")

const unique = <T,>(items: T[]) => Array.from(new Set(items))

function getExportedIcon(name?: string): IconComponent | null {
	if (!name) return null

	const icon = ICON_EXPORTS[name]
	return typeof icon === "function" ? (icon as IconComponent) : null
}

function resolveIcon(name?: string | null): { Icon: IconComponent; missing: boolean } {
	if (!name?.trim()) return { Icon: DEFAULT_ICON, missing: false }

	const raw = name.trim()
	const kebab = toKebabName(raw)
	const compact = kebab.replaceAll("-", "")
	const aliasCandidates = unique([raw, kebab, compact, raw.toLowerCase()])
		.map((candidate) => ICON_ALIASES[candidate])
		.filter(Boolean)
	const exportCandidates = unique([raw, toPascalName(raw), toPascalName(kebab), ...aliasCandidates])

	for (const candidate of exportCandidates) {
		const Icon = getExportedIcon(candidate)
		if (Icon) return { Icon, missing: false }
	}

	return { Icon: DEFAULT_ICON, missing: true }
}

export function DynamicIcon({ name, className = "h-5 w-5", ...rest }: { name?: string | null } & IconProps) {
	const { Icon, missing } = useMemo(() => resolveIcon(name), [name])
	return (
		<Icon
			aria-hidden="true"
			className={className}
			data-icon-missing={missing ? "true" : undefined}
			data-icon-name={name?.trim() || undefined}
			title={missing && !rest.title ? `Icon "${name}" not found` : rest.title}
			{...rest}
		/>
	)
}
