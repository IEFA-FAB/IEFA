import { createFileRoute } from "@tanstack/react-router"
import { ChatInterface } from "@/components/features/analytics-chat/ChatInterface"

export const Route = createFileRoute("/_protected/_modules/analytics/chat")({
	head: () => ({
		meta: [{ title: "Assistente IA · Analytics" }],
	}),
	component: ChatPage,
})

function ChatPage() {
	return (
		<div className="space-y-6 h-full">
			<ChatInterface />
		</div>
	)
}
