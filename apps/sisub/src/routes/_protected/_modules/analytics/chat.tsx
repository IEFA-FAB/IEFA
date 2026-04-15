import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useCallback } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { ChatInterface } from "@/components/features/analytics-chat/ChatInterface"
import { ChatSidebar, MobileChatList } from "@/components/features/analytics-chat/ChatSidebar"
import { Button } from "@/components/ui/button"

const chatSearchSchema = z.object({
	session: z.uuid().optional(),
})

export const Route = createFileRoute("/_protected/_modules/analytics/chat")({
	beforeLoad: ({ context }) => requirePermission(context, "analytics", 1),
	validateSearch: chatSearchSchema,
	head: () => ({
		meta: [{ title: "Assistente IA · Analytics" }],
	}),
	component: ChatPage,
})

function ChatPage() {
	const { session: sessionId } = Route.useSearch()
	const navigate = useNavigate()

	const handleSelectSession = useCallback(
		(id: string) => {
			void navigate({ to: "/analytics/chat", search: { session: id } })
		},
		[navigate]
	)

	const handleNewChat = useCallback(() => {
		void navigate({ to: "/analytics/chat", search: {} })
	}, [navigate])

	const handleSessionCreated = useCallback(
		(id: string) => {
			void navigate({ to: "/analytics/chat", search: { session: id }, replace: true })
		},
		[navigate]
	)

	const handleBack = useCallback(() => {
		void navigate({ to: "/analytics/chat", search: {} })
	}, [navigate])

	return (
		/*
		 * Full-bleed: negative margins eat the wrapper's px-3 py-6 sm:px-6 md:py-8.
		 * Height = viewport minus AppShell header (h-14 = 3.5rem), viewport-relative
		 * so it doesn't depend on parent having an explicit height.
		 */
		<div className="-mx-3 sm:-mx-6 -my-6 md:-my-8 flex h-[calc(100dvh-3.5rem)]">
			{/* ── Desktop layout (≥ md): sidebar + chat ────────────────────── */}
			<div className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border/60">
				<ChatSidebar activeSessionId={sessionId} onSelectSession={handleSelectSession} onNewChat={handleNewChat} />
			</div>

			<div className="hidden md:flex flex-1 flex-col min-w-0">
				<ChatInterface sessionId={sessionId} onSessionCreated={handleSessionCreated} />
			</div>

			{/* ── Mobile layout (< md): WhatsApp-style view switching ─────── */}
			<div className="flex flex-1 flex-col min-w-0 md:hidden">
				{sessionId ? (
					/* Active chat — full screen with back header */
					<>
						<div className="flex items-center gap-2 shrink-0 border-b border-border/60 px-2 py-2">
							<Button variant="ghost" size="icon-sm" onClick={handleBack} aria-label="Voltar">
								<ArrowLeft className="h-4 w-4" />
							</Button>
							<span className="text-sm font-medium text-foreground truncate">Assistente IA</span>
						</div>
						<ChatInterface sessionId={sessionId} onSessionCreated={handleSessionCreated} />
					</>
				) : (
					/* Session list — full screen */
					<MobileChatList onSelectSession={handleSelectSession} onNewChat={handleNewChat} />
				)}
			</div>
		</div>
	)
}
