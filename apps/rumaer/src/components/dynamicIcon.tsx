import * as IconoirIcons from "iconoir-react"
import type React from "react"
import { useMemo } from "react"

type IconProps = React.SVGProps<SVGSVGElement> & { title?: string }
type IconComponent = React.ComponentType<IconProps>

const ICON_EXPORTS = IconoirIcons as Record<string, unknown>
const DEFAULT_ICON = IconoirIcons.Settings as IconComponent

const ICON_ALIASES: Record<string, string> = {
	activity: "Activity",
	airplane: "Airplane",
	archive: "Archive",
	archery: "Archery",
	"arrow-down": "ArrowDown",
	arrowdown: "ArrowDown",
	"arrow-left": "ArrowLeft",
	arrowleft: "ArrowLeft",
	"arrow-right": "ArrowRight",
	arrowright: "ArrowRight",
	"arrow-up": "ArrowUp",
	arrowup: "ArrowUp",
	"arrow-separate-vertical": "ArrowSeparateVertical",
	"arrow-up-down": "ArrowSeparateVertical",
	bell: "Bell",
	book: "Book",
	"book-stack": "BookStack",
	"book-open": "OpenBook",
	bookopen: "OpenBook",
	"open-book": "OpenBook",
	building: "Building",
	"building-2": "Building",
	calendar: "Calendar",
	camera: "Camera",
	check: "Check",
	"check-circle": "CheckCircle",
	checkcircle: "CheckCircle",
	circle: "Circle",
	clock: "Clock",
	"clipboard-check": "ClipboardCheck",
	"file-check": "ClipboardCheck",
	cloud: "Cloud",
	"cloud-upload": "CloudUpload",
	code: "Code",
	copy: "Copy",
	cpu: "Cpu",
	bot: "Cpu",
	dashboard: "Dashboard",
	"layout-dashboard": "Dashboard",
	database: "Database",
	download: "Download",
	"drag-hand-gesture": "DragHandGesture",
	"grip-vertical": "DragHandGesture",
	"edit-pencil": "EditPencil",
	edit: "EditPencil",
	pencil: "EditPencil",
	expand: "Expand",
	"chevrons-up-down": "Expand",
	eye: "Eye",
	"eye-closed": "EyeClosed",
	"eye-off": "EyeClosed",
	"file-not-found": "FileNotFound",
	"file-text": "Page",
	filetext: "Page",
	page: "Page",
	filter: "Filter",
	flag: "Flag",
	flask: "Flask",
	"flask-conical": "Flask",
	"floppy-disk": "FloppyDisk",
	save: "FloppyDisk",
	folder: "Folder",
	"git-branch": "GitBranch",
	gitbranch: "GitBranch",
	"git-fork": "GitFork",
	globe: "Globe",
	"graduation-cap": "GraduationCap",
	group: "Group",
	users: "Group",
	people: "Group",
	hashtag: "Hashtag",
	tag: "Hashtag",
	heart: "Heart",
	home: "Home",
	"info-circle": "InfoCircle",
	info: "InfoCircle",
	link: "Link",
	list: "List",
	lock: "Lock",
	"log-out": "LogOut",
	logout: "LogOut",
	mail: "Mail",
	"map-pin": "MapPin",
	mappin: "MapPin",
	medal: "Medal",
	award: "Medal",
	menu: "Menu",
	hamburger: "Menu",
	"message-text": "MessageText",
	"message-square": "ChatBubble",
	"chat-bubble": "ChatBubble",
	microscope: "Microscope",
	"more-horiz": "MoreHoriz",
	"more-horizontal": "MoreHoriz",
	"more-vert": "MoreVert",
	"more-vertical": "MoreVert",
	"nav-arrow-down": "NavArrowDown",
	"chevron-down": "NavArrowDown",
	"nav-arrow-left": "NavArrowLeft",
	"chevron-left": "NavArrowLeft",
	"nav-arrow-right": "NavArrowRight",
	"chevron-right": "NavArrowRight",
	"nav-arrow-up": "NavArrowUp",
	"chevron-up": "NavArrowUp",
	"open-new-window": "OpenNewWindow",
	"external-link": "OpenNewWindow",
	palette: "Palette",
	pin: "Pin",
	plus: "Plus",
	"plus-circle": "Plus",
	refresh: "Refresh",
	"refresh-cw": "Refresh",
	"refresh-double": "RefreshDouble",
	"refresh-ccw": "Refresh",
	search: "Search",
	"send-diagonal": "SendDiagonal",
	send: "Send",
	server: "Server",
	settings: "Settings",
	wrench: "Settings",
	gear: "Settings",
	"share-android": "ShareAndroid",
	share: "ShareAndroid",
	shield: "Shield",
	"sidebar-expand": "SidebarExpand",
	sparks: "Sparks",
	sparkles: "Sparks",
	"sun-light": "SunLight",
	sun: "SunLight",
	"half-moon": "HalfMoon",
	moon: "HalfMoon",
	"table-2-columns": "Table2Columns",
	table: "Table2Columns",
	target: "Archery",
	trash: "Trash",
	"trash-2": "Trash",
	trash2: "Trash",
	upload: "Upload",
	user: "User",
	"view-grid": "ViewGrid",
	"layout-grid": "ViewGrid",
	"warning-circle": "WarningCircle",
	"alert-circle": "WarningCircle",
	"warning-triangle": "WarningTriangle",
	"alert-triangle": "WarningTriangle",
	xmark: "Xmark",
	x: "Xmark",
	close: "Xmark",
	"xmark-circle": "XmarkCircle",
	"x-circle": "XmarkCircle",
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
