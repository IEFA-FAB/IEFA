import { useMutation } from "@tanstack/react-query"
import { Upload, WarningTriangle } from "iconoir-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AiProposal } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"
import { importDraftFn } from "@/server/documents-import.fn"

const ACCEPT = ".pdf,.txt,.md,.html,.csv,image/png,image/jpeg,image/webp"

/**
 * Partir de uma minuta.
 *
 * O que entra é o CONTEÚDO. Numeração, NUP e data ficam em branco e o documento nasce
 * marcado como derivado: herdar o número do ofício antigo é o erro clássico de quem parte
 * de minuta, e ninguém percebe até o expediente estar despachado.
 */
export function ImportPanel({ input, onImported }: { input: DocumentInput; onImported: (proposal: AiProposal) => void }) {
	const [text, setText] = useState("")
	const [fileName, setFileName] = useState<string | null>(null)
	const fileInput = useRef<HTMLInputElement>(null)

	const classified = input.classification !== "ostensivo"

	const importDraft = useMutation({
		mutationFn: async (file?: File) => {
			const payload = file
				? { file: { mimeType: file.type as never, base64: await toBase64(file) }, classification: input.classification }
				: { text, classification: input.classification }
			return importDraftFn({ data: payload })
		},
		onSuccess: onImported,
	})

	if (classified) {
		return (
			<section className="border border-border p-4 flex items-start gap-2 text-sm">
				<WarningTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
				<p className="text-muted-foreground">
					Documento com grau de sigilo <strong>{input.classification}</strong>: nem o texto nem o arquivo são enviados a provider de IA.
				</p>
			</section>
		)
	}

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase">Partir de uma minuta</h3>
				<span className="text-[11px] font-mono text-muted-foreground">numeração, NUP e data não são herdados</span>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="import-text">Cole o texto do ofício antigo</Label>
				<Textarea
					id="import-text"
					rows={4}
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="Cole aqui o corpo do documento copiado do SIGADAER."
				/>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" size="sm" onClick={() => importDraft.mutate(undefined)} disabled={importDraft.isPending || text.trim().length < 20}>
					{importDraft.isPending && !fileName ? "Extraindo…" : "Importar do texto"}
				</Button>

				<input
					ref={fileInput}
					type="file"
					accept={ACCEPT}
					className="sr-only"
					aria-label="Arquivo da minuta"
					onChange={(e) => {
						const file = e.target.files?.[0]
						if (!file) return
						setFileName(file.name)
						importDraft.mutate(file)
					}}
				/>
				<Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importDraft.isPending}>
					<Upload className="size-4" /> {importDraft.isPending && fileName ? "Lendo o arquivo…" : "PDF ou digitalização"}
				</Button>
				{fileName && <span className="text-xs text-muted-foreground truncate max-w-[16rem]">{fileName}</span>}
			</div>

			{importDraft.error && (
				<p className="text-xs text-destructive">{importDraft.error instanceof Error ? importDraft.error.message : "Falha ao importar a minuta."}</p>
			)}
			{importDraft.isSuccess && <p className="text-xs text-muted-foreground">Minuta importada — confira numeração, NUP e data antes de despachar.</p>}
		</section>
	)
}

/** O `FileReader` devolve `data:<mime>;base64,<conteúdo>`; ao provider vai só o conteúdo. */
async function toBase64(file: File): Promise<string> {
	const buffer = await file.arrayBuffer()
	let binary = ""
	const bytes = new Uint8Array(buffer)
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
	return btoa(binary)
}
