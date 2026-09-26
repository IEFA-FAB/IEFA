import type { IngredientItem } from "@iefa/database/sisub"
import { useForm, useStore } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { Tag } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import { useDraft } from "@/hooks/forms/useDraft"
import { itemDraftKey } from "@/hooks/forms/useItemCards"
import type { DraftFields } from "@/lib/drafts/draft-diff"
import { type PurchaseItemWithLink, useCreateIngredientItem, usePurchaseItems, useUpdateIngredientItem } from "@/services/IngredientsService"
import { PendingChanges } from "../shared/PendingChanges"

/** Prefixo das chaves de rascunho destes itens — a lista usa o mesmo para o selo "Rascunho não salvo". */
export const INGREDIENT_ITEM_DRAFT_PREFIX = "sisub:ingredient-item"

const ingredientItemSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	ingredient_id: z.uuid("Selecione um insumo"),
	barcode: z.string(),
	purchase_measure_unit: z.string(),
	unit_content_quantity: z.number().min(0),
	correction_factor: z.number().min(0),
	purchase_item_id: z.uuid().nullable(),
})

/** Valores do formulário a partir do registro salvo — é também o baseline do rascunho. */
function ingredientItemValues(ingredientId: string, ingredientItem?: IngredientItem) {
	return {
		description: ingredientItem?.description || "",
		ingredient_id: ingredientItem?.ingredient_id || ingredientId,
		barcode: ingredientItem?.barcode || "",
		purchase_measure_unit: ingredientItem?.purchase_measure_unit || "",
		unit_content_quantity: ingredientItem?.unit_content_quantity != null ? Number(ingredientItem.unit_content_quantity) : 1.0,
		// `!= null`, não truthiness: 0 é valor válido e virava 1 no baseline (rascunho fantasma).
		correction_factor: ingredientItem?.correction_factor != null ? Number(ingredientItem.correction_factor) : 1.0,
		purchase_item_id: ingredientItem?.purchase_item_id ?? null,
	}
}

type IngredientItemValues = ReturnType<typeof ingredientItemValues>

function draftFields(purchaseItems: PurchaseItemWithLink[] | undefined): DraftFields<IngredientItemValues> {
	return {
		description: { label: "Descrição" },
		purchase_item_id: {
			label: "Item de compra",
			format: (id) => (id ? (purchaseItems?.find((pi) => pi.id === id)?.description ?? "Item de compra indisponível") : "Sem item de compra"),
		},
		barcode: { label: "Código de barras (GTIN)" },
		purchase_measure_unit: { label: "Unidade de embalagem" },
		unit_content_quantity: { label: "Qtd por unidade" },
		correction_factor: { label: "Fator de correção" },
	}
}

interface IngredientItemEditorProps {
	mode: "create" | "edit"
	ingredientItem?: IngredientItem
	ingredientId: string
	/** Nome e endereço da tela do insumo, para o indicador global de rascunhos. */
	ingredientName: string
	ingredientHref: string
	/** Fecha o card. O rascunho, se houver, continua guardado. */
	onClose: () => void
	/** Registra uma versão do insumo após salvar. */
	onChanged?: () => void
}

/**
 * Editor de item de produto aberto dentro do card da lista. Mesmo contrato do
 * `PurchaseItemEditor`: salvamento explícito (cada Salvar registra uma versão do insumo),
 * rascunho local e alterações pendentes ao lado do botão; não é um `<form>`.
 */
