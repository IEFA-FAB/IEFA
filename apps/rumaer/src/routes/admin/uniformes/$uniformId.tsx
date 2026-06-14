import type { CategoriaMilitar, Piece, PieceItemWithPiece, UniformVariantWithPieces } from "@iefa/database/rumaer"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { pieceItemsQueryOptions, piecesQueryOptions, uniformQueryOptions } from "@/lib/uniforms/hooks"
import {
	CATEGORIA_LABELS,
	CIRCULO_LABELS,
	GENERO_LABELS,
	GRUPO_LABELS,
	GRUPO_ORDER,
	OBRIGATORIEDADE_LABELS,
	OBRIGATORIEDADE_ORDER,
	TIPO_PECA_LABELS,
} from "@/lib/uniforms/labels"
import { deleteVariantFn, setUniformCategoriesFn, setVariantPiecesFn, upsertUniformFn, upsertVariantFn } from "@/server/admin.fn"
import { getSignedUploadUrlFn } from "@/server/storage.fn"

const CATEGORIAS = Object.keys(CATEGORIA_LABELS) as CategoriaMilitar[]
const CIRCULOS = Object.keys(CIRCULO_LABELS) as (keyof typeof CIRCULO_LABELS)[]
const GENEROS = Object.keys(GENERO_LABELS) as (keyof typeof GENERO_LABELS)[]
const EQ_CIVIL = ["esporte", "esporte_fino", "passeio", "passeio_completo", "gala"] as const

export const Route = createFileRoute("/admin/uniformes/$uniformId")({
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(uniformQueryOptions(params.uniformId)),
			context.queryClient.ensureQueryData(piecesQueryOptions()),
			context.queryClient.ensureQueryData(pieceItemsQueryOptions()),
		])
	},
	component: UniformEditor,
})

