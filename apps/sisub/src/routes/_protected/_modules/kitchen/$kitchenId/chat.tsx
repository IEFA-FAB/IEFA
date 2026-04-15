import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useCallback, useMemo } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { ModuleChatInterface } from "@/components/features/module-chat/ModuleChatInterface"
import { MobileModuleChatList, ModuleChatSidebar } from "@/components/features/module-chat/ModuleChatSidebar"
import { Button } from "@/components/ui/button"
import { getKitchenChatConfig } from "@/lib/module-chat/prompts/kitchen"

const chatSearchSchema = z.object({
	session: z.uuid().optional(),
})

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/chat")({
	beforeLoad: ({ context, params }) => requirePermission(context, "kitchen", 1, { type: "kitchen", id: Number(params.kitchenId) }),
	validateSearch: chatSearchSchema,
	head: () => ({
		meta: [{ title: "Assistente IA · Cozinha" }],
	}),
	component: KitchenChatPage,
})

function KitchenChatPage() {
	const { kitchenId: kitchenIdStr } = Route.useParams()
	const kitchenId = Number(kitchenIdStr)
	const { session: sessionId } = Route.useSearch()
	const navigate = useNavigate()

	const config = useMemo(() => getKitchenChatConfig(kitchenId), [kitchenId])

	const handleSelectSession = useCallback(
		(id: string) => {
			void navigate({ to: "/kitchen/$kitchenId/chat", params: { kitchenId: kitchenIdStr }, search: { session: id } })
		},
		[navigate, kitchenIdStr]
	)

	const handleNewChat = useCallback(() => {
		void navigate({ to: "/kitchen/$kitchenId/chat", params: { kitchenId: kitchenIdStr }, search: {} })
	}, [navigate, kitchenIdStr])

	const handleSessionCreated = useCallback(
		(id: string) => {
			void navigate({ to: "/kitchen/$kitchenId/chat", params: { kitchenId: kitchenIdStr }, search: { session: id }, replace: true })
		},
		[navigate, kitchenIdStr]
	)

	const handleBack = useCallback(() => {
		void navigate({ to: "/kitchen/$kitchenId/chat", params: { kitchenId: kitchenIdStr }, search: {} })
	}, [navigate, kitchenIdStr])

	return (
		<div className="-mx-3 sm:-mx-6 -my-6 md:-my-8 flex h-[calc(100dvh-3.5rem)]">
			{/* Desktop: sidebar + chat */}
			<div className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col border-r border-border/60">
				<ModuleChatSidebar config={config} activeSessionId={sessionId} onSelectSession={handleSelectSession} onNewChat={handleNewChat} />
			</div>

			<div className="hidden md:flex flex-1 flex-col min-w-0">
				<ModuleChatInterface config={config} sessionId={sessionId} onSessionCreated={handleSessionCreated} />
			</div>

			{/* Mobile: WhatsApp-style */}
			<div className="flex flex-1 flex-col min-w-0 md:hidden">
				{sessionId ? (
					<>
						<div className="flex items-center gap-2 shrink-0 border-b border-border/60 px-2 py-2">
							<Button variant="ghost" size="icon-sm" onClick={handleBack} aria-label="Voltar">
								<ArrowLeft className="h-4 w-4" />
							</Button>
							<span className="text-sm font-medium text-foreground truncate">{config.persona.name}</span>
						</div>
						<ModuleChatInterface config={config} sessionId={sessionId} onSessionCreated={handleSessionCreated} />
					</>
				) : (
					<MobileModuleChatList config={config} onSelectSession={handleSelectSession} onNewChat={handleNewChat} />
				)}
			</div>
		</div>
	)
}
