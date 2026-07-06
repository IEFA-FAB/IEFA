import { useQuery } from "@tanstack/react-query"
import { ArrowLeftRight, FolderOpen, Loader2, Save } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ingredientSubstitutionsQueryOptions, ingredientsQueryOptions, useSetIngredientSubstitutions } from "@/services/IngredientsService"

interface SubstitutionsManagerProps {
	ingredientId: string
	/** Pasta do insumo — define o universo de irmãos elegíveis a substituto. */
	folderId: string | null
	/** Chamado após salvar para registrar uma versão do insumo. */
	onChanged?: () => void
}

/** Estado editável de uma linha (substituto candidato). */
interface RowState {
	enabled: boolean
	/** Texto do input do fator; vazio = usa o default 1 ao salvar. */
	factor: string
}

/**
 * Gerenciador de substituições de um insumo. As substituições vivem NO insumo
 * (não na preparação) e são direcionais: esta aba lista os insumos-irmãos (mesma
 * pasta) e permite habilitar cada um como substituto, com um fator opcional
 * (omitido = 1). Salva como replace-all do conjunto.
 */
export function SubstitutionsManager({ ingredientId, folderId, onChanged }: SubstitutionsManagerProps) {
	const { setIngredientSubstitutions, isSaving } = useSetIngredientSubstitutions()

	// Irmãos: todos os insumos da mesma pasta, menos o próprio.
	const { data: siblingsRaw, isLoading: siblingsLoading } = useQuery({
		...ingredientsQueryOptions(folderId ?? undefined),
		enabled: folderId != null,
	})
	const siblings = useMemo(() => (siblingsRaw ?? []).filter((i) => i.id !== ingredientId), [siblingsRaw, ingredientId])

	const { data: current, isLoading: currentLoading } = useQuery(ingredientSubstitutionsQueryOptions(ingredientId))

	// Base (servidor) → estado inicial de cada linha. Edições do usuário ficam em `overrides`.
	const base = useMemo(() => {
		const map = new Map((current ?? []).map((s) => [s.substitute_ingredient_id, s.factor]))
		const rows: Record<string, RowState> = {}
		for (const sib of siblings) {
			const factor = map.get(sib.id)
			rows[sib.id] = { enabled: factor != null, factor: factor != null && factor !== 1 ? String(factor) : "" }
		}
		return rows
	}, [current, siblings])

	const [overrides, setOverrides] = useState<Record<string, RowState>>({})
	const rowState = (id: string): RowState => overrides[id] ?? base[id] ?? { enabled: false, factor: "" }
	const setRow = (id: string, next: Partial<RowState>) => setOverrides((prev) => ({ ...prev, [id]: { ...rowState(id), ...next } }))

	const isDirty = Object.keys(overrides).length > 0

	const handleSave = async () => {
		const substitutions = siblings
			.map((sib) => ({ sib, row: rowState(sib.id) }))
			.filter(({ row }) => row.enabled)
			.map(({ sib, row }) => {
				const parsed = row.factor.trim() === "" ? undefined : Number(row.factor)
				return { substituteIngredientId: sib.id, factor: parsed != null && parsed > 0 ? parsed : undefined }
			})
		try {
			await setIngredientSubstitutions({ ingredientId, substitutions })
			setOverrides({})
			onChanged?.()
			toast.success("Substituições salvas!")
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			toast.error(msg || "Erro ao salvar substituições")
		}
	}

	// ── Estados especiais ────────────────────────────────────────────────────
	if (folderId == null) {
		return (
			<section className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
				<FolderOpen className="size-10 opacity-30" />
				<p className="text-body">Defina uma pasta na aba Detalhes</p>
				<p className="text-caption">As substituições são escolhidas entre os insumos da mesma pasta.</p>
			</section>
		)
	}

	const isLoading = siblingsLoading || currentLoading
	const enabledCount = siblings.filter((s) => rowState(s.id).enabled).length

	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<ArrowLeftRight className="size-5 text-muted-foreground" />
						<h2 className="text-heading">Substituições</h2>
						{!isLoading && <Badge variant="secondary">{enabledCount}</Badge>}
					</div>
					<p className="text-caption text-muted-foreground">
						Insumos da mesma pasta que podem substituir este. O fator ajusta a quantidade do substituto (padrão 1).
					</p>
				</div>
				<Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving} className="gap-2 shrink-0">
					{isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
					Salvar
				</Button>
			</div>

			{isLoading ? (
				<div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span className="text-body">Carregando insumos da pasta…</span>
				</div>
			) : siblings.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border py-12 text-muted-foreground">
					<ArrowLeftRight className="size-10 opacity-30" />
					<p className="text-body">Nenhum outro insumo nesta pasta</p>
					<p className="text-caption">Cadastre outros insumos na mesma pasta para habilitá-los como substitutos.</p>
				</div>
			) : (
				<ItemGroup>
					{siblings.map((sib) => {
						const row = rowState(sib.id)
						return (
							<Item key={sib.id} variant="outline" data-checked={row.enabled || undefined}>
								<ItemMedia>
									<Checkbox
										checked={row.enabled}
										onCheckedChange={(checked) => setRow(sib.id, { enabled: checked === true })}
										aria-label={`Habilitar ${sib.description ?? "insumo"} como substituto`}
									/>
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{sib.description ?? "Sem nome"}</ItemTitle>
									{sib.measure_unit && <ItemDescription>{sib.measure_unit}</ItemDescription>}
								</ItemContent>
								<ItemActions>
									<div className="flex items-center gap-1.5 text-caption text-muted-foreground">
										<span aria-hidden>Fator</span>
										<Input
											type="number"
											step="0.0001"
											min="0"
											inputMode="decimal"
											placeholder="1"
											value={row.factor}
											disabled={!row.enabled}
											onChange={(e) => setRow(sib.id, { factor: e.target.value })}
											className="h-8 w-20 text-right text-sm font-mono"
											aria-label={`Fator de substituição de ${sib.description ?? "insumo"}`}
										/>
									</div>
								</ItemActions>
							</Item>
						)
					})}
				</ItemGroup>
			)}
		</section>
	)
}
