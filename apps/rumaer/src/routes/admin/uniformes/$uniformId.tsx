import type { CategoriaMilitar, Piece, PieceItemWithPiece, UniformVariantImage, UniformVariantWithPieces, VariantPieceWithPiece } from "@iefa/database/rumaer"
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeft, Check, Layers, Loader2, Plus, Trash2, Upload } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { BulkAddPieceDialog } from "@/components/admin/bulk-add-piece-dialog"
import { ImageDropzone, useImageDrop } from "@/components/admin/image-dropzone"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"
import { pieceItemsQueryOptions, piecesQueryOptions, signedImageQueryOptions, uniformQueryOptions } from "@/lib/uniforms/hooks"
import {
	CATEGORIA_LABELS,
	CIRCULO_LABELS,
	formatPieceName,
	GENERO_LABELS,
	GRUPO_LABELS,
	GRUPO_ORDER,
	OBRIGATORIEDADE_LABELS,
	OBRIGATORIEDADE_ORDER,
	TIPO_PECA_LABELS,
} from "@/lib/uniforms/labels"
import { useDebouncedEffect } from "@/lib/use-debounced-effect"
import {
	clearVariantImageFn,
	deleteUniformFn,
	deleteVariantFn,
	deleteVariantImageFn,
	setUniformCategoriesFn,
	setVariantPiecesFn,
	upsertUniformFn,
	upsertVariantFn,
	upsertVariantImageFn,
} from "@/server/admin.fn"
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
	const router = useRouter()
	const { data: uniform } = useSuspenseQuery(uniformQueryOptions(uniformId))
	const { data: pieces } = useSuspenseQuery(piecesQueryOptions())
	const { data: pieceItems } = useSuspenseQuery(pieceItemsQueryOptions())
	const queryClient = useQueryClient()
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rumaer"] })

	const [confirmDelete, setConfirmDelete] = useState(false)
	const remove = useMutation({
		mutationFn: () => deleteUniformFn({ data: { id: uniformId } }),
		onSuccess: async () => {
			toast.success("Uniforme excluído")
			await queryClient.invalidateQueries({ queryKey: ["rumaer", "uniforms"] })
			router.navigate({ to: "/admin" })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
	})

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
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
	})

	// Auto-save: dispara 800ms após parar de editar (ignora mount). Não salva sem nome.
	useDebouncedEffect(
		() => {
			if (form.nome.trim()) save.mutate()
		},
		[form],
		800
	)

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
			<header className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-2 flex-1 min-w-0">
					<input
						value={form.nome}
						onChange={(e) => setField("nome", e.target.value)}
						placeholder="Nome do uniforme"
						className="font-serif text-3xl sm:text-4xl font-bold tracking-tight bg-transparent outline-none border-b border-transparent focus:border-border"
					/>
					<Link to="/uniformes/$uniformId" params={{ uniformId }} className="text-sm text-muted-foreground hover:text-foreground w-fit">
						Ver página pública →
					</Link>
				</div>
				{confirmDelete ? (
					<div className="flex items-center gap-2 shrink-0">
						<span className="text-xs text-muted-foreground hidden sm:inline">Excluir uniforme?</span>
						<Button variant="destructive" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
							<Trash2 className="size-4" />
							Confirmar
						</Button>
						<Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
							Cancelar
						</Button>
					</div>
				) : (
					<Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
						<Trash2 className="size-4" />
						Excluir
					</Button>
				)}
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

			<Field label="Descrição">
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
								className={`border rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
							>
								{CATEGORIA_LABELS[c]}
							</button>
						)
					})}
				</div>
			</section>

			{/* Variantes */}
			<VariantsSection uniformId={uniformId} variants={uniform.variants} pieces={pieces} pieceItems={pieceItems} onChanged={invalidate} />

			{/* Barra de status sticky — tudo salva automaticamente */}
			<div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur z-40">
				<div className="w-full mx-auto px-4 sm:px-6 md:px-8 lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px] h-16 flex items-center justify-between gap-3">
					<span className="text-xs text-muted-foreground">Todas as alterações salvam automaticamente.</span>
					<SaveStatus pending={save.isPending} error={save.isError} blocked={!form.nome.trim()} blockedLabel="Informe um nome para salvar" />
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

function SaveStatus({ pending, error, blocked, blockedLabel }: { pending: boolean; error: boolean; blocked?: boolean; blockedLabel?: string }) {
	if (blocked) return <span className="text-xs font-medium text-amber-600 dark:text-amber-500">{blockedLabel ?? "Não salvo"}</span>
	if (error) return <span className="text-xs font-medium text-destructive">Erro ao salvar</span>
	if (pending)
		return (
			<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
				<Loader2 className="size-3.5 animate-spin" />
				Salvando…
			</span>
		)
	return (
		<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
			<Check className="size-3.5 text-emerald-600 dark:text-emerald-500" />
			Salvo
		</span>
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
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Variantes ({variants.length})</h2>
				{variants.length > 0 && (
					<BulkAddPieceDialog
						trigger={
							<Button variant="outline" size="sm">
								<Layers className="size-4" />
								Adicionar peça em lote
							</Button>
						}
						targets={variants.map((v) => ({ id: v.id, label: variantLabel(v) }))}
						pieces={pieces}
						pieceItems={pieceItems}
						onChanged={onChanged}
						description="Anexa a peça à composição das variantes marcadas deste uniforme."
					/>
				)}
			</div>

			<div className="flex flex-col sm:flex-row gap-3 sm:items-end border border-border rounded-lg p-4">
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
					// key inclui assinatura das peças → remonta com dados frescos quando a composição muda no servidor (ex.: lote)
					<VariantCard key={`${v.id}:${v.pieces.map((p) => p.piece_id).join(",")}`} variant={v} pieces={pieces} pieceItems={pieceItems} onChanged={onChanged} />
				))}
			</div>
		</section>
	)
}

function variantLabel(v: UniformVariantWithPieces) {
	return `${CIRCULO_LABELS[v.circulo]} · ${GENERO_LABELS[v.genero]}${v.sub_variacao ? ` · ${v.sub_variacao}` : ""}`
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

	// Preview com itens facultativos/eventuais toggláveis (espelha a página pública).
	// lookPieceId ativo → mostra a imagem daquela peça; fallback = imagem base (uniforme sem o item).
	const [lookPieceId, setLookPieceId] = useState<string | null>(null)
	const optionalPieces = [
		...new Map(variant.pieces.filter((p) => p.obrigatoriedade === "facultativo" || p.obrigatoriedade === "eventual").map((p) => [p.piece_id, p])).values(),
	]
	const activeLook = lookPieceId ? variant.images.find((img) => img.piece_id === lookPieceId) : undefined
	const { data: imageUrl } = useQuery(signedImageQueryOptions(activeLook?.image_path ?? variant.image_path))

	// Opções do dropdown = catálogo + peças da composição ausentes do catálogo (ex.: removidas), para o valor atual ter item correspondente.
	// Ordenadas alfabeticamente; label inclui tipo e marcação "(removida)" — tudo pesquisável no combobox.
	const pieceComboItems = useMemo(() => {
		const orphanPieces = [...new Map(variant.pieces.filter((vp) => !pieces.some((p) => p.id === vp.piece_id)).map((vp) => [vp.piece_id, vp.piece])).values()]
		return [...pieces, ...orphanPieces]
			.map((p) => ({
				value: p.id,
				label: `${formatPieceName(p.nome)}${p.tipo ? ` · ${TIPO_PECA_LABELS[p.tipo]}` : ""}${p.deleted_at ? " · (removida)" : ""}`,
			}))
			.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
	}, [pieces, variant.pieces])

	const del = useMutation({
		mutationFn: () => deleteVariantFn({ data: { id: variant.id } }),
		onSuccess: async () => {
			toast.success("Variante removida")
			await onChanged()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	const clearImage = useMutation({
		mutationFn: () => clearVariantImageFn({ data: { id: variant.id } }),
		onSuccess: async () => {
			toast.success("Imagem removida")
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
			await onChanged()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	// Auto-save da composição: 800ms após a última edição das linhas (ignora mount).
	useDebouncedEffect(
		() => {
			saveComposition.mutate()
		},
		[rows],
		800
	)

	async function handleUpload(file: File) {
		setUploading(true)
		try {
			const ext = file.name.split(".").pop() || "png"
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
		<div className="border border-border rounded-lg p-4 flex flex-col gap-4">
			{(activeLook?.image_path ?? variant.image_path) && (
				<div className="flex items-center justify-center border border-border rounded-md bg-muted/30 overflow-hidden">
					{imageUrl ? (
						<img src={imageUrl} alt={label} className="max-h-64 w-auto object-contain" />
					) : (
						<div className="flex items-center gap-2 text-xs text-muted-foreground py-10">
							<Loader2 className="size-3.5 animate-spin" />
							Carregando imagem…
						</div>
					)}
				</div>
			)}

			{/* Itens facultativos/eventuais — toggláveis para pré-visualizar o look */}
			{optionalPieces.length > 0 && (
				<div className="flex flex-col gap-2">
					{(["facultativo", "eventual"] as const).map((nivel) => {
						const itens = optionalPieces.filter((p) => p.obrigatoriedade === nivel)
						if (itens.length === 0) return null
						return (
							<div key={nivel} className="flex flex-col gap-1.5">
								<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{OBRIGATORIEDADE_LABELS[nivel]}</span>
								<div className="flex flex-wrap gap-2">
									{itens.map((p) => {
										const on = lookPieceId === p.piece_id
										const hasImg = variant.images.some((img) => img.piece_id === p.piece_id)
										return (
											<button
												key={p.piece_id}
												type="button"
												onClick={() => setLookPieceId(on ? null : p.piece_id)}
												className={`border rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
												title={hasImg ? "Tem imagem própria" : "Sem imagem — usa a imagem base"}
											>
												{formatPieceName(p.piece.nome)}
												{!hasImg && <span className={`ml-1 ${on ? "text-background/70" : "text-muted-foreground/60"}`}>(base)</span>}
											</button>
										)
									})}
								</div>
							</div>
						)
					})}
				</div>
			)}

			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold">{label}</span>
					{variant.image_path ? <Badge variant="secondary">com imagem</Badge> : <Badge variant="outline">sem imagem</Badge>}
				</div>
				<Button variant="ghost" size="sm" title="Remover variante" onClick={() => del.mutate()} disabled={del.isPending}>
					<Trash2 className="size-4" />
				</Button>
			</div>

			{/* Upload da imagem base — arraste ou clique */}
			<ImageDropzone
				onFile={handleUpload}
				uploading={uploading}
				hasImage={!!variant.image_path}
				onRemove={() => clearImage.mutate()}
				removing={clearImage.isPending}
			/>

			{/* Composição */}
			<div className="flex flex-col gap-2">
				<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Composição</span>
				{rows.map((r, i) => {
					const itemOptions = (r.piece_id ? pieceItems.filter((it) => it.piece_id === r.piece_id) : [])
						.map((it) => ({ value: it.id, label: it.nome }))
						.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
					return (
						<div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
							<Combobox
								className="flex-1"
								items={pieceComboItems}
								value={r.piece_id || null}
								onValueChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, piece_id: v ?? "", piece_item_id: null } : x)))}
								placeholder="Buscar peça…"
								emptyText="Nenhuma peça encontrada."
							/>
							<Combobox
								className="flex-1"
								items={itemOptions}
								value={r.piece_item_id}
								onValueChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, piece_item_id: v } : x)))}
								disabled={!r.piece_id || itemOptions.length === 0}
								placeholder={r.piece_id && itemOptions.length === 0 ? "sem item concreto" : "item concreto (opcional)"}
								emptyText="Nenhum item encontrado."
							/>
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
				<div className="flex items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setRows((rs) => [...rs, { piece_id: "", piece_item_id: null, obrigatoriedade: "obrigatorio", observacao: "" }])}
						disabled={pieces.length === 0}
					>
						<Plus className="size-4" />
						Peça
					</Button>
					<SaveStatus pending={saveComposition.isPending} error={saveComposition.isError} />
				</div>
			</div>

			{/* Imagens alternativas — por peça facultativa/eventual da composição */}
			<VariantAltImages variant={variant} onChanged={onChanged} />
		</div>
	)
}

