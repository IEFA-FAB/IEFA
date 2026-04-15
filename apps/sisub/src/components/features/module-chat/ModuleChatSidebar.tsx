import { MessageSquarePlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDeleteModuleChatSession, useModuleChatSessions, useRenameModuleChatSession } from "@/hooks/data/useModuleChatHistory"
import { cn } from "@/lib/cn"
import type { ModuleChatConfig, ModuleChatSession } from "@/types/domain/module-chat"

// ── Date grouping ───────────────────────────────────────────────────────────

function groupByDate(sessions: ModuleChatSession[]) {
	const now = new Date()
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const yesterday = new Date(today.getTime() - 86_400_000)
	const sevenDaysAgo = new Date(today.getTime() - 7 * 86_400_000)
	const thirtyDaysAgo = new Date(today.getTime() - 30 * 86_400_000)

	const groups: { label: string; items: ModuleChatSession[] }[] = [
		{ label: "Hoje", items: [] },
		{ label: "Ontem", items: [] },
		{ label: "Últimos 7 dias", items: [] },
		{ label: "Últimos 30 dias", items: [] },
		{ label: "Mais antigos", items: [] },
	]

	for (const s of sessions) {
		const d = new Date(s.updated_at)
		if (d >= today) groups[0].items.push(s)
		else if (d >= yesterday) groups[1].items.push(s)
		else if (d >= sevenDaysAgo) groups[2].items.push(s)
		else if (d >= thirtyDaysAgo) groups[3].items.push(s)
		else groups[4].items.push(s)
	}

	return groups.filter((g) => g.items.length > 0)
}

function formatTime(dateStr: string) {
	const d = new Date(dateStr)
	return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

// ── Session item ────────────────────────────────────────────────────────────

function SessionItem({
	session,
	isActive,
	onSelect,
	onDelete,
	onRename,
}: {
	session: ModuleChatSession
	isActive: boolean
	onSelect: (id: string) => void
	onDelete: (id: string) => void
	onRename: (id: string, title: string) => void
}) {
	const [isEditing, setIsEditing] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	const startRename = useCallback(() => {
		setIsEditing(true)
		setTimeout(() => inputRef.current?.focus(), 0)
	}, [])

	const commitRename = useCallback(() => {
		const value = inputRef.current?.value.trim()
		if (value && value !== session.title) {
			onRename(session.id, value)
		}
		setIsEditing(false)
	}, [session.id, session.title, onRename])

	return (
		// biome-ignore lint/a11y/useSemanticElements: contains interactive children
		<div
			className={cn(
				"group relative flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer",
				isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
			)}
			onClick={() => !isEditing && onSelect(session.id)}
			onKeyDown={(e) => e.key === "Enter" && !isEditing && onSelect(session.id)}
			role="button"
			tabIndex={0}
		>
			{isEditing ? (
				<input
					ref={inputRef}
					defaultValue={session.title}
					className="flex-1 min-w-0 bg-transparent text-sm outline-none border-b border-primary"
					onBlur={commitRename}
					onKeyDown={(e) => {
						if (e.key === "Enter") commitRename()
						if (e.key === "Escape") setIsEditing(false)
					}}
					onClick={(e) => e.stopPropagation()}
				/>
			) : (
				<span className="flex-1 truncate">{session.title}</span>
			)}

			{!isEditing && (
				<DropdownMenu>
					<DropdownMenuTrigger
						onClick={(e) => e.stopPropagation()}
						render={
							<button
								type="button"
								className={cn("shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent", "group-hover:opacity-100", isActive && "opacity-100")}
								aria-label="Opções da sessão"
							/>
						}
					>
						<MoreHorizontal className="h-3.5 w-3.5" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-36">
						<DropdownMenuItem onClick={startRename}>
							<Pencil className="mr-2 h-3.5 w-3.5" />
							Renomear
						</DropdownMenuItem>
						<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(session.id)}>
							<Trash2 className="mr-2 h-3.5 w-3.5" />
							Excluir
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	)
}

// ── Desktop sidebar ─────────────────────────────────────────────────────────

interface ModuleChatSidebarProps {
	config: ModuleChatConfig
	activeSessionId: string | undefined
	onSelectSession: (id: string) => void
	onNewChat: () => void
}

export function ModuleChatSidebar({ config, activeSessionId, onSelectSession, onNewChat }: ModuleChatSidebarProps) {
	const { data: sessions = [], isLoading } = useModuleChatSessions(config.module, config.scopeId)
	const deleteMutation = useDeleteModuleChatSession(config.module, config.scopeId)
	const renameMutation = useRenameModuleChatSession(config.module, config.scopeId)

	const groups = useMemo(() => groupByDate(sessions), [sessions])

	const handleDelete = useCallback(
		(id: string) => {
			deleteMutation.mutate(id, {
				onSuccess: () => {
					if (id === activeSessionId) onNewChat()
				},
			})
		},
		[deleteMutation, activeSessionId, onNewChat]
	)

	const handleRename = useCallback(
		(id: string, title: string) => {
			renameMutation.mutate({ sessionId: id, title })
		},
		[renameMutation]
	)

	return (
		<div className="flex h-full flex-col">
			<div className="shrink-0 p-3">
				<Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={onNewChat}>
					<MessageSquarePlus className="h-4 w-4" />
					Novo chat
				</Button>
			</div>

			<ScrollArea className="flex-1 px-2 pb-2">
				{isLoading ? (
					<div className="space-y-2 px-2">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="h-8 animate-pulse rounded-lg bg-muted/60" />
						))}
					</div>
				) : groups.length === 0 ? (
					<p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum chat ainda</p>
				) : (
					groups.map((group) => (
						<div key={group.label} className="mb-4">
							<p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">{group.label}</p>
							<div className="space-y-0.5">
								{group.items.map((session) => (
									<SessionItem
										key={session.id}
										session={session}
										isActive={session.id === activeSessionId}
										onSelect={onSelectSession}
										onDelete={handleDelete}
										onRename={handleRename}
									/>
								))}
							</div>
						</div>
					))
				)}
			</ScrollArea>
		</div>
	)
}

