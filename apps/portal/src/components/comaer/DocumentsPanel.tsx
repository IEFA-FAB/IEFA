import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FloppyDisk, Page, Plus, Trash } from "iconoir-react"
import { Button } from "@/components/ui/button"
import { fromPayload, toPayload } from "@/lib/comaer/schema"
import type { DocumentInput } from "@/lib/comaer/types"
import { deleteDocumentFn, listDocumentsFn, loadDocumentFn, saveDocumentFn } from "@/server/documents.fn"

/**
 * Meus documentos — schema `documents`, um dono só.
 *
 * O `localStorage` continua guardando o documento EM EDIÇÃO (é o que sobrevive a um F5 no
 * meio da redação); o banco guarda o que o usuário decidiu salvar. Os dois papéis são
 * diferentes e por isso convivem.
 */
export function DocumentsPanel({
	input,
	documentId,
	onOpen,
	onNew,
	onSaved,
}: {
	input: DocumentInput
	documentId: string | null
	onOpen: (input: DocumentInput, id: string) => void
	onNew: () => void
	onSaved: (id: string) => void
}) {
	const queryClient = useQueryClient()
	const list = useQuery({ queryKey: ["documents", "lista"], queryFn: () => listDocumentsFn() })

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["documents", "lista"] })

	const save = useMutation({
		mutationFn: () => saveDocumentFn({ data: { id: documentId ?? undefined, payload: toPayload(input) } }),
		onSuccess: ({ id }) => {
			onSaved(id)
			invalidate()
		},
	})

	const open = useMutation({
		mutationFn: (id: string) => loadDocumentFn({ data: { id } }),
		onSuccess: (document) => onOpen(fromPayload(document.payload), document.id),
	})

	const remove = useMutation({
		mutationFn: (id: string) => deleteDocumentFn({ data: { id } }),
		onSuccess: ({ id }) => {
			if (id === documentId) onNew()
			invalidate()
		},
	})

	const error = save.error ?? open.error ?? remove.error

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase">Meus documentos</h3>
				<span className="text-[11px] font-mono text-muted-foreground">{documentId ? "salvo no banco" : "não salvo"}</span>
			</div>

			<div className="flex gap-2">
				<Button type="button" size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
					<FloppyDisk className="size-4" />
					{save.isPending ? "Salvando…" : documentId ? "Salvar alterações" : "Salvar documento"}
				</Button>
				<Button type="button" variant="outline" size="sm" onClick={onNew}>
					<Plus className="size-4" /> Novo
				</Button>
			</div>

			{error && <p className="text-xs text-destructive">{error instanceof Error ? error.message : "Falha ao acessar os documentos salvos."}</p>}

			{list.isLoading ? (
				<p className="text-xs text-muted-foreground">Carregando…</p>
			) : (list.data?.length ?? 0) === 0 ? (
				<p className="text-xs text-muted-foreground">Nenhum documento salvo ainda.</p>
			) : (
				<ul className="flex flex-col border border-border divide-y divide-border max-h-72 overflow-y-auto">
					{list.data?.map((document) => (
						<li key={document.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${document.id === documentId ? "bg-accent" : ""}`}>
							<button type="button" className="flex items-start gap-2 min-w-0 text-left" onClick={() => open.mutate(document.id)}>
								<Page className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
								<span className="min-w-0">
									<span className="block text-sm font-medium truncate">{document.title ?? "Sem assunto"}</span>
									<span className="block text-xs text-muted-foreground truncate">
										{document.kind} · {new Date(document.updated_at).toLocaleDateString("pt-BR")}
										{document.classification !== "ostensivo" ? ` · ${document.classification}` : ""}
									</span>
								</span>
							</button>
							<Button type="button" variant="ghost" size="sm" aria-label={`Excluir ${document.title ?? "document"}`} onClick={() => remove.mutate(document.id)}>
								<Trash className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