export function IngredientItemEditor({ mode, ingredientItem, ingredientId, ingredientName, ingredientHref, onClose, onChanged }: IngredientItemEditorProps) {
	const queryClient = useQueryClient()
	const { createIngredientItem, isCreating } = useCreateIngredientItem()
	const { updateIngredientItem, isUpdating } = useUpdateIngredientItem()
	// Itens de compra disponíveis para vincular (escopados ao insumo da tela)
	const { purchaseItems } = usePurchaseItems(ingredientId)

	const form = useForm({
		defaultValues: ingredientItemValues(ingredientId, ingredientItem),
		validators: {
			onChange: ingredientItemSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createIngredientItem(value)
					toast.success("Item de produto criado com sucesso!")
				} else if (ingredientItem) {
					await updateIngredientItem({
						id: ingredientItem.id,
						payload: value,
					})
					toast.success("Item de produto atualizado com sucesso!")
				}

				draft.clear()
				await queryClient.invalidateQueries({
					queryKey: ["ingredients"],
				})
				onChanged?.()
				onClose()
			} catch (_error) {
				toast.error(mode === "create" ? "Erro ao criar item" : "Erro ao atualizar item")
			}
		},
	})

	const isPending = isCreating || isUpdating

	const values = useStore(form.store, (state) => state.values)
	const draft = useDraft<IngredientItemValues>({
		key: itemDraftKey(INGREDIENT_ITEM_DRAFT_PREFIX, ingredientItem?.id, ingredientId),
		title: mode === "create" ? `Novo item de produto — ${ingredientName}` : `Item de produto: ${ingredientItem?.description ?? ""}`,
		href: ingredientHref,
		baseline: ingredientItemValues(ingredientId, ingredientItem),
		current: values,
		fields: draftFields(purchaseItems),
		onRestore: (restored) => form.reset(restored, { keepDefaultValues: true }),
	})

	const discard = () => {
		form.reset(ingredientItemValues(ingredientId, ingredientItem))
		draft.clear()
	}

	return (
		<fieldset className="min-w-0" aria-label={mode === "create" ? "Novo item de produto" : `Editar ${ingredientItem?.description ?? "item de produto"}`}>
			<FieldGroup className="gap-4">
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{/* Descrição */}
					<form.Field name="description">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>
									Descrição <span className="text-destructive">*</span>
								</FieldLabel>
								<Input
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Ex: Arroz Marca X Saco 5kg"
									aria-invalid={!!field.state.meta.errors.length}
								/>
								<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
							</Field>
						)}
					</form.Field>

					{/* Item de Compra vinculado (herda o CATMAT) */}
					<form.Field name="purchase_item_id">
						{(field) => {
							const selected = purchaseItems?.find((pi) => pi.id === field.state.value)
							// Vínculo fora da lista (carregando, ou item de compra removido): sem esta entrada o
							// Base UI cai no valor cru e mostra o UUID no gatilho.
							const purchaseItemOptions = [
								{ value: null, label: "Sem item de compra" },
								...(purchaseItems ?? []).map((pi) => ({ value: pi.id, label: pi.description })),
								...(field.state.value && !selected ? [{ value: field.state.value, label: purchaseItems ? "Item de compra indisponível" : "Carregando…" }] : []),
							]
							return (
								<Field>
									<FieldLabel>Item de Compra (CATMAT)</FieldLabel>
									<Select items={purchaseItemOptions} value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={null}>Sem item de compra</SelectItem>
											{purchaseItems?.map((pi) => (
												<SelectItem key={pi.id} value={pi.id}>
													{pi.description}
													{pi.catmat_item_codigo != null ? ` — CATMAT ${pi.catmat_item_codigo}` : ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldDescription>
										{selected?.catmat_item_codigo != null ? (
											<span className="inline-flex items-center gap-1">
												<Tag className="size-3" />
												CATMAT {selected.catmat_item_codigo}
												{selected.catmat_item_descricao ? ` — ${selected.catmat_item_descricao}` : ""}
											</span>
										) : (
											"O item de produto herda o CATMAT do item de compra vinculado"
										)}
									</FieldDescription>
								</Field>
							)
						}}
					</form.Field>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{/* Código de Barras (GTIN / GS1) */}
					<form.Field name="barcode">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Código de Barras (GTIN)</FieldLabel>
								<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: 7891234567890" />
								<FieldDescription>Código GS1/GTIN do produto físico em estoque</FieldDescription>
							</Field>
						)}
					</form.Field>

					<form.Field name="purchase_measure_unit">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Unidade de Embalagem</FieldLabel>
								<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: SACO, CAIXA" />
								<FieldDescription>Embalagem do fornecedor</FieldDescription>
							</Field>
						)}
					</form.Field>

					<form.Field name="unit_content_quantity">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Qtd por Unidade</FieldLabel>
								<Input
									id={field.name}
									type="number"
									step="0.0001"
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
									placeholder="5.0"
								/>
								<FieldDescription>Ex: 5kg por saco</FieldDescription>
							</Field>
						)}
					</form.Field>

					{/* Fator de Correção */}
					<form.Field name="correction_factor">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Fator de Correção</FieldLabel>
								<Input
									id={field.name}
									type="number"
									step="0.0001"
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
									placeholder="1.0000"
								/>
							</Field>
						)}
					</form.Field>
				</div>
			</FieldGroup>

			<div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
				<PendingChanges draft={draft} onDiscard={discard} disabled={isPending} />
				<Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
					Fechar
				</Button>
				<Button type="button" onClick={() => form.handleSubmit()} disabled={isPending || (mode === "edit" && !draft.isDirty)}>
					{isPending ? "Salvando..." : mode === "create" ? "Criar item" : "Salvar item"}
				</Button>
			</div>
		</fieldset>
	)
}