function UniformEditor() {
	const { uniformId } = Route.useParams()
	const { data: uniform } = useSuspenseQuery(uniformQueryOptions(uniformId))
	const { data: pieces } = useSuspenseQuery(piecesQueryOptions())
	const { data: pieceItems } = useSuspenseQuery(pieceItemsQueryOptions())
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rumaer"] })

	// loader garante não-null
	const [form, setForm] = useState(() => ({
		nome: uniform?.nome ?? "",
		numero: uniform?.numero?.toString() ?? "",
		letra: uniform?.letra ?? "",
		grupo: uniform?.grupo ?? "representacao",
		subgrupo: uniform?.subgrupo ?? "",
		traje: uniform?.traje ?? "",
		art_referencia: uniform?.art_referencia ?? "",
		eq_mb: uniform?.eq_mb ?? "",
		eq_eb: uniform?.eq_eb ?? "",
		eq_civil: uniform?.eq_civil ?? null,
		descricao_md: uniform?.descricao_md ?? "",
	}))

	const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

	const save = useMutation({
		mutationFn: () =>
			upsertUniformFn({
				data: {
					id: uniformId,
					nome: form.nome.trim(),
					numero: form.numero ? Number(form.numero) : null,
					letra: form.letra || null,
					grupo: form.grupo,
					subgrupo: form.subgrupo || null,
					traje: form.traje || null,
					art_referencia: form.art_referencia || null,
					eq_mb: form.eq_mb || null,
					eq_eb: form.eq_eb || null,
					eq_civil: form.eq_civil,
					descricao_md: form.descricao_md || null,
				},
			}),
		onSuccess: async () => {
			toast.success("Uniforme salvo")
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
	})

	const activeCategories = new Set((uniform?.categories ?? []).map((c) => c.categoria))
	const toggleCategory = useMutation({
		mutationFn: (next: CategoriaMilitar[]) => setUniformCategoriesFn({ data: { uniformId, categorias: next } }),
		onSuccess: async () => await invalidate(),
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	if (!uniform) return null

	return (
		<div className="flex flex-col gap-8 pb-24">
			<Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
				<ArrowLeft className="size-4" />
				Administração
			</Link>

			{/* Header — nome como título editável */}
			<header className="flex flex-col gap-2">
				<input
					value={form.nome}
					onChange={(e) => setField("nome", e.target.value)}
					placeholder="Nome do uniforme"
					className="font-serif text-3xl sm:text-4xl font-bold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-border"
				/>
				<Link to="/uniformes/$uniformId" params={{ uniformId }} className="text-sm text-muted-foreground hover:text-foreground w-fit">
					Ver página pública →
				</Link>
			</header>

			{/* Campos principais */}
			<section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<Field label="Número">
					<Input type="number" value={form.numero} onChange={(e) => setField("numero", e.target.value)} placeholder="1–17 (vazio p/ históricos)" />
				</Field>
				<Field label="Letra">
					<Input value={form.letra} onChange={(e) => setField("letra", e.target.value)} placeholder="A / B / C" />
				</Field>
				<Field label="Grupo">
					<Select value={form.grupo} onValueChange={(v) => setField("grupo", v as typeof form.grupo)}>
						<SelectTrigger>
							<SelectValue>{GRUPO_LABELS[form.grupo]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{GRUPO_ORDER.map((g) => (
								<SelectItem key={g} value={g}>
									{GRUPO_LABELS[g]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field label="Subgrupo">
					<Input value={form.subgrupo} onChange={(e) => setField("subgrupo", e.target.value)} placeholder="gala / passeio / ..." />
				</Field>
				<Field label="Traje">
					<Input value={form.traje} onChange={(e) => setField("traje", e.target.value)} placeholder="passeio completo" />
				</Field>
				<Field label="Artigo de referência">
					<Input value={form.art_referencia} onChange={(e) => setField("art_referencia", e.target.value)} placeholder="Art. 24" />
				</Field>
			</section>

			{/* Equivalências */}
			<section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<Field label="Equivalência MB">
					<Input value={form.eq_mb} onChange={(e) => setField("eq_mb", e.target.value)} />
				</Field>
				<Field label="Equivalência EB">
					<Input value={form.eq_eb} onChange={(e) => setField("eq_eb", e.target.value)} />
				</Field>
				<Field label="Equivalência civil">
					<Select value={form.eq_civil ?? null} onValueChange={(v) => setField("eq_civil", v as typeof form.eq_civil)}>
						<SelectTrigger>
							<SelectValue placeholder="—">{form.eq_civil ?? undefined}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{EQ_CIVIL.map((e) => (
								<SelectItem key={e} value={e}>
									{e}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</section>

			<Field label="Descrição (markdown)">
				<Textarea value={form.descricao_md} onChange={(e) => setField("descricao_md", e.target.value)} rows={4} />
			</Field>

			{/* Categorias */}
			<section className="flex flex-col gap-2">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Categoria — quem pode usar</h2>
				<div className="flex flex-wrap gap-2">
					{CATEGORIAS.map((c) => {
						const active = activeCategories.has(c)
						return (
							<button
								key={c}
								type="button"
								onClick={() => {
									const next = active ? [...activeCategories].filter((x) => x !== c) : [...activeCategories, c]
									toggleCategory.mutate(next as CategoriaMilitar[])
								}}
								className={`border px-2.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
							>
								{CATEGORIA_LABELS[c]}
							</button>
						)
					})}
				</div>
			</section>

			{/* Variantes */}
			<VariantsSection uniformId={uniformId} variants={uniform.variants} pieces={pieces} pieceItems={pieceItems} onChanged={invalidate} />

			{/* Barra de save sticky */}
			<div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur z-40">
				<div className="w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px] h-16 flex items-center justify-end gap-3">
					<span className="text-xs text-muted-foreground mr-auto">Categorias e variantes salvam automaticamente. Campos principais exigem salvar.</span>
					<Button onClick={() => save.mutate()} disabled={save.isPending || !form.nome.trim()}>
						Salvar uniforme
					</Button>
				</div>
			</div>
		</div>
	)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
			{children}
		</div>
	)
}

// ---------------------------------------------------------------- variants ----
function VariantsSection({
	uniformId,
	variants,
	pieces,
	pieceItems,
	onChanged,
}: {
	uniformId: string
	variants: UniformVariantWithPieces[]
	pieces: Piece[]
	pieceItems: PieceItemWithPiece[]
	onChanged: () => Promise<unknown>
}) {
	const [circulo, setCirculo] = useState<(typeof CIRCULOS)[number] | null>(null)
	const [genero, setGenero] = useState<(typeof GENEROS)[number] | null>(null)
	const [sub, setSub] = useState("")

	const add = useMutation({
		mutationFn: () => {
			if (!circulo || !genero) throw new Error("Selecione círculo e gênero")
			return upsertVariantFn({
				data: { uniform_id: uniformId, circulo, genero, sub_variacao: sub || null, ordem: variants.length },
			})
		},
		onSuccess: async () => {
			toast.success("Variante adicionada")
			setCirculo(null)
			setGenero(null)
			setSub("")
			await onChanged()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	return (
		<section className="flex flex-col gap-4">
			<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Variantes ({variants.length})</h2>

			<div className="flex flex-col sm:flex-row gap-3 sm:items-end border border-border p-4">
				<Field label="Círculo">
					<Select value={circulo ?? null} onValueChange={(v) => setCirculo(v as (typeof CIRCULOS)[number])}>
						<SelectTrigger className="min-w-40">
							<SelectValue placeholder="Selecione…">{circulo ? CIRCULO_LABELS[circulo] : undefined}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{CIRCULOS.map((c) => (
								<SelectItem key={c} value={c}>
									{CIRCULO_LABELS[c]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field label="Gênero">
					<Select value={genero ?? null} onValueChange={(v) => setGenero(v as (typeof GENEROS)[number])}>
						<SelectTrigger className="min-w-40">
							<SelectValue placeholder="Selecione…">{genero ? GENERO_LABELS[genero] : undefined}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{GENEROS.map((g) => (
								<SelectItem key={g} value={g}>
									{GENERO_LABELS[g]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field label="Subvariação">
					<Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="gestante / tropa_montada" />
				</Field>
				<Button onClick={() => add.mutate()} disabled={!circulo || !genero || add.isPending}>
					<Plus className="size-4" />
					Adicionar
				</Button>
			</div>

			<div className="flex flex-col gap-4">
				{variants.map((v) => (
					<VariantCard key={v.id} variant={v} pieces={pieces} pieceItems={pieceItems} onChanged={onChanged} />
				))}
			</div>
		</section>
	)
}

function VariantCard({
	variant,
	pieces,
	pieceItems,
	onChanged,
}: {
	variant: UniformVariantWithPieces
	pieces: Piece[]
	pieceItems: PieceItemWithPiece[]
	onChanged: () => Promise<unknown>
}) {
	const fileRef = useRef<HTMLInputElement>(null)
	const fileInputId = useId()
	const [uploading, setUploading] = useState(false)
	const [rows, setRows] = useState(() =>
		variant.pieces.map((p) => ({
			piece_id: p.piece_id,
			piece_item_id: p.piece_item_id ?? null,
			obrigatoriedade: p.obrigatoriedade,
			observacao: p.observacao ?? "",
		}))
	)

	const label = `${CIRCULO_LABELS[variant.circulo]} · ${GENERO_LABELS[variant.genero]}${variant.sub_variacao ? ` · ${variant.sub_variacao}` : ""}`

	const del = useMutation({
		mutationFn: () => deleteVariantFn({ data: { id: variant.id } }),
		onSuccess: async () => {
			toast.success("Variante removida")
			await onChanged()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	const saveComposition = useMutation({
		mutationFn: () =>
			setVariantPiecesFn({
				data: {
					variantId: variant.id,
					pieces: rows
						.filter((r) => r.piece_id)
						.map((r, i) => ({
							piece_id: r.piece_id,
							piece_item_id: r.piece_item_id,
							obrigatoriedade: r.obrigatoriedade,
							observacao: r.observacao || null,
							ordem: i,
						})),
				},
			}),
		onSuccess: async () => {
			toast.success("Composição salva")
			await onChanged()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	async function handleUpload(file: File) {
		setUploading(true)
		try {
			const ext = file.name.split(".").pop() ?? "png"
			const filePath = `${variant.uniform_id}/${variant.id}.${ext}`
			const { path, token } = await getSignedUploadUrlFn({ data: { filePath } })
			const { error } = await supabase.storage.from("rumaer-uniforms").uploadToSignedUrl(path, token, file, { upsert: true })
			if (error) throw new Error(error.message)
			await upsertVariantFn({ data: { id: variant.id, uniform_id: variant.uniform_id, circulo: variant.circulo, genero: variant.genero, image_path: path } })
			toast.success("Imagem enviada")
			await onChanged()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Falha no upload")
		} finally {
			setUploading(false)
		}
	}

	return (
		<div className="border border-border p-4 flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold">{label}</span>
					{variant.image_path ? <Badge variant="secondary">com imagem</Badge> : <Badge variant="outline">sem imagem</Badge>}
				</div>
				<Button variant="ghost" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
					<Trash2 className="size-4" />
				</Button>
			</div>

			{/* Upload de imagem */}
			<div>
				<input
					id={fileInputId}
					ref={fileRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0]
						if (f) handleUpload(f)
					}}
				/>
				<Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
					<Upload className="size-4" />
					{uploading ? "Enviando…" : variant.image_path ? "Trocar imagem" : "Enviar imagem"}
				</Button>
			</div>

			{/* Composição */}
			<div className="flex flex-col gap-2">
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Composição</span>
				{rows.map((r, i) => {
					const itemsForPiece = r.piece_id ? pieceItems.filter((it) => it.piece_id === r.piece_id) : []
					const selectedItem = pieceItems.find((it) => it.id === r.piece_item_id)
					return (
						<div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
							<Select
								value={r.piece_id || null}
								onValueChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, piece_id: v ?? "", piece_item_id: null } : x)))}
							>
								<SelectTrigger className="flex-1">
									<SelectValue placeholder="Peça…">{r.piece_id ? (pieces.find((p) => p.id === r.piece_id)?.nome ?? r.piece_id) : undefined}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{pieces.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.nome} · {TIPO_PECA_LABELS[p.tipo]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={r.piece_item_id}
								onValueChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, piece_item_id: v } : x)))}
								disabled={!r.piece_id || itemsForPiece.length === 0}
							>
								<SelectTrigger className="flex-1">
									<SelectValue placeholder={r.piece_id && itemsForPiece.length === 0 ? "sem item concreto" : "item concreto (opcional)"}>
										{selectedItem ? selectedItem.nome : undefined}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{itemsForPiece.map((it) => (
										<SelectItem key={it.id} value={it.id}>
											{it.nome}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={r.obrigatoriedade}
								onValueChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, obrigatoriedade: v as typeof x.obrigatoriedade } : x)))}
							>
								<SelectTrigger className="min-w-40">
									<SelectValue>{OBRIGATORIEDADE_LABELS[r.obrigatoriedade]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{OBRIGATORIEDADE_ORDER.map((o) => (
										<SelectItem key={o} value={o}>
											{OBRIGATORIEDADE_LABELS[o]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Input
								value={r.observacao}
								onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, observacao: e.target.value } : x)))}
								placeholder="observação"
								className="flex-1"
							/>
							<Button variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
								<Trash2 className="size-4" />
							</Button>
						</div>
					)
				})}
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setRows((rs) => [...rs, { piece_id: "", piece_item_id: null, obrigatoriedade: "obrigatorio", observacao: "" }])}
						disabled={pieces.length === 0}
					>
						<Plus className="size-4" />
						Peça
					</Button>
					<Button size="sm" onClick={() => saveComposition.mutate()} disabled={saveComposition.isPending}>
						Salvar composição
					</Button>
				</div>
			</div>
		</div>
	)
}
