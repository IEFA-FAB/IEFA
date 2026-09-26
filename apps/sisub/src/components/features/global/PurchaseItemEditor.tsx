import {
	CONSERVATION_CLASSES,
	CONSERVATION_LABELS,
	type ConservationClass,
	PACKAGE_TYPE_LABELS,
	PACKAGE_TYPES,
	type PackageType,
	TRANSPORT_LABELS,
	TRANSPORT_REQUIREMENTS,
	type TransportRequirement,
} from "@iefa/sisub-domain"
import { useForm, useStore } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { useDraft } from "@/hooks/forms/useDraft"
import { itemDraftKey } from "@/hooks/forms/useItemCards"
import type { DraftFields } from "@/lib/drafts/draft-diff"
import { type PurchaseItemWithLink, useCreatePurchaseItem, useUpdatePurchaseItem } from "@/services/IngredientsService"
import { PendingChanges } from "../shared/PendingChanges"
import { CatmatCombobox } from "./CatmatCombobox"

/** Prefixo das chaves de rascunho destes itens — a lista usa o mesmo para o selo "Rascunho não salvo". */
export const PURCHASE_ITEM_DRAFT_PREFIX = "sisub:purchase-item"

// O "sem valor" é `null`, não um sentinela: o Base UI trata qualquer valor não nulo como seleção e,
// sem rótulo em `items`, mostra o valor cru no gatilho (era assim que "__NONE__" aparecia).
const CONSERVATION_ITEMS = [{ value: null, label: "Não declarada" }, ...CONSERVATION_CLASSES.map((value) => ({ value, label: CONSERVATION_LABELS[value] }))]
const TRANSPORT_ITEMS = [{ value: null, label: "Não declarado" }, ...TRANSPORT_REQUIREMENTS.map((value) => ({ value, label: TRANSPORT_LABELS[value] }))]
const PACKAGE_TYPE_ITEMS = [{ value: null, label: "Não declarada" }, ...PACKAGE_TYPES.map((value) => ({ value, label: PACKAGE_TYPE_LABELS[value] }))]

const purchaseItemSchema = z
	.object({
		description: z.string().min(1, "Descrição obrigatória"),
		detailedDescription: z.string(),
		deliveryConditioning: z.string(),
		purchaseMeasureUnit: z.string(),
		unitPrice: z.number().min(0).nullable(),
		conversionFactor: z.number().min(0),
		// Acondicionamento EXIGIDO — atributo da especificação de compra, não do insumo.
		conservationClass: z.enum(CONSERVATION_CLASSES).nullable(),
		storageTempMinC: z.number().nullable(),
		storageTempMaxC: z.number().nullable(),
		minShelfLifeDaysOnDelivery: z.number().int().positive().nullable(),
		packageType: z.enum(PACKAGE_TYPES).nullable(),
		packageNetContent: z.number().positive().nullable(),
		packageNetContentUnit: z.string(),
		transportRequirement: z.enum(TRANSPORT_REQUIREMENTS).nullable(),
	})
	// Espelham purchase_item_temp_range_check e purchase_item_net_content_pair: sem
	// isto a violação chega como "violates check constraint", que não diz o campo.
	.refine((value) => value.storageTempMinC == null || value.storageTempMaxC == null || value.storageTempMinC <= value.storageTempMaxC, {
		message: "A mínima não pode ser maior que a máxima",
		path: ["storageTempMinC"],
	})
	.refine((value) => (value.packageNetContent == null) === (value.packageNetContentUnit.trim() === ""), {
		message: "Informe quantidade e unidade juntas",
		path: ["packageNetContentUnit"],
	})

type Catmat = { codigo: number | null; descricao: string | null }

/** Valores do formulário a partir do registro salvo — é também o baseline do rascunho. */
function purchaseItemValues(purchaseItem?: PurchaseItemWithLink) {
	return {
		description: purchaseItem?.description ?? "",
		detailedDescription: purchaseItem?.detailed_description ?? "",
		deliveryConditioning: purchaseItem?.delivery_conditioning ?? "",
		purchaseMeasureUnit: purchaseItem?.purchase_measure_unit ?? "",
		unitPrice: purchaseItem?.unit_price != null ? Number(purchaseItem.unit_price) : null,
		conversionFactor: purchaseItem?.conversion_factor != null ? Number(purchaseItem.conversion_factor) : 1.0,
		conservationClass: (purchaseItem?.conservation_class as ConservationClass | null) ?? null,
		storageTempMinC: purchaseItem?.storage_temp_min_c != null ? Number(purchaseItem.storage_temp_min_c) : null,
		storageTempMaxC: purchaseItem?.storage_temp_max_c != null ? Number(purchaseItem.storage_temp_max_c) : null,
		minShelfLifeDaysOnDelivery: purchaseItem?.min_shelf_life_days_on_delivery ?? null,
		packageType: (purchaseItem?.package_type as PackageType | null) ?? null,
		packageNetContent: purchaseItem?.package_net_content != null ? Number(purchaseItem.package_net_content) : null,
		packageNetContentUnit: purchaseItem?.package_net_content_unit ?? "",
		transportRequirement: (purchaseItem?.transport_requirement as TransportRequirement | null) ?? null,
	}
}

