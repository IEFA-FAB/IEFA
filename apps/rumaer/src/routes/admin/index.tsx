import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Copy, Layers, Pencil, Plus, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useRumaerAccess } from "@/auth/pbac"
import { BulkAddPieceDialog, type BulkTarget } from "@/components/admin/bulk-add-piece-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { allVariantsQueryOptions, pieceItemsQueryOptions, piecesQueryOptions, uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { CIRCULO_LABELS, GENERO_LABELS, GRUPO_LABELS, GRUPO_ORDER, uniformTitle } from "@/lib/uniforms/labels"
import { cloneUniformFn, upsertUniformFn } from "@/server/admin.fn"

export const Route = createFileRoute("/admin/")({
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(uniformsQueryOptions({})),
			context.queryClient.ensureQueryData(allVariantsQueryOptions()),
			context.queryClient.ensureQueryData(piecesQueryOptions()),
			context.queryClient.ensureQueryData(pieceItemsQueryOptions()),
		])
	},
	component: AdminDashboard,
})

type Grupo = (typeof GRUPO_ORDER)[number]

/** Case- and accent-insensitive fold for client-side search. Module-scoped so it is a
 * stable reference (no per-render allocation, no exhaustive-deps ambiguity). */
const normalized = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function AdminDashboard() {
	const { data: uniforms } = useSuspenseQuery(uniformsQueryOptions({}))
	const { data: allVariants } = useSuspenseQuery(allVariantsQueryOptions())
	const { data: pieces } = useSuspenseQuery(piecesQueryOptions())
	const { data: pieceItems } = useSuspenseQuery(pieceItemsQueryOptions())
	const queryClient = useQueryClient()
	const router = useRouter()
	const { canManage } = useRumaerAccess()

	// Alvos do modal global: todas as variantes, agrupadas pelo título do uniforme.
	const bulkTargets = useMemo<BulkTarget[]>(
		() =>
			allVariants.map((v) => ({
				id: v.id,
				label: `${CIRCULO_LABELS[v.circulo]} · ${GENERO_LABELS[v.genero]}${v.sub_variacao ? ` · ${v.sub_variacao}` : ""}`,
				group: uniformTitle(v.uniform),
			})),
		[allVariants]
	)

	const [nome, setNome] = useState("")
	const [grupo, setGrupo] = useState<Grupo | null>(null)
	const [newOpen, setNewOpen] = useState(false)
	const [query, setQuery] = useState("")

	const create = useMutation({
		mutationFn: () => upsertUniformFn({ data: { nome: nome.trim(), grupo: grupo as Grupo } }),
		onSuccess: async (row) => {
			toast.success("Uniforme criado")
			setNome("")
			setGrupo(null)
			setNewOpen(false)
			await queryClient.invalidateQueries({ queryKey: ["rumaer", "uniforms"] })
			router.navigate({ to: "/admin/uniformes/$uniformId", params: { uniformId: row.id } })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar"),
	})

	// Filtro por título, traje e rótulo do grupo (case-insensitive, acento-insensível).
	const filteredUniforms = useMemo(() => {
		const q = normalized(query.trim())
		if (!q) return uniforms
		return uniforms.filter((u) => normalized(`${uniformTitle(u)} ${u.traje ?? ""} ${GRUPO_LABELS[u.grupo]}`).includes(q))
	}, [uniforms, query])

	const clone = useMutation({
		mutationFn: (id: string) => cloneUniformFn({ data: { id } }),
		onSuccess: async (row) => {
			toast.success("Uniforme clonado")
			await queryClient.invalidateQueries({ queryKey: ["rumaer", "uniforms"] })
			router.navigate({ to: "/admin/uniformes/$uniformId", params: { uniformId: row.id } })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao clonar"),
	})

	return (
		<div className="flex flex-col gap-8">
			<header className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-serif text-3xl font-bold tracking-tight">Administração</h1>
					<p className="text-sm text-muted-foreground">Cadastro de uniformes, variantes, composições e peças.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Dialog
						open={newOpen}
						onOpenChange={(open) => {
							// Reset the form when the dialog is dismissed (Cancelar/backdrop), so a
							// partially filled form never persists into the next open.
							if (!open) {
								setNome("")
								setGrupo(null)
							}
							setNewOpen(open)
						}}
					>
						<DialogTrigger
							render={
								<Button>
									<Plus className="size-4" />
									Novo uniforme
								</Button>
							}
						/>
						<DialogContent className="sm:max-w-md">
							<DialogHeader>
								<DialogTitle>Novo uniforme</DialogTitle>
							</DialogHeader>
							<div className="flex flex-col gap-4">
								<div className="flex flex-col gap-1.5">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</span>
									<Input
										value={nome}
										onChange={(e) => setNome(e.target.value)}
										placeholder="Ex.: 5º Uniforme A"
										// biome-ignore lint/a11y/noAutofocus: foco no primeiro campo ao abrir o modal
										autoFocus
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupo</span>
									<Select value={grupo ?? null} onValueChange={(v) => setGrupo(v as Grupo)}>
										<SelectTrigger>
											<SelectValue placeholder="Selecione…">{grupo ? GRUPO_LABELS[grupo] : undefined}</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{GRUPO_ORDER.map((g) => (
												<SelectItem key={g} value={g}>
													{GRUPO_LABELS[g]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							<DialogFooter>
								<DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
								<Button onClick={() => create.mutate()} disabled={!nome.trim() || !grupo || create.isPending}>
									<Plus className="size-4" />
									Criar
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
					{bulkTargets.length > 0 && (
						<BulkAddPieceDialog
							trigger={
								<Button variant="outline">
									<Layers className="size-4" />
									Adicionar peça em lote
								</Button>
							}
							targets={bulkTargets}
							pieces={pieces}
							pieceItems={pieceItems}
							onChanged={() => queryClient.invalidateQueries({ queryKey: ["rumaer"] })}
							description="Anexa a peça à composição das variantes marcadas, em qualquer uniforme."
						/>
					)}
					<Button nativeButton={false} render={<Link to="/admin/pecas">Catálogo de peças</Link>} variant="outline" />
					<Button nativeButton={false} render={<Link to="/admin/itens">Itens de venda</Link>} variant="outline" />
					{canManage && <Button nativeButton={false} render={<Link to="/admin/permissoes">Permissões</Link>} variant="outline" />}
				</div>
			</header>

			<section className="flex flex-col gap-3">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						{filteredUniforms.length} de {uniforms.length} uniforme(s)
					</h2>
					<div className="relative w-full sm:max-w-xs">
						<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Pesquisar uniforme…"
							className="pl-8"
							aria-label="Pesquisar uniforme"
						/>
					</div>
				</div>
				{filteredUniforms.length === 0 ? (
					<p className="border border-border rounded-md px-4 py-6 text-center text-sm text-muted-foreground">
						Nenhum uniforme encontrado{query.trim() ? ` para “${query.trim()}”` : ""}.
					</p>
				) : (
					<ul className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
						{filteredUniforms.map((u) => (
							<li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
								<div className="flex items-center gap-3">
									<Badge variant="outline">{GRUPO_LABELS[u.grupo]}</Badge>
									<span className="text-sm font-medium">{uniformTitle(u)}</span>
									<span className="text-xs text-muted-foreground">{u.traje}</span>
								</div>
								<div className="flex items-center gap-1">
									<Button variant="ghost" size="sm" onClick={() => clone.mutate(u.id)} disabled={clone.isPending} title="Clonar uniforme">
										<Copy className="size-4" />
										Clonar
									</Button>
									<Button
										nativeButton={false}
										variant="ghost"
										size="sm"
										render={
											<Link to="/admin/uniformes/$uniformId" params={{ uniformId: u.id }}>
												<Pencil className="size-4" />
												Editar
											</Link>
										}
									/>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	)
}
