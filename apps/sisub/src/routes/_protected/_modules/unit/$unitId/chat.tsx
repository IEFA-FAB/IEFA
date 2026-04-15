import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useCallback, useMemo } from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import { ModuleChatInterface } from "@/components/features/module-chat/ModuleChatInterface"
import { MobileModuleChatList, ModuleChatSidebar } from "@/components/features/module-chat/ModuleChatSidebar"
import { Button } from "@/components/ui/button"
import { getUnitChatConfig } from "@/lib/module-chat/prompts/unit"

const chatSearchSchema = z.object({
	session: z.uuid().optional(),
})

export const Route = createFileRoute("/_protected/_modules/unit/$unitId/chat")({
	beforeLoad: ({ context, params }) => requirePermission(context, "unit", 1, { type: "unit", id: Number(params.unitId) }),
	validateSearch: chatSearchSchema,
	head: () => ({
		meta: [{ title: "Assistente IA · Unidade" }],
	}),
	component: UnitChatPage,
})

function UnitChatPage() {
	const { unitId: unitIdStr } = Route.useParams()
	const unitId = Number(unitIdStr)
	const { session: sessionId } = Route.useSearch()
	const navigate = useNavigate()

	const config = useMemo(() => getUnitChatConfig(unitId), [unitId])

	const handleSelectSession = useCallback(
		(id: string) => {
			void navigate({ to: "/unit/$unitId/chat", params: { unitId: unitIdStr }, search: { session: id } })
		},
		[navigate, unitIdStr]
	)

	const handleNewChat = useCallback(() => {
		void navigate({ to: "/unit/$unitId/chat", params: { unitId: unitIdStr }, search: {} })
	}, [navigate, unitIdStr])

	const handleSessionCreated = useCallback(
		(id: string) => {
			void navigate({ to: "/unit/$unitId/chat", params: { unitId: unitIdStr }, search: { session: id }, replace: true })
		},
		[navigate, unitIdStr]
	)

	const handleBack = useCallback(() => {
		void navigate({ to: "/unit/$unitId/chat", params: { unitId: unitIdStr }, search: {} })
	}, [navigate, unitIdStr])

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