type PurchaseItemValues = ReturnType<typeof purchaseItemValues>
type PurchaseItemDraft = PurchaseItemValues & { catmat: Catmat }

const DRAFT_FIELDS: DraftFields<PurchaseItemDraft> = {
	catmat: { label: "CATMAT", format: (value) => (value?.codigo != null ? `#${value.codigo} ${value.descricao ?? ""}`.trim() : "—") },
	description: { label: "Descrição" },
	detailedDescription: { label: "Descrição detalhada" },
	deliveryConditioning: { label: "Acondicionamento da entrega" },
	conservationClass: { label: "Classe de conservação", format: (value) => (value ? CONSERVATION_LABELS[value] : "Não declarada") },
	transportRequirement: { label: "Transporte", format: (value) => (value ? TRANSPORT_LABELS[value] : "Não declarado") },
	storageTempMinC: { label: "Temperatura mínima (°C)" },
	storageTempMaxC: { label: "Temperatura máxima (°C)" },
	packageType: { label: "Embalagem primária", format: (value) => (value ? PACKAGE_TYPE_LABELS[value] : "Não declarada") },
	minShelfLifeDaysOnDelivery: { label: "Validade mínima na entrega (dias)" },
	packageNetContent: { label: "Conteúdo líquido" },
	packageNetContentUnit: { label: "Unidade do conteúdo" },
	purchaseMeasureUnit: { label: "Unidade de compra" },
	unitPrice: { label: "Preço de referência" },
	conversionFactor: { label: "Fator de conversão" },
}

