import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FloppyDisk, Page, Plus, Trash } from "iconoir-react"
import { Button } from "@/components/ui/button"
import { dePayload, paraPayload } from "@/lib/comaer/schema"
import type { DocumentoInput } from "@/lib/comaer/tipos"
import { deleteDocumentFn, listDocumentsFn, loadDocumentFn, saveDocumentFn } from "@/server/documents.fn"

/**
 * Meus documentos — schema `documents`, um dono só.
 *
 * O `localStorage` continua guardando o documento EM EDIÇÃO (é o que sobrevive a um F5 no
 * meio da redação); o banco guarda o que o usuário decidiu salvar. Os dois papéis são
 * diferentes e por isso convivem.
 */
export function PainelDocumentos({
	input,
	documentoId,
	onAbrir,
	onNovo,
	onSalvo,
}: {
	input: DocumentoInput
	documentoId: string | null
	onAbrir: (input: DocumentoInput, id: string) => void
	onNovo: () => void
	onSalvo: (id: string) => void
}) {
	const queryClient = useQueryClient()
	const lista = useQuery({ queryKey: ["documents", "lista"], queryFn: () => listDocumentsFn() })

	const invalidar = () => queryClient.invalidateQueries({ queryKey: ["documents", "lista"] })

	const salvar = useMutation({
		mutationFn: () => saveDocumentFn({ data: { id: documentoId ?? undefined, payload: paraPayload(input) } }),
		onSuccess: ({ id }) => {
			onSalvo(id)
			invalidar()
		},
	})

	const abrir = useMutation({
		mutationFn: (id: string) => loadDocumentFn({ data: { id } }),
		onSuccess: (documento) => onAbrir(dePayload(documento.payload), documento.id),
	})

	const excluir = useMutation({
		mutationFn: (id: string) => deleteDocumentFn({ data: { id } }),
		onSuccess: ({ id }) => {
			if (id === documentoId) onNovo()
			invalidar()
		},
	})

	const erro = salvar.error ?? abrir.error ?? excluir.error

	return (
		<section className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold tracking-tight uppercase">Meus documentos</h3>
				<span className="text-[11px] font-mono text-muted-foreground">{documentoId ? "salvo no banco" : "não salvo"}</span>
			</div>

			<div className="flex gap-2">
				<Button type="button" size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
					<FloppyDisk className="size-4" />
					{salvar.isPending ? "Salvando…" : documentoId ? "Salvar alterações" : "Salvar documento"}
				</Button>
				<Button type="button" variant="outline" size="sm" onClick={onNovo}>
					<Plus className="size-4" /> Novo
				</Button>
			</div>

			{erro && <p className="text-xs text-destructive">{erro instanceof Error ? erro.message : "Falha ao acessar os documentos salvos."}</p>}

			{lista.isLoading ? (
				<p className="text-xs text-muted-foreground">Carregando…</p>
			) : (lista.data?.length ?? 0) === 0 ? (
				<p className="text-xs text-muted-foreground">Nenhum documento salvo ainda.</p>
			) : (
				<ul className="flex flex-col border border-border divide-y divide-border max-h-72 overflow-y-auto">
					{lista.data?.map((documento) => (
						<li key={documento.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${documento.id === documentoId ? "bg-accent" : ""}`}>
							<button type="button" className="flex items-start gap-2 min-w-0 text-left" onClick={() => abrir.mutate(documento.id)}>
								<Page className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
								<span className="min-w-0">
									<span className="block text-sm font-medium truncate">{documento.titulo ?? "Sem assunto"}</span>
									<span className="block text-xs text-muted-foreground truncate">
										{documento.especie} · {new Date(documento.updated_at).toLocaleDateString("pt-BR")}
										{documento.sigilo !== "ostensivo" ? ` · ${documento.sigilo}` : ""}
									</span>
								</span>
							</button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label={`Excluir ${documento.titulo ?? "documento"}`}
								onClick={() => excluir.mutate(documento.id)}
							>
								<Trash className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