// Imagens alternativas: uma por peça facultativa/eventual salva na composição.
function VariantAltImages({ variant, onChanged }: { variant: UniformVariantWithPieces; onChanged: () => Promise<unknown> }) {
	// peças facultativas/eventuais salvas no servidor (dedup por piece_id)
	const optionalPieces = [
		...new Map(variant.pieces.filter((p) => p.obrigatoriedade === "facultativo" || p.obrigatoriedade === "eventual").map((p) => [p.piece_id, p])).values(),
	]

	if (optionalPieces.length === 0) return null

	return (
		<div className="flex flex-col gap-2 border-t border-border pt-4">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imagens alternativas (por peça facultativa/eventual)</span>
			<p className="text-xs text-muted-foreground">Quando esta peça é usada, a página pública mostra a imagem correspondente.</p>
			<div className="flex flex-col gap-2">
				{optionalPieces.map((p) => (
					<AltImageRow key={p.piece_id} variant={variant} piece={p} image={variant.images.find((img) => img.piece_id === p.piece_id)} onChanged={onChanged} />
				))}
			</div>
		</div>
	)
}

function AltImageRow({
	variant,
	piece,
	image,
	onChanged,
}: {
	variant: UniformVariantWithPieces
	piece: VariantPieceWithPiece
	image: UniformVariantImage | undefined
	onChanged: () => Promise<unknown>
}) {
	const [uploading, setUploading] = useState(false)
	const { data: imageUrl } = useQuery(signedImageQueryOptions(image?.image_path))

	const del = useMutation({
		mutationFn: () => deleteVariantImageFn({ data: { id: image?.id ?? "" } }),
		onSuccess: async () => {
			toast.success("Imagem removida")
			await onChanged()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	async function handleUpload(file: File) {
		setUploading(true)
		try {
			const ext = file.name.split(".").pop() || "png"
			const filePath = `${variant.uniform_id}/${variant.id}__${piece.piece_id}.${ext}`
			const { path, token } = await getSignedUploadUrlFn({ data: { filePath } })
			const { error } = await supabase.storage.from("rumaer-uniforms").uploadToSignedUrl(path, token, file, { upsert: true })
			if (error) throw new Error(error.message)
			await upsertVariantImageFn({ data: { variant_id: variant.id, piece_id: piece.piece_id, image_path: path, legenda: piece.piece.nome } })
			toast.success("Imagem enviada")
			await onChanged()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Falha no upload")
		} finally {
			setUploading(false)
		}
	}

	// Linha inteira é droppable (noClick: o clique abre via botão dedicado).
	const { getRootProps, getInputProps, isDragActive, open } = useImageDrop({ onFile: handleUpload, disabled: uploading || del.isPending, noClick: true })

	return (
		<div
			{...getRootProps({
				className: `flex items-center gap-3 border rounded-md p-2 transition-colors ${isDragActive ? "border-foreground bg-muted" : "border-border"}`,
			})}
		>
			<input {...getInputProps()} />
			<div className="flex items-center justify-center size-16 shrink-0 border border-border rounded bg-muted/30 overflow-hidden">
				{image && imageUrl ? (
					<img src={imageUrl} alt={piece.piece.nome} className="size-full object-contain" />
				) : (
					<span className="text-[10px] text-muted-foreground text-center px-1">{image ? "…" : "sem img"}</span>
				)}
			</div>
			<div className="flex flex-col gap-0.5 flex-1 min-w-0">
				<span className="text-sm font-medium truncate">{formatPieceName(piece.piece.nome)}</span>
				<span className="text-xs text-muted-foreground">{isDragActive ? "Solte para enviar" : OBRIGATORIEDADE_LABELS[piece.obrigatoriedade]}</span>
			</div>
			<Button variant="outline" size="sm" onClick={open} disabled={uploading || del.isPending}>
				<Upload className="size-4" />
				{uploading ? "Enviando…" : image ? "Trocar" : "Enviar"}
			</Button>
			{image && (
				<Button variant="ghost" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
					<Trash2 className="size-4" />
				</Button>
			)}
		</div>
	)
}