interface PurchaseItemEditorProps {
	mode: "create" | "edit"
	purchaseItem?: PurchaseItemWithLink
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
 * Editor de item de compra aberto dentro do card da lista (collapsible), não em dialog: a
 * comparação com os itens irmãos (a mesma carne a vácuo e congelada são dois itens) é a
 * tarefa desta tela. Salvamento explícito — cada Salvar registra uma versão do insumo —
 * com rascunho local e a lista de alterações pendentes ao lado do botão.
 *
 * Não é um `<form>`: a aba mora na tela do insumo, e Enter num campo não deve disparar
 * nenhum outro formulário.
 */
export function PurchaseItemEditor({ mode, purchaseItem, ingredientId, ingredientName, ingredientHref, onClose, onChanged }: PurchaseItemEditorProps) {
	const queryClient = useQueryClient()
	const { createPurchaseItem, isCreating } = useCreatePurchaseItem()
	const { updatePurchaseItem, isUpdating } = useUpdatePurchaseItem()

	const savedCatmat: Catmat = { codigo: purchaseItem?.catmat_item_codigo ?? null, descricao: purchaseItem?.catmat_item_descricao ?? null }
	// CATMAT controlado fora do form (código + descrição vêm juntos do combobox)
	const [catmat, setCatmat] = useState<Catmat>(savedCatmat)

	const form = useForm({
		defaultValues: purchaseItemValues(purchaseItem),
		validators: { onChange: purchaseItemSchema },
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createPurchaseItem({
						ingredientId,
						description: value.description,
						detailedDescription: value.detailedDescription || null,
						deliveryConditioning: value.deliveryConditioning || null,
						purchaseMeasureUnit: value.purchaseMeasureUnit || null,
						catmatItemCodigo: catmat.codigo,
						catmatItemDescricao: catmat.descricao,
						unitPrice: value.unitPrice,
						conversionFactor: value.conversionFactor,
						conditioning: {
							conservationClass: value.conservationClass,
							storageTempMinC: value.storageTempMinC,
							storageTempMaxC: value.storageTempMaxC,
							minShelfLifeDaysOnDelivery: value.minShelfLifeDaysOnDelivery,
							packageType: value.packageType,
							packageNetContent: value.packageNetContent,
							packageNetContentUnit: value.packageNetContentUnit || null,
							transportRequirement: value.transportRequirement,
						},
					})
					toast.success("Item de compra criado com sucesso!")
				} else if (purchaseItem) {
					await updatePurchaseItem({
						id: purchaseItem.id,
						ingredientId,
						description: value.description,
						detailedDescription: value.detailedDescription || null,
						deliveryConditioning: value.deliveryConditioning || null,
						purchaseMeasureUnit: value.purchaseMeasureUnit || null,
						catmatItemCodigo: catmat.codigo,
						catmatItemDescricao: catmat.descricao,
						unitPrice: value.unitPrice,
						conversionFactor: value.conversionFactor,
						isDefault: purchaseItem.is_default,
						conditioning: {
							conservationClass: value.conservationClass,
							storageTempMinC: value.storageTempMinC,
							storageTempMaxC: value.storageTempMaxC,
							minShelfLifeDaysOnDelivery: value.minShelfLifeDaysOnDelivery,
							packageType: value.packageType,
							packageNetContent: value.packageNetContent,
							packageNetContentUnit: value.packageNetContentUnit || null,
							transportRequirement: value.transportRequirement,
						},
					})
					toast.success("Item de compra atualizado com sucesso!")
				}

				draft.clear()
				await queryClient.invalidateQueries({ queryKey: ["ingredients", "purchase-items", ingredientId] })
				onChanged?.()
				onClose()
			} catch {
				toast.error(mode === "create" ? "Erro ao criar item" : "Erro ao atualizar item")
			}
		},
	})

	const isPending = isCreating || isUpdating

	const values = useStore(form.store, (state) => state.values)
	const draft = useDraft<PurchaseItemDraft>({
		key: itemDraftKey(PURCHASE_ITEM_DRAFT_PREFIX, purchaseItem?.id, ingredientId),
		title: mode === "create" ? `Novo item de compra — ${ingredientName}` : `Item de compra: ${purchaseItem?.description ?? ""}`,
		href: ingredientHref,
		baseline: { ...purchaseItemValues(purchaseItem), catmat: savedCatmat },
		current: { ...values, catmat },
		baseStamp: purchaseItem?.updated_at ?? null,
		fields: DRAFT_FIELDS,
		onRestore: ({ catmat: restoredCatmat, ...restored }) => {
			form.reset(restored, { keepDefaultValues: true })
			setCatmat(restoredCatmat)
		},
	})

	const discard = () => {
		form.reset(purchaseItemValues(purchaseItem))
		setCatmat(savedCatmat)
		draft.clear()
	}

	return (
		<fieldset className="min-w-0" aria-label={mode === "create" ? "Novo item de compra" : `Editar ${purchaseItem?.description ?? "item de compra"}`}>
			<FieldGroup className="gap-4">
				{/* Identificação lado a lado no desktop — a largura da tela é o que o dialog não tinha */}
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{/* Correlação CATMAT */}
					<Field>
						<FieldLabel>Correlação CATMAT</FieldLabel>
						<CatmatCombobox
							value={catmat.codigo}
							descricao={catmat.descricao}
							onChange={(codigo, descricao) => {
								setCatmat({ codigo, descricao })
								// auto-preenche a descrição do item se ainda vazia
								if (codigo != null && descricao && !form.getFieldValue("description")) {
									form.setFieldValue("description", descricao)
								}
							}}
						/>
						<FieldDescription>
							Consulte também em{" "}
							<a href="https://catalogo.compras.gov.br/cnbs-web/busca" target="_blank" rel="noopener noreferrer">
								catalogo.compras.gov.br
							</a>
						</FieldDescription>
					</Field>

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
									placeholder="Ex: Arroz tipo 1, polido, longo fino"
									aria-invalid={!!field.state.meta.errors.length}
								/>
								<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
							</Field>
						)}
					</form.Field>
				</div>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{/* Descrição detalhada */}
					<form.Field name="detailedDescription">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Descrição Detalhada</FieldLabel>
								<Textarea
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Especificação completa do item (características, tipo, embalagem, marca de referência...)"
									rows={3}
								/>
								<FieldDescription>Especificação livre do item, além do rótulo curto e do CATMAT.</FieldDescription>
							</Field>
						)}
					</form.Field>

					{/* Acondicionamento da entrega */}
					<form.Field name="deliveryConditioning">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Acondicionamento da Entrega</FieldLabel>
								<Textarea
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Ex: Entregue congelado em caminhão frigorífico, mantendo cadeia de frio até -12 °C"
									rows={2}
								/>
								<FieldDescription>Como o item deve ser entregue/transportado — critério de aceite na entrega.</FieldDescription>
							</Field>
						)}
					</form.Field>
				</div>

				{/* Acondicionamento estruturado — o texto livre acima segue valendo para o que não cabe em coluna */}
				<div className="rounded-md border border-border bg-muted/30 p-4">
					<p className="text-label font-medium">Conservação e embalagem exigidas</p>
					<p className="text-caption text-muted-foreground mt-1 mb-4">
						É desta especificação que a conferência lê o critério de aceite, e é ela que define a classe do lote no estoque. A mesma carne a vácuo e congelada
						são dois itens de compra do mesmo insumo.
					</p>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<form.Field name="conservationClass">
							{(field) => (
								<Field>
									<FieldLabel>Classe de conservação</FieldLabel>
									<Select items={CONSERVATION_ITEMS} value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CONSERVATION_ITEMS.map((item) => (
												<SelectItem key={item.value ?? ""} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>

						<form.Field name="transportRequirement">
							{(field) => (
								<Field>
									<FieldLabel>Transporte</FieldLabel>
									<Select items={TRANSPORT_ITEMS} value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{TRANSPORT_ITEMS.map((item) => (
												<SelectItem key={item.value ?? ""} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldDescription>Pode ser mais estrito que a guarda.</FieldDescription>
								</Field>
							)}
						</form.Field>

						<form.Field name="storageTempMinC">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Temperatura mínima (°C)</FieldLabel>
									<Input
										id={field.name}
										type="number"
										step="0.1"
										value={field.state.value ?? ""}
										onChange={(e) => field.handleChange(e.target.value === "" ? null : Number(e.target.value))}
										placeholder="—"
										aria-invalid={!!field.state.meta.errors.length}
									/>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
								</Field>
							)}
						</form.Field>

						<form.Field name="storageTempMaxC">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Temperatura máxima (°C)</FieldLabel>
									<Input
										id={field.name}
										type="number"
										step="0.1"
										value={field.state.value ?? ""}
										onChange={(e) => field.handleChange(e.target.value === "" ? null : Number(e.target.value))}
										placeholder="Ex: -12"
									/>
									<FieldDescription>"-12 °C ou inferior" é só a máxima.</FieldDescription>
								</Field>
							)}
						</form.Field>

						<form.Field name="packageType">
							{(field) => (
								<Field>
									<FieldLabel>Embalagem primária</FieldLabel>
									<Select items={PACKAGE_TYPE_ITEMS} value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
										<SelectTrigger className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{PACKAGE_TYPE_ITEMS.map((item) => (
												<SelectItem key={item.value ?? ""} value={item.value}>
													{item.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldDescription>Material/forma — distinto da unidade de compra.</FieldDescription>
								</Field>
							)}
						</form.Field>

						<form.Field name="minShelfLifeDaysOnDelivery">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Validade mínima na entrega (dias)</FieldLabel>
									<Input
										id={field.name}
										type="number"
										step="1"
										min="1"
										value={field.state.value ?? ""}
										onChange={(e) => field.handleChange(e.target.value === "" ? null : Number(e.target.value))}
										placeholder="Ex: 180"
									/>
									<FieldDescription>Cláusula do edital, não vida de prateleira do produto.</FieldDescription>
								</Field>
							)}
						</form.Field>

						<form.Field name="packageNetContent">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Conteúdo líquido</FieldLabel>
									<Input
										id={field.name}
										type="number"
										step="0.0001"
										value={field.state.value ?? ""}
										onChange={(e) => field.handleChange(e.target.value === "" ? null : Number(e.target.value))}
										placeholder="Ex: 5"
									/>
								</Field>
							)}
						</form.Field>

						<form.Field name="packageNetContentUnit">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Unidade do conteúdo</FieldLabel>
									<Input
										id={field.name}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
										placeholder="Ex: KG"
										aria-invalid={!!field.state.meta.errors.length}
									/>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
								</Field>
							)}
						</form.Field>
					</div>
				</div>

				{/* Unidade de compra + preço de referência + fator de conversão */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<form.Field name="purchaseMeasureUnit">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Unidade de Compra</FieldLabel>
								<Input id={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} placeholder="Ex: KG, SACO, CAIXA" />
							</Field>
						)}
					</form.Field>

					<form.Field name="unitPrice">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Preço de Referência</FieldLabel>
								<Input
									id={field.name}
									type="number"
									step="0.0001"
									value={field.state.value ?? ""}
									onChange={(e) => field.handleChange(e.target.value === "" ? null : Number(e.target.value))}
									placeholder="0.0000"
								/>
								<FieldDescription>Preço unitário (R$)</FieldDescription>
							</Field>
						)}
					</form.Field>

					{/* Fator de Conversão */}
					<form.Field name="conversionFactor">
						{(field) => (
							<Field>
								<FieldLabel htmlFor={field.name}>Fator de Conversão</FieldLabel>
								<Input
									id={field.name}
									type="number"
									step="0.000001"
									value={field.state.value}
									onChange={(e) => field.handleChange(Number(e.target.value))}
									placeholder="1.000000"
								/>
								<FieldDescription>Conversão da unidade de compra para a unidade do insumo (padrão: 1.0)</FieldDescription>
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
