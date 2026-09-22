import { Bookmark, BookmarkSolid } from "iconoir-react"
import { Button } from "@/components/ui/button"
import { useUpdateChat } from "@/lib/alpha/chat"
import { type ChatThread, purgeNotice } from "@/lib/alpha/chat-model"

/**
 * Salvar a conversa avulsa — sem isso, ela é apagada após 180 dias sem uso. A data aparece
 * desde o primeiro dia, e ganha destaque a 30 dias do prazo.
 */
export function SaveToggle({ thread }: { thread: ChatThread }) {
	const update = useUpdateChat()
	if (thread.kind !== "avulso") return null

	const saved = thread.saved_at !== null
	const notice = purgeNotice(thread)

	return (
		<div className="flex flex-wrap items-center gap-2">
			{notice ? (
				<span className={`text-xs ${notice.urgent ? "bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive" : "text-muted-foreground"}`}>
					{notice.text}
				</span>
			) : null}
			<Button
				size="xs"
				variant={saved ? "secondary" : "outline"}
				disabled={update.isPending}
				onClick={() => update.mutate({ threadId: thread.id, saved: !saved })}
				aria-pressed={saved}
				title={saved ? "Conversa salva: fica até você apagar" : "Salvar: a conversa não será apagada automaticamente"}
			>
				{saved ? <BookmarkSolid /> : <Bookmark />}
				{saved ? "salva" : "salvar"}
			</Button>
		</div>
	)
}
