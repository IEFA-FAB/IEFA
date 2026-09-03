import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { DotsGrid3x3, List, Page, Plus, Search, Trash, Upload } from "iconoir-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { WriterProfilePanel } from "@/components/comaer/WriterProfilePanel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { findKind } from "@/lib/comaer/catalog"
import { clearDraft, loadDraft } from "@/lib/comaer/draft"
import { filterDocuments, kindsPresent } from "@/lib/comaer/library"
import { type DocumentSummary, deleteDocumentFn, listDocumentsFn, restoreDocumentFn } from "@/server/documents.fn"

type Layout = "grid" | "list"
const LAYOUT_KEY = "iefa.comaer.library-layout"

/**
 * Meus documentos.
 *
 * A escolha vem ANTES da edição: abrir a ferramenta direto no editor obrigava a decidir
 * "documento novo ou algum dos meus?" dentro de uma tela que já estava editando um.
 *
 * O rascunho do navegador aparece junto, e primeiro: ele é o documento em que a pessoa
 * estava trabalhando, ainda sem endereço próprio.
 */
export function DocumentLibrary() {
	const queryClient = useQueryClient()
	const [layout, setLayout] = useState<Layout>("grid")
	const [draftSubject, setDraftSubject] = useState<string | null>(null)
	const [search, setSearch] = useState("")
	const [kindFilter, setKindFilter] = useState<string | null>(null)
	const [confirming, setConfirming] = useState<string | null>(null)
	const heading = useRef<HTMLHeadingElement>(null)

	const refreshDraft = useCallback(() => {
		const draft = loadDraft()
		setDraftSubject(draft ? draft.subject?.trim() || "Documento sem assunto" : null)
	}, [])

	// `localStorage` só existe no cliente; ler durante o SSR quebraria a hidratação.
	useEffect(() => {
		const stored = localStorage.getItem(LAYOUT_KEY)
		if (stored === "grid" || stored === "list") setLayout(stored)
		refreshDraft()
	}, [refreshDraft])

	const chooseLayout = (next: Layout) => {
		setLayout(next)
		localStorage.setItem(LAYOUT_KEY, next)
	}

	const documents = useQuery({ queryKey: ["documents", "lista"], queryFn: () => listDocumentsFn() })

	const [lastRemoved, setLastRemoved] = useState<{ id: string; title: string | null } | null>(null)

	const restore = useMutation({
		mutationFn: (id: string) => restoreDocumentFn({ data: { id } }),
		onSuccess: () => {
			setLastRemoved(null)
			queryClient.invalidateQueries({ queryKey: ["documents", "lista"] })
		},
	})

	const remove = useMutation({
		mutationFn: (id: string) => deleteDocumentFn({ data: { id } }),
		onSuccess: (_result, id) => {
			setLastRemoved({ id, title: all.find((d) => d.id === id)?.title ?? null })
			setConfirming(null)
			queryClient.invalidateQueries({ queryKey: ["documents", "lista"] })
			// O card sumiu debaixo do foco; devolvê-lo ao cabeçalho evita que o próximo Tab
			// caia no "Excluir" da linha vizinha.
			heading.current?.focus()
		},
	})

	const all = documents.data ?? []
	const kinds = kindsPresent(all)
	const items = filterDocuments(all, { search, kind: kindFilter })
	const filtering = search.trim() !== "" || kindFilter !== null

	return (
		<div className="w-full py-10 flex flex-col gap-8">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 ref={heading} tabIndex={-1} className="text-3xl md:text-4xl font-bold tracking-tight text-balance outline-none">
						Meus documentos
					</h1>
					<p className="text-muted-foreground mt-2 text-pretty max-w-2xl">
						Comunicações oficiais redigidas conforme a{" "}
						<a href="/docs/NSCA 5-3.pdf" className="underline underline-offset-4" target="_blank" rel="noreferrer">
							NSCA 5-3/2026
						</a>
						. Escolha um para continuar, comece outro, ou parta de uma minuta antiga.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais/novo" search={{ minuta: true }} />}>
						<Upload className="size-4" /> Partir de uma minuta
					</Button>
					<Button size="sm" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais/novo" />}>
						<Plus className="size-4" /> Novo documento
					</Button>
				</div>
			</header>

			{/* Dados fixos ficam aqui: é a decisão "quem sou eu nos documentos", e ela não
			    compete com a redação. Sem esta tela o perfil era inalcançável e a redação
			    assistida perguntava OM e signatário em cada documento novo. */}
			<WriterProfilePanel />

			<div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
				<div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
					<div className="relative flex-1 min-w-[14rem] max-w-sm">
						<Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Buscar por assunto ou espécie"
							aria-label="Buscar documentos"
							className="pl-8"
						/>
					</div>

					{kinds.length > 1 && (
						<Select value={kindFilter ?? "todas"} onValueChange={(value) => setKindFilter(value === "todas" ? null : (value as string))}>
							<SelectTrigger aria-label="Filtrar por espécie" className="w-64">
								<SelectValue>{kindFilter ? (kinds.find((k) => k.id === kindFilter)?.label ?? kindFilter) : "Todas as espécies"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="todas">Todas as espécies</SelectItem>
								{kinds.map((kind) => (
									<SelectItem key={kind.id} value={kind.id}>
										{kind.label} ({kind.count})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					<span className="text-sm text-muted-foreground" role="status">
						{documents.isLoading
							? "Carregando…"
							: filtering
								? `${items.length} de ${all.length}`
								: `${all.length} ${all.length === 1 ? "documento" : "documentos"}`}
					</span>
				</div>
				<fieldset className="flex border border-border">
					<legend className="sr-only">Forma de exibição</legend>
					{(
						[
							{ value: "grid", label: "Ícones", Icon: DotsGrid3x3 },
							{ value: "list", label: "Lista", Icon: List },
						] as const
					).map(({ value, label, Icon }) => (
						<button
							key={value}
							type="button"
							aria-pressed={layout === value}
							aria-label={label}
							onClick={() => chooseLayout(value)}
							className={`px-3 h-9 transition-colors ${layout === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
						>
							<Icon className="size-4" />
						</button>
					))}
				</fieldset>
			</div>

			{documents.error && (
				<p role="alert" className="text-sm text-destructive">
					Não deu para carregar seus documentos. Recarregue a página; se persistir, o serviço pode estar fora do ar.
				</p>
			)}
			{lastRemoved && (
				<div className="border border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3" role="status">
					<span className="text-sm">“{lastRemoved.title ?? "Documento sem assunto"}” foi excluído. A conversa dele não pode ser recuperada.</span>
					<div className="flex gap-2">
						<Button type="button" variant="outline" size="sm" onClick={() => restore.mutate(lastRemoved.id)} disabled={restore.isPending}>
							{restore.isPending ? "Restaurando…" : "Desfazer"}
						</Button>
						<Button type="button" variant="ghost" size="sm" onClick={() => setLastRemoved(null)}>
							Dispensar
						</Button>
					</div>
				</div>
			)}

			{remove.error && (
				<p role="alert" className="text-sm text-destructive">
					Não deu para excluir o documento. Tente de novo.
				</p>
			)}

			{draftSubject && (
				<section className="flex flex-col gap-2">
					<h2 className="text-label text-muted-foreground">Em edição, ainda sem salvar</h2>
					<div className="border border-border flex flex-wrap items-center justify-between gap-3 p-4">
						<Link to="/facilities/comunicacoes-oficiais/novo" className="flex items-center gap-3 min-w-0 flex-1 hover:underline underline-offset-4">
							<Page className="size-4 shrink-0 text-muted-foreground" />
							<span className="truncate font-medium">{draftSubject}</span>
						</Link>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">rascunho deste navegador</span>
							{/* "Novo documento" reabria este rascunho sem dizer nada, e digitar por cima
							    o destruía. Descartar passou a ser ato explícito. */}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									if (!window.confirm("Descartar o rascunho em edição? Ele não pode ser recuperado.")) return
									clearDraft()
									refreshDraft()
								}}
							>
								Descartar
							</Button>
						</div>
					</div>
				</section>
			)}

			{!documents.isLoading && items.length === 0 && filtering ? (
				<div className="border border-border p-10 text-center flex flex-col items-center gap-3">
					<Search className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground max-w-md">
						Nenhum documento com esse filtro. A busca ignora acento e maiúscula, e procura também na espécie.
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setSearch("")
							setKindFilter(null)
						}}
					>
						Limpar filtros
					</Button>
				</div>
			) : !documents.isLoading && items.length === 0 ? (
				<div className="border border-border p-10 text-center flex flex-col items-center gap-3">
					<Page className="size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground max-w-md">
						Nenhum documento salvo ainda. Comece um novo — ou parta de uma minuta, colando o texto de um ofício antigo ou enviando o PDF.
					</p>
					<Button size="sm" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais/novo" />}>
						<Plus className="size-4" /> Novo documento
					</Button>
				</div>
			) : layout === "grid" ? (
				<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{items.map((document) => (
						<li key={document.id} className="border border-border flex flex-col shadow-hard-sm">
							<Link
								to="/facilities/comunicacoes-oficiais/$documentId"
								params={{ documentId: document.id }}
								className="flex-1 p-4 flex flex-col gap-3 hover:bg-accent transition-colors"
							>
								<Page className="size-4 text-muted-foreground" />
								<span className="font-medium leading-snug line-clamp-3">{document.title ?? "Documento sem assunto"}</span>
								<DocumentMeta document={document} />
							</Link>
							<RemoveRow
								document={document}
								confirming={confirming === document.id}
								pending={remove.isPending && remove.variables === document.id}
								onAsk={() => setConfirming(document.id)}
								onCancel={() => setConfirming(null)}
								onConfirm={() => remove.mutate(document.id)}
							/>
						</li>
					))}
				</ul>
			) : (
				<ul className="border border-border divide-y divide-border">
					{items.map((document) => (
						<li key={document.id} className="flex flex-wrap items-center justify-between gap-2">
							<Link
								to="/facilities/comunicacoes-oficiais/$documentId"
								params={{ documentId: document.id }}
								className="flex-1 px-4 py-3 flex items-center gap-3 min-w-0 hover:bg-accent transition-colors"
							>
								<Page className="size-4 shrink-0 text-muted-foreground" />
								<span className="truncate font-medium">{document.title ?? "Documento sem assunto"}</span>
								<span className="ml-auto shrink-0">
									<DocumentMeta document={document} />
								</span>
							</Link>
							<div className="pr-2">
								<RemoveRow
									document={document}
									confirming={confirming === document.id}
									pending={remove.isPending && remove.variables === document.id}
									onAsk={() => setConfirming(document.id)}
									onCancel={() => setConfirming(null)}
									onConfirm={() => remove.mutate(document.id)}
								/>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

function DocumentMeta({ document }: { document: DocumentSummary }) {
	const kind = findKind(document.kind)
	return (
		<span className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
			<span>{kind?.label ?? document.kind}</span>
			<span aria-hidden>·</span>
			<span>{new Date(document.updated_at).toLocaleDateString("pt-BR")}</span>
			{document.classification !== "ostensivo" && (
				<>
					<span aria-hidden>·</span>
					<span className="uppercase tracking-wider text-destructive">{document.classification}</span>
				</>
			)}
		</span>
	)
}

/**
 * Excluir com confirmação no próprio card.
 *
 * Era um clique só, sem volta, num ícone colado na área que abre o documento. O documento
 * é excluído logicamente, mas para quem usa não havia diferença: sem confirmação e sem
 * lixeira, a perda é definitiva.
 */
function RemoveRow({
	document,
	confirming,
	pending,
	onAsk,
	onCancel,
	onConfirm,
}: {
	document: DocumentSummary
	confirming: boolean
	pending: boolean
	onAsk: () => void
	onCancel: () => void
	onConfirm: () => void
}) {
	if (confirming) {
		return (
			<div className="border-t border-border px-3 py-2 flex items-center justify-between gap-2 text-xs">
				<span>Excluir? A conversa dele é apagada junto.</span>
				<div className="flex gap-1">
					<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
						Cancelar
					</Button>
					<Button type="button" size="sm" onClick={onConfirm} disabled={pending}>
						{pending ? "Excluindo…" : "Excluir"}
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="border-t border-border px-2 py-1 flex justify-end">
			<Button type="button" variant="ghost" size="sm" aria-label={`Excluir ${document.title ?? "documento"}`} onClick={onAsk}>
				<Trash className="size-4" />
			</Button>
		</div>
	)
}
