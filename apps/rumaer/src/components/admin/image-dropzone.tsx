/**
 * Drag-and-drop de imagem (react-dropzone) para o admin de uniformes.
 * - `useImageDrop`: hook headless (1 imagem PNG/JPEG/WebP, valida tipo, toast em rejeição).
 * - `ImageDropzone`: área tracejada pronta — arraste OU clique para enviar/trocar.
 */

import { Loader2, Trash2, Upload } from "lucide-react"
import { ErrorCode, useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { ACCEPTED_IMAGE_MIMES, IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BYTES, UNSUPPORTED_IMAGE_MESSAGE } from "@/lib/uniforms/image-path"
import { cn } from "@/lib/utils"

type UseImageDropOptions = {
	onFile: (file: File) => void
	disabled?: boolean
	/** Desliga o clique no container (use quando o clique abre via botão dedicado). */
	noClick?: boolean
}

export function useImageDrop({ onFile, disabled, noClick }: UseImageDropOptions) {
	return useDropzone({
		// Só os formatos que o bucket aceita (png, jpeg, webp) — ver `@/lib/uniforms/image-path`.
		accept: Object.fromEntries(ACCEPTED_IMAGE_MIMES.map((mime) => [mime, []])),
		maxSize: MAX_IMAGE_BYTES,
		multiple: false,
		disabled,
		noClick,
		onDrop: (accepted) => {
			const file = accepted[0]
			if (file) onFile(file)
		},
		onDropRejected: (rejections) => {
			const code = rejections[0]?.errors[0]?.code
			toast.error(
				code === ErrorCode.FileInvalidType ? UNSUPPORTED_IMAGE_MESSAGE : code === ErrorCode.FileTooLarge ? IMAGE_TOO_LARGE_MESSAGE : "Arquivo rejeitado"
			)
		},
	})
}

type ImageDropzoneProps = {
	onFile: (file: File) => void
	uploading?: boolean
	hasImage?: boolean
	onRemove?: () => void
	removing?: boolean
	className?: string
}

/** Área tracejada de upload da imagem base; arraste ou clique. Sem preview (a prévia fica fora). */
export function ImageDropzone({ onFile, uploading, hasImage, onRemove, removing, className }: ImageDropzoneProps) {
	const busy = uploading || removing
	const { getRootProps, getInputProps, isDragActive, isDragReject } = useImageDrop({ onFile, disabled: busy })

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div
				{...getRootProps({
					className: cn(
						"flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-muted/30 px-4 py-5 text-center text-xs text-muted-foreground transition-colors cursor-pointer hover:border-foreground/40 hover:bg-muted/50",
						isDragActive && "border-foreground bg-muted text-foreground",
						isDragReject && "border-destructive bg-destructive/10 text-destructive",
						busy && "pointer-events-none opacity-60"
					),
				})}
			>
				<input {...getInputProps()} />
				{uploading ? (
					<span className="inline-flex items-center gap-1.5">
						<Loader2 className="size-3.5 animate-spin" />
						Enviando…
					</span>
				) : (
					<span className="inline-flex items-center gap-1.5">
						<Upload className="size-3.5" />
						{isDragActive ? "Solte para enviar" : hasImage ? "Arraste para trocar ou clique" : "Arraste uma imagem ou clique para enviar"}
					</span>
				)}
			</div>
			{hasImage && onRemove && (
				<Button variant="ghost" size="sm" className="self-start text-destructive" onClick={onRemove} disabled={busy}>
					<Trash2 className="size-4" />
					Remover imagem
				</Button>
			)}
		</div>
	)
}
