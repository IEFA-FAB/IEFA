import { Attachment, Trash, WarningTriangle } from "iconoir-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useDeleteAttachment, useUploadAttachment } from "@/lib/alpha/chat"
import { type ChatAttachment, describeChatError } from "@/lib/alpha/chat-model"
import { formatCount } from "@/lib/alpha/format"

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/**
 * Anexos da conversa avulsa: soltar ou escolher PDF/DOCX. Cada arquivo sobe sozinho, e a recusa
 * de um (formato, tamanho, limite de 5, PDF sem texto) fica ao lado DELE — os demais seguem.
 */
export function AttachmentDropzone({ threadId, attachments, max }: { threadId: string; attachments: readonly ChatAttachment[]; max: number }) {
	const upload = useUploadAttachment()
	const remove = useDeleteAttachment()
	const inputRef = useRef<HTMLInputElement | null>(null)
	const [dragging, setDragging] = useState(false)
	const [uploading, setUploading] = useState<string[]>([])
	const [rejected, setRejected] = useState<Array<{ name: string; reason: string }>>([])

	const full = attachments.length >= max

	const send = async (files: FileList | File[]) => {
		setRejected([])
		for (const file of Array.from(files)) {
			setUploading((current) => [...current, file.name])
			try {
				await upload.mutateAsync({ threadId, file })
			} catch (error) {
				setRejected((current) => [...current, { name: file.name, reason: describeChatError(error) }])
			} finally {
				setUploading((current) => current.filter((name) => name !== file.name))
			}
		}
	}

	return (
		<div className="border-border border-b px-4 py-3">
			{attachments.length > 0 ? (
				<ul className="mb-2 space-y-1">
					{attachments.map((attachment) => (
						<li key={attachment.id} className="flex items-center gap-2 text-xs">
							<span className="font-mono text-[10px]">{attachment.label}</span>
							<span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
							<span className="shrink-0 text-muted-foreground">{formatCount(attachment.text_chars)} caracteres</span>
							<Button
								size="icon-xs"
								variant="ghost"
								aria-label={`Remover ${attachment.filename}`}
								disabled={remove.isPending}
								onClick={() => remove.mutate({ threadId, attachmentId: attachment.id })}
							>
								<Trash />
							</Button>
						</li>
					))}
				</ul>
			) : null}

			{full ? (
				<p className="text-muted-foreground text-xs">Limite de {max} arquivos por conversa. Remova um para anexar outro, ou abra uma conversa nova.</p>
			) : (
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					onDragOver={(event) => {
						event.preventDefault()
						setDragging(true)
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(event) => {
						event.preventDefault()
						setDragging(false)
						if (event.dataTransfer.files.length > 0) void send(event.dataTransfer.files)
					}}
					className={`flex w-full items-center justify-center gap-2 border border-dashed px-3 py-3 text-muted-foreground text-xs ${dragging ? "border-foreground bg-muted" : "border-border"}`}
				>
					<Attachment className="size-4" />
					{uploading.length > 0
						? `lendo ${uploading.join(", ")}…`
						: `Solte aqui o ETP, TR ou edital (PDF ou DOCX, até ${max - attachments.length} arquivo(s)) ou clique para escolher`}
				</button>
			)}
			<input
				ref={inputRef}
				type="file"
				accept={ACCEPT}
				multiple
				className="hidden"
				onChange={(event) => {
					if (event.target.files) void send(event.target.files)
					event.target.value = ""
				}}
			/>

			{rejected.map((item) => (
				<p key={item.name} className="mt-2 flex items-start gap-2 text-xs" role="alert">
					<WarningTriangle className="mt-0.5 size-3.5 shrink-0" />
					<span>
						<span className="font-medium">{item.name}</span>: {item.reason}
					</span>
				</p>
			))}
		</div>
	)
}
