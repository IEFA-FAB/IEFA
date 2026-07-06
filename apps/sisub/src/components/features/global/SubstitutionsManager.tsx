import { useQuery } from "@tanstack/react-query"
import { ArrowLeftRight, Check, FolderOpen, Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/cn"
import { ingredientSubstitutionsQueryOptions, ingredientsQueryOptions, useSetIngredientSubstitutions } from "@/services/IngredientsService"

interface SubstitutionsManagerProps {
	ingredientId: string
	/** Pasta do insumo — define o universo de irmãos elegíveis a substituto. */
	folderId: string | null
}

/** Estado editável de uma linha (substituto candidato). */
interface RowState {
	enabled: boolean
	/** Texto do input do fator; vazio = usa o default 1 ao salvar. */
	factor: string
}

const EMPTY_ROW: RowState = { enabled: false, factor: "" }

/**
 * Gerenciador de substituições de um insumo. As substituições vivem NO insumo
 * (não na preparação) e são direcionais: esta aba lista os insumos-irmãos (mesma
 * pasta) e permite habilitar cada um como substituto, com um fator opcional
 * (omitido = 1).
 *
 * Salva automaticamente (replace-all) a cada alteração — marcar/desmarcar persiste
 * na hora; o fator persiste ao sair do campo. Não há botão próprio: o salvamento é
 * silencioso e a barra inferior do insumo cuida de identificação/nutrição.
 */
export function SubstitutionsManager({ ingredientId, folderId }: SubstitutionsManagerProps) {
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
	const rowState = (id: string): RowState => overrides[id] ?? base[id] ?? EMPTY_ROW

	// Constrói o conjunto completo (replace-all) a partir de um resolvedor de estado por id.
	const buildAndSave = (resolve: (id: string) => RowState) => {
		const substitutions = siblings
			.filter((sib) => resolve(sib.id).enabled)
			.map((sib) => {
				const raw = resolve(sib.id).factor.trim()
				const parsed = raw === "" ? undefined : Number(raw)
				return { substituteIngredientId: sib.id, factor: parsed != null && parsed > 0 ? parsed : undefined }
			})
		setIngredientSubstitutions({ ingredientId, substitutions }).catch((err) => {
			const msg = err instanceof Error ? err.message : String(err)
			toast.error(msg || "Erro ao salvar substituições")
		})
	}

	// Marcar/desmarcar persiste imediatamente (o toggle é a ação deliberada do usuário).
	const toggle = (id: string, enabled: boolean) => {
		const next = { ...overrides, [id]: { ...rowState(id), enabled } }
		setOverrides(next)
		buildAndSave((x) => next[x] ?? base[x] ?? EMPTY_ROW)
	}

	// O fator só atualiza o estado local ao digitar; persiste ao sair do campo (blur).
	const changeFactor = (id: string, factor: string) => setOverrides((prev) => ({ ...prev, [id]: { ...rowState(id), factor } }))
	const commitFactor = (id: string) => {
		if (!rowState(id).enabled) return
		buildAndSave((x) => overrides[x] ?? base[x] ?? EMPTY_ROW)
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
				{/* Sem botão próprio: as alterações salvam sozinhas. Só um indicador discreto de estado. */}
				<span className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground" aria-live="polite">
					{isSaving ? (
						<>
							<Loader2 className="size-3.5 animate-spin" />
							Salvando…
						</>
					) : (
						<>
							<Check className="size-3.5" />
							Salvo automaticamente
						</>
					)}
				</span>
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
						const label = sib.description ?? "Sem nome"
						return (
							<Item
								key={sib.id}
								variant="outline"
								data-checked={row.enabled || undefined}
								className={cn("cursor-pointer transition-colors", row.enabled ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40")}
								onClick={(e) => {
									// Clicar na linha alterna; ignora cliques vindos do input do fator.
									if ((e.target as HTMLElement).closest("input")) return
									toggle(sib.id, !row.enabled)
								}}
							>
								<ItemMedia>
									<Checkbox
										checked={row.enabled}
										onCheckedChange={(checked) => toggle(sib.id, checked === true)}
										aria-label={`Habilitar ${label} como substituto`}
										className="size-5 border-2 border-muted-foreground/60 data-checked:border-primary"
									/>
								</ItemMedia>
								<ItemContent>
									<ItemTitle>{label}</ItemTitle>
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
											onChange={(e) => changeFactor(sib.id, e.target.value)}
											onBlur={() => commitFactor(sib.id)}
											className="h-8 w-20 text-right text-sm font-mono"
											aria-label={`Fator de substituição de ${label}`}
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
