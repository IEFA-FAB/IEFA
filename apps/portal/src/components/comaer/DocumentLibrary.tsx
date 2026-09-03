import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { DotsGrid3x3, List, Page, Plus, Search, Trash } from "iconoir-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { findKind } from "@/lib/comaer/catalog"
import { loadDraft } from "@/lib/comaer/draft"
import { filterDocuments, kindsPresent } from "@/lib/comaer/library"
import { type DocumentSummary, deleteDocumentFn, listDocumentsFn } from "@/server/documents.fn"

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

	// `localStorage` só existe no cliente; ler durante o SSR quebraria a hidratação.
	useEffect(() => {
		const stored = localStorage.getItem(LAYOUT_KEY)
		if (stored === "grid" || stored === "list") setLayout(stored)
		const draft = loadDraft()
		setDraftSubject(draft ? draft.subject?.trim() || "Documento sem assunto" : null)
	}, [])

	const chooseLayout = (next: Layout) => {
		setLayout(next)
		localStorage.setItem(LAYOUT_KEY, next)
	}

	const documents = useQuery({ queryKey: ["documents", "lista"], queryFn: () => listDocumentsFn() })

	const remove = useMutation({
		mutationFn: (id: string) => deleteDocumentFn({ data: { id } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", "lista"] }),
	})

	const all = documents.data ?? []
	const kinds = kindsPresent(all)
	const items = filterDocuments(all, { search, kind: kindFilter })
	const filtering = search.trim() !== "" || kindFilter !== null

	return (
		<div className="w-full py-10 flex flex-col gap-8">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-balance">Comunicações Oficiais</h1>
					<p className="text-muted-foreground mt-2 text-pretty max-w-2xl">
						Seus documentos redigidos conforme a{" "}
						<a href="/docs/NSCA 5-3.pdf" className="underline underline-offset-4" target="_blank" rel="noreferrer">
							NSCA 5-3/2026
						</a>
						. Escolha um para continuar, ou comece outro.
					</p>
				</div>
				<Button size="sm" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais/novo" />}>
					<Plus className="size-4" /> Novo documento
				</Button>
			</header>

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

					<span className="text-sm text-muted-foreground">
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
							className={`px-3 h-8 transition-colors ${layout === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
						>
							<Icon className="size-4" />
						</button>
					))}
				</fieldset>
			</div>

			{documents.error && (
				<p className="text-sm text-destructive">{documents.error instanceof Error ? documents.error.message : "Falha ao carregar seus documentos."}</p>
			)}

			{draftSubject && (
				<section className="flex flex-col gap-2">
					<h2 className="text-xs uppercase tracking-wider text-muted-foreground">Em edição, ainda sem salvar</h2>
					<Link
						to="/facilities/comunicacoes-oficiais/novo"
						className="border border-border p-4 flex items-center justify-between gap-4 hover:bg-accent transition-colors"
					>
						<span className="flex items-center gap-3 min-w-0">
							<Page className="size-5 shrink-0 text-muted-foreground" />
							<span className="truncate font-medium">{draftSubject}</span>
						</span>
						<span className="text-xs text-muted-foreground shrink-0">rascunho deste navegador</span>
					</Link>
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
						Nenhum documento salvo ainda. Comece um novo — ou parta de uma minuta existente, colando o texto de um ofício antigo dentro do editor.
					</p>
					<Button size="sm" nativeButton={false} render={<Link to="/facilities/comunicacoes-oficiais/novo" />}>
						<Plus className="size-4" /> Novo documento
					</Button>
				</div>
			) : layout === "grid" ? (
				<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{items.map((document) => (
						<li key={document.id} className="border border-border flex flex-col">
							<Link
								to="/facilities/comunicacoes-oficiais/$documentId"
								params={{ documentId: document.id }}
								className="flex-1 p-4 flex flex-col gap-3 hover:bg-accent transition-colors"
							>
								<Page className="size-6 text-muted-foreground" />
								<span className="font-medium leading-snug line-clamp-3">{document.title ?? "Documento sem assunto"}</span>
								<DocumentMeta document={document} />
							</Link>
							<RemoveButton onRemove={() => remove.mutate(document.id)} title={document.title} pending={remove.isPending} />
						</li>
					))}
				</ul>
			) : (
				<ul className="border border-border divide-y divide-border">
					{items.map((document) => (
						<li key={document.id} className="flex items-center justify-between gap-4">
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
								<RemoveButton onRemove={() => remove.mutate(document.id)} title={document.title} pending={remove.isPending} inline />
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

function RemoveButton({ onRemove, title, pending, inline }: { onRemove: () => void; title: string | null; pending: boolean; inline?: boolean }) {
	return (
		<div className={inline ? "" : "border-t border-border px-2 py-1 flex justify-end"}>
			<Button type="button" variant="ghost" size="sm" aria-label={`Excluir ${title ?? "documento"}`} onClick={onRemove} disabled={pending}>
				<Trash className="size-4" />
			</Button>
		</div>
	)
}
