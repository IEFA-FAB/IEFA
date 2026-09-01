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
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { type PurchaseItemWithLink, useCreatePurchaseItem, useUpdatePurchaseItem } from "@/services/IngredientsService"
import { CatmatCombobox } from "./CatmatCombobox"

const NONE = "__NONE__"

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

interface PurchaseItemFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	purchaseItem?: PurchaseItemWithLink
	ingredientId: string
	/** Registra uma versão do insumo após salvar. */
	onChanged?: () => void
}

export function PurchaseItemForm({ isOpen, onClose, mode, purchaseItem, ingredientId, onChanged }: PurchaseItemFormProps) {
	const queryClient = useQueryClient()
	const { createPurchaseItem, isCreating } = useCreatePurchaseItem()
	const { updatePurchaseItem, isUpdating } = useUpdatePurchaseItem()

	// CATMAT controlado fora do form (código + descrição vêm juntos do combobox)
	const [catmat, setCatmat] = useState<{ codigo: number | null; descricao: string | null }>({
		codigo: purchaseItem?.catmat_item_codigo ?? null,
		descricao: purchaseItem?.catmat_item_descricao ?? null,
	})

	const form = useForm({
		defaultValues: {
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
		},
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

				await queryClient.invalidateQueries({ queryKey: ["ingredients", "purchase-items", ingredientId] })
				onChanged?.()
				onClose()
				form.reset()
			} catch {
				toast.error(mode === "create" ? "Erro ao criar item" : "Erro ao atualizar item")
			}
		},
	})

	const isPending = isCreating || isUpdating

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Novo Item de Compra" : "Editar Item de Compra"}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						form.handleSubmit()
					}}
				>
					<FieldGroup className="gap-4">
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

						{/* Acondicionamento estruturado — o texto livre acima segue valendo para o que não cabe em coluna */}
						<div className="rounded-md border border-border bg-muted/30 p-4">
							<p className="text-label font-medium">Conservação e embalagem exigidas</p>
							<p className="text-caption text-muted-foreground mt-1 mb-4">
								É desta especificação que a conferência lê o critério de aceite, e é ela que define a classe do lote no estoque. A mesma carne a vácuo e
								congelada são dois itens de compra do mesmo insumo.
							</p>

							<div className="grid grid-cols-2 gap-4">
								<form.Field name="conservationClass">
									{(field) => (
										<Field>
											<FieldLabel>Classe de conservação</FieldLabel>
											<Select
												value={field.state.value ?? NONE}
												onValueChange={(value) => field.handleChange(value === NONE || value == null ? null : (value as ConservationClass))}
											>
												<SelectTrigger>
													<SelectValue placeholder="Não declarada">{field.state.value ? CONSERVATION_LABELS[field.state.value] : undefined}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={NONE}>Não declarada</SelectItem>
													{CONSERVATION_CLASSES.map((value) => (
														<SelectItem key={value} value={value}>
															{CONSERVATION_LABELS[value]}
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
											<Select
												value={field.state.value ?? NONE}
												onValueChange={(value) => field.handleChange(value === NONE || value == null ? null : (value as TransportRequirement))}
											>
												<SelectTrigger>
													<SelectValue placeholder="Não declarado">{field.state.value ? TRANSPORT_LABELS[field.state.value] : undefined}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={NONE}>Não declarado</SelectItem>
													{TRANSPORT_REQUIREMENTS.map((value) => (
														<SelectItem key={value} value={value}>
															{TRANSPORT_LABELS[value]}
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
											<Select
												value={field.state.value ?? NONE}
												onValueChange={(value) => field.handleChange(value === NONE || value == null ? null : (value as PackageType))}
											>
												<SelectTrigger>
													<SelectValue placeholder="Não declarada">{field.state.value ? PACKAGE_TYPE_LABELS[field.state.value] : undefined}</SelectValue>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={NONE}>Não declarada</SelectItem>
													{PACKAGE_TYPES.map((value) => (
														<SelectItem key={value} value={value}>
															{PACKAGE_TYPE_LABELS[value]}
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

						{/* Unidade de compra + Preço de referência */}
						<div className="grid grid-cols-2 gap-4">
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
						</div>

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
					</FieldGroup>

					<DialogFooter className="mt-6">
						<Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