// ── Mobile full-screen list ─────────────────────────────────────────────────

interface MobileModuleChatListProps {
	config: ModuleChatConfig
	onSelectSession: (id: string) => void
	onNewChat: () => void
}

export function MobileModuleChatList({ config, onSelectSession, onNewChat }: MobileModuleChatListProps) {
	const { data: sessions = [], isLoading } = useModuleChatSessions(config.module, config.scopeId)
	const deleteMutation = useDeleteModuleChatSession(config.module, config.scopeId)

	const PersonaIcon = config.persona.icon

	const handleDelete = useCallback(
		(id: string) => {
			deleteMutation.mutate(id)
		},
		[deleteMutation]
	)

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="shrink-0 px-4 pt-4 pb-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<PersonaIcon className="h-4.5 w-4.5" />
						</div>
						<div>
							<h1 className="text-lg font-semibold text-foreground leading-tight">{config.persona.name}</h1>
							<p className="text-xs text-muted-foreground">{config.persona.description}</p>
						</div>
					</div>
					<Button size="icon-sm" variant="ghost" onClick={onNewChat} aria-label="Novo chat">
						<MessageSquarePlus className="h-5 w-5" />
					</Button>
				</div>
			</div>

			{/* Session list */}
			<ScrollArea className="flex-1">
				{isLoading ? (
					<div className="space-y-1 px-2">
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="mx-2 h-16 animate-pulse rounded-xl bg-muted/40" />
						))}
					</div>
				) : sessions.length === 0 ? (
					<div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
							<MessageSquarePlus className="h-6 w-6" />
						</div>
						<div>
							<p className="text-sm font-medium text-foreground">Nenhuma conversa</p>
							<p className="mt-1 text-xs text-muted-foreground leading-relaxed">Toque no botão acima para iniciar uma nova conversa.</p>
						</div>
					</div>
				) : (
					<div className="px-2 pb-4">
						{sessions.map((session) => (
							// biome-ignore lint/a11y/useSemanticElements: contains interactive children
							<div
								key={session.id}
								className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors cursor-pointer active:bg-accent/60 hover:bg-accent/40"
								onClick={() => onSelectSession(session.id)}
								onKeyDown={(e) => e.key === "Enter" && onSelectSession(session.id)}
								role="button"
								tabIndex={0}
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
									<PersonaIcon className="h-4 w-4" />
								</div>

								<div className="flex-1 min-w-0">
									<div className="flex items-baseline justify-between gap-2">
										<p className="text-sm font-medium text-foreground truncate">{session.title}</p>
										<span className="shrink-0 text-[11px] text-muted-foreground">{formatTime(session.updated_at)}</span>
									</div>
									<p className="mt-0.5 text-xs text-muted-foreground truncate">{config.persona.name}</p>
								</div>

								<DropdownMenu>
									<DropdownMenuTrigger
										onClick={(e) => e.stopPropagation()}
										render={
											<button
												type="button"
												className="shrink-0 rounded-lg p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent active:bg-accent"
												aria-label="Opções"
											/>
										}
									>
										<MoreHorizontal className="h-4 w-4 text-muted-foreground" />
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-36">
										<DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(session.id)}>
											<Trash2 className="mr-2 h-3.5 w-3.5" />
											Excluir
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	)
}
