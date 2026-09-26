/**
 * Solução, itens e pesquisa de preços: o que a alternativa escolhida vira em objeto,
 * requisitos, quantidades e valor.
 */

import {
	formatBRL,
	NATURES,
	type Nature,
	newId,
	PRICE_METHODS,
	type PriceMethod,
	QUOTE_SOURCE_LABEL,
	QUOTE_SOURCES,
	REQUIREMENT_KINDS,
	type RequirementKind,
	summarizePrices,
} from "@iefa/alpha-client/demand"
import { OpenNewWindow } from "iconoir-react"
import { useId } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { AddButton, Choice, DecimalInput, FieldBlock, Grid, ListCard, StepIntro, TextArea, TextInput } from "./fields"
import type { StepProps } from "./steps-structure"

export const NATURE_LABEL: Record<Nature, string> = {
	bem: "Bem (compra)",
	servico: "Serviço",
	servico_engenharia: "Serviço comum de engenharia",
	obra: "Obra",
	tic: "Solução de TIC",
}

const REQUIREMENT_LABEL: Record<RequirementKind, string> = {
	tecnico: "Técnico",
	entrega: "Entrega",
	garantia: "Garantia",
	sustentabilidade: "Sustentabilidade",
	qualificacao: "Qualificação",
	outro: "Outro",
}

const PRICE_METHOD_LABEL: Record<PriceMethod, string> = {
	auto: "Média; mediana quando o CV passa de 25% (recomendado)",
	media: "Média",
	mediana: "Mediana",
	menor: "Menor preço",
}

const CATALOG_SEARCH_URL = "https://catalogo.compras.gov.br/cnbs-web/busca"

// ─────────────────────────────────────────────────────────────────────────────
// 4. Solução
// ─────────────────────────────────────────────────────────────────────────────

export function SolutionStep({ demand, update }: StepProps) {
	const { solution } = demand
	const exclusiveId = useId()
	const objectives = demand.objectives.filter((objective) => objective.text.trim())
	const chosen = demand.alternatives.find((alternative) => alternative.id === demand.chosenAlternativeId)

	return (
		<div className="space-y-6">
			<StepIntro title="Como a alternativa escolhida vira objeto?">
				<p>
					{chosen ? (
						<>
							Alternativa escolhida: <strong className="text-foreground">{chosen.name || "(sem nome)"}</strong>.{" "}
						</>
					) : null}
					Escreva o objeto em uma frase, descreva a solução como um todo e liste os requisitos, cada um ligado ao objetivo que realiza. O que fica fora do
					objeto entra como exclusão, sempre com o motivo.
				</p>
			</StepIntro>

			<Grid>
				<Choice
					label="Natureza do objeto"
					hint="Decide o inciso da dispensa, o modelo de TR e a categoria de cada artefato."
					value={solution.nature}
					options={NATURES.map((nature) => ({ value: nature, label: NATURE_LABEL[nature] }))}
					onChange={(value) =>
						update((draft) => {
							draft.solution.nature = value
						})
					}
				/>
				<TextInput
					label="Local de entrega ou de execução"
					value={solution.deliveryPlace}
					onChange={(value) =>
						update((draft) => {
							draft.solution.deliveryPlace = value
						})
					}
				/>
			</Grid>

			<TextArea
				label="Objeto em uma frase"
				hint="Vai à descrição sucinta do DFD (até 200 caracteres) e ao cabeçalho de todas as peças. Ex.: Aquisição de 21 janelas de alumínio maxim-ar sob medida, com contramarcos, para o prédio E-102 do IEFA-SJ."
				value={solution.object}
				onChange={(value) =>
					update((draft) => {
						draft.solution.object = value
					})
				}
				rows={2}
				counter={200}
			/>
			<TextArea
				label="Descrição da solução como um todo"
				hint="O que será entregue ou executado, como, e o que o torna adequado aos objetivos."
				value={solution.description}
				onChange={(value) =>
					update((draft) => {
						draft.solution.description = value
					})
				}
				rows={5}
			/>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-lg tracking-tight">Requisitos</h3>
					<AddButton
						onClick={() =>
							update((draft) => {
								draft.solution.requirements.push({ id: newId("req"), text: "", kind: "tecnico", objectiveId: null })
							})
						}
					>
						requisito
					</AddButton>
				</div>
				{solution.requirements.map((requirement, index) => {
					const edit = (mutate: (target: typeof requirement) => void) =>
						update((draft) => {
							const target = draft.solution.requirements.find((candidate) => candidate.id === requirement.id)
							if (target) mutate(target)
						})
					return (
						<ListCard
							key={requirement.id}
							title={requirement.text.trim() || `Requisito ${index + 1}`}
							onRemove={() =>
								update((draft) => {
									draft.solution.requirements = draft.solution.requirements.filter((candidate) => candidate.id !== requirement.id)
								})
							}
						>
							<TextArea
								label="Requisito"
								value={requirement.text}
								onChange={(value) =>
									edit((target) => {
										target.text = value
									})
								}
								rows={2}
							/>
							<Grid>
								<Choice
									label="Tipo"
									value={requirement.kind}
									options={REQUIREMENT_KINDS.map((kind) => ({ value: kind, label: REQUIREMENT_LABEL[kind] }))}
									onChange={(value) =>
										edit((target) => {
											target.kind = value
										})
									}
								/>
								<Choice
									label="Realiza o objetivo"
									value={requirement.objectiveId}
									options={objectives.map((objective) => ({ value: objective.id, label: objective.text }))}
									onChange={(value) =>
										edit((target) => {
											target.objectiveId = value
										})
									}
									placeholder="nenhum"
								/>
							</Grid>
						</ListCard>
					)
				})}
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-lg tracking-tight">Fora do objeto</h3>
					<AddButton onClick={() => update((draft) => void draft.solution.exclusions.push({ id: newId("exc"), text: "", reason: "" }))}>exclusão</AddButton>
				</div>
				{solution.exclusions.map((exclusion, index) => {
					const edit = (mutate: (target: typeof exclusion) => void) =>
						update((draft) => {
							const target = draft.solution.exclusions.find((candidate) => candidate.id === exclusion.id)
							if (target) mutate(target)
						})
					return (
						<ListCard
							key={exclusion.id}
							title={exclusion.text.trim() || `Exclusão ${index + 1}`}
							onRemove={() =>
								update((draft) => {
									draft.solution.exclusions = draft.solution.exclusions.filter((candidate) => candidate.id !== exclusion.id)
								})
							}
						>
							<Grid>
								<TextInput
									label="O que fica fora"
									value={exclusion.text}
									onChange={(value) =>
										edit((target) => {
											target.text = value
										})
									}
									placeholder="Instalação das janelas"
								/>
								<TextInput
									label="Por quê"
									value={exclusion.reason}
									onChange={(value) =>
										edit((target) => {
											target.reason = value
										})
									}
									placeholder="o projeto arquitetônico ainda será elaborado"
								/>
							</Grid>
						</ListCard>
					)
				})}
			</section>

			<Grid>
				<Choice
					label="Parcelamento"
					value={solution.parcelamento.decision}
					options={[
						{ value: "por_item", label: "Por item (regra)" },
						{ value: "grupo_unico", label: "Grupo único (exige justificativa)" },
						{ value: "item_unico", label: "Item único" },
					]}
					onChange={(value) =>
						update((draft) => {
							draft.solution.parcelamento.decision = value
						})
					}
				/>
				<TextInput
					label="Justificativa do parcelamento"
					value={solution.parcelamento.rationale}
					onChange={(value) =>
						update((draft) => {
							draft.solution.parcelamento.rationale = value
						})
					}
				/>
			</Grid>

			<Grid>
				<DecimalInput
					label="Prazo de entrega ou execução (dias)"
					value={solution.deliveryDays}
					onChange={(value) =>
						update((draft) => {
							draft.solution.deliveryDays = value === null ? null : Math.max(1, Math.round(value))
						})
					}
				/>
				<DecimalInput
					label="Garantia (meses)"
					value={solution.warrantyMonths}
					onChange={(value) =>
						update((draft) => {
							draft.solution.warrantyMonths = value === null ? null : Math.round(value)
						})
					}
				/>
			</Grid>

			<TextArea
				label="Critérios de sustentabilidade"
				value={solution.sustainability}
				onChange={(value) =>
					update((draft) => {
						draft.solution.sustainability = value
					})
				}
				rows={2}
			/>

			<div className="space-y-3 border border-border p-4">
				<label htmlFor={exclusiveId} className="flex items-start gap-3 text-sm">
					<Checkbox
						id={exclusiveId}
						checked={solution.exclusivity.isExclusive}
						onCheckedChange={(checked) =>
							update((draft) => {
								draft.solution.exclusivity.isExclusive = checked === true
							})
						}
					/>
					<span>
						Só um fornecedor pode atender (exclusividade)
						<span className="mt-0.5 block text-muted-foreground text-xs">Leva à inexigibilidade do art. 74, I, com a comprovação da exclusividade.</span>
					</span>
				</label>
				{solution.exclusivity.isExclusive ? (
					<Grid>
						<TextInput
							label="Fornecedor exclusivo (razão social e CNPJ)"
							value={solution.exclusivity.supplier}
							onChange={(value) =>
								update((draft) => {
									draft.solution.exclusivity.supplier = value
								})
							}
						/>
						<TextInput
							label="Documento que comprova"
							value={solution.exclusivity.evidence}
							onChange={(value) =>
								update((draft) => {
									draft.solution.exclusivity.evidence = value
								})
							}
							placeholder="Declaração do fabricante de 10/09/2026"
						/>
					</Grid>
				) : null}
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Itens
// ─────────────────────────────────────────────────────────────────────────────

export function ItemsStep({ demand, update }: StepProps) {
	return (
		<div className="space-y-6">
			<StepIntro title="Quanto de cada coisa?">
				<p>
					Um item por linha do catálogo do Compras.gov.br. A memória de cálculo diz de onde saiu a quantidade (levantamento, consumo, efetivo) e vai ao ETP e à
					peça de memória de cálculo dos autos.
				</p>
				<p>
					Busque o código no{" "}
					<a href={CATALOG_SEARCH_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline underline-offset-4">
						Catálogo de Materiais e Serviços
						<OpenNewWindow className="size-3" aria-hidden="true" />
					</a>
					. O catálogo mostra também a natureza de despesa vinculada ao PDM.
				</p>
			</StepIntro>

			<AddButton
				onClick={() =>
					update((draft) => {
						draft.items.push({
							id: newId("item"),
							description: "",
							catalogKind: draft.solution.nature === "bem" || draft.solution.nature === null ? "CATMAT" : "CATSER",
							catalogCode: "",
							unit: "",
							quantity: null,
							quantityRationale: "",
							expenseNature: "",
						})
					})
				}
			>
				item
			</AddButton>

			{demand.items.map((item, index) => {
				const edit = (mutate: (target: typeof item) => void) =>
					update((draft) => {
						const target = draft.items.find((candidate) => candidate.id === item.id)
						if (target) mutate(target)
					})
				return (
					<ListCard
						key={item.id}
						title={`${index + 1}. ${item.description.trim() || "Item"}`}
						onRemove={() =>
							update((draft) => {
								draft.items = draft.items.filter((candidate) => candidate.id !== item.id)
								for (const quote of draft.quotes) delete quote.prices[item.id]
							})
						}
					>
						<TextArea
							label="Descrição"
							hint="A especificação do item, com o que o código do catálogo não diz (medidas, cor, acabamento)."
							value={item.description}
							onChange={(value) =>
								edit((target) => {
									target.description = value
								})
							}
							rows={2}
						/>
						<Grid cols={4}>
							<Choice
								label="Catálogo"
								value={item.catalogKind}
								options={[
									{ value: "CATMAT", label: "CATMAT (material)" },
									{ value: "CATSER", label: "CATSER (serviço)" },
								]}
								onChange={(value) =>
									edit((target) => {
										target.catalogKind = value
									})
								}
							/>
							<TextInput
								label="Código"
								value={item.catalogCode}
								onChange={(value) =>
									edit((target) => {
										target.catalogCode = value.replace(/\D/g, "").slice(0, 9)
									})
								}
								placeholder="610629"
							/>
							<TextInput
								label="Unidade"
								value={item.unit}
								onChange={(value) =>
									edit((target) => {
										target.unit = value
									})
								}
								placeholder="UN"
							/>
							<DecimalInput
								label="Quantidade"
								value={item.quantity}
								onChange={(value) =>
									edit((target) => {
										target.quantity = value
									})
								}
							/>
						</Grid>
						<Grid>
							<TextArea
								label="Memória de cálculo"
								value={item.quantityRationale}
								onChange={(value) =>
									edit((target) => {
										target.quantityRationale = value
									})
								}
								rows={2}
							/>
							<TextInput
								label="Natureza de despesa"
								hint="Formato 3.3.90.30.24. Bem incorporado ao imóvel é consumo (3.3.90.30.24), não 4.4.90.52."
								value={item.expenseNature}
								onChange={(value) =>
									edit((target) => {
										target.expenseNature = value.replace(/[^\d.]/g, "").slice(0, 14)
									})
								}
								placeholder="3.3.90.30.24"
							/>
						</Grid>
					</ListCard>
				)
			})}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pesquisa de preços
// ─────────────────────────────────────────────────────────────────────────────

function formatCv(cv: number | null): string {
	return cv === null ? "—" : `${(cv * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
}

export function PricesStep({ demand, update }: StepProps) {
	const prices = summarizePrices(demand)

	return (
		<div className="space-y-6">
			<StepIntro title="Quanto custa?">
				<p>
					Registre cada cotação com a fonte, a data e a validade, e o preço de cada item. Para bem sob medida, o preço vem das propostas (mínimo de três);
					tabelas e sítios servem de controle. A pesquisa automática do sistema, com dezenas de amostras de objetos diferentes, costuma dar coeficiente de
					variação de centenas por cento e não serve de parâmetro.
				</p>
				<p>Cotação afastada fica registrada com o motivo e sai da conta.</p>
			</StepIntro>

			<div className="flex flex-wrap items-end gap-4">
				<div className="w-full max-w-md">
					<Choice
						label="Critério por item"
						value={demand.priceMethod}
						options={PRICE_METHODS.map((method) => ({ value: method, label: PRICE_METHOD_LABEL[method] }))}
						onChange={(value) =>
							update((draft) => {
								draft.priceMethod = value
							})
						}
					/>
				</div>
				<AddButton
					onClick={() =>
						update((draft) => {
							draft.quotes.push({
								id: newId("cot"),
								source: "proposta",
								supplier: "",
								supplierDocument: "",
								contactEmail: "",
								reference: "",
								date: null,
								validUntil: null,
								prices: {},
								excludedReason: "",
							})
						})
					}
				>
					cotação
				</AddButton>
			</div>

			{demand.quotes.map((quote, index) => {
				const edit = (mutate: (target: typeof quote) => void) =>
					update((draft) => {
						const target = draft.quotes.find((candidate) => candidate.id === quote.id)
						if (target) mutate(target)
					})
				return (
					<ListCard
						key={quote.id}
						title={quote.supplier.trim() || `Cotação ${index + 1}`}
						badge={quote.excludedReason.trim() ? <span className="text-label text-muted-foreground">desconsiderada</span> : null}
						onRemove={() =>
							update((draft) => {
								draft.quotes = draft.quotes.filter((candidate) => candidate.id !== quote.id)
							})
						}
					>
						<Grid>
							<Choice
								label="Fonte (IN SEGES/ME nº 65/2021, art. 5º)"
								value={quote.source}
								options={QUOTE_SOURCES.map((source) => ({ value: source, label: QUOTE_SOURCE_LABEL[source] }))}
								onChange={(value) =>
									edit((target) => {
										target.source = value
									})
								}
							/>
							<TextInput
								label="Fornecedor ou fonte"
								value={quote.supplier}
								onChange={(value) =>
									edit((target) => {
										target.supplier = value
									})
								}
							/>
						</Grid>
						<Grid cols={3}>
							<TextInput
								label="CNPJ"
								value={quote.supplierDocument}
								onChange={(value) =>
									edit((target) => {
										target.supplierDocument = value.replace(/\D/g, "").slice(0, 14)
									})
								}
							/>
							<TextInput
								label="E-mail de quem respondeu"
								type="email"
								hint="Domínio igual entre concorrentes indica cotação dependente."
								value={quote.contactEmail}
								onChange={(value) =>
									edit((target) => {
										target.contactEmail = value
									})
								}
							/>
							<TextInput
								label="Nº da proposta ou link"
								value={quote.reference}
								onChange={(value) =>
									edit((target) => {
										target.reference = value
									})
								}
							/>
						</Grid>
						<Grid>
							<TextInput
								label="Data"
								type="date"
								value={quote.date ?? ""}
								onChange={(value) =>
									edit((target) => {
										target.date = value || null
									})
								}
							/>
							<TextInput
								label="Válida até"
								type="date"
								value={quote.validUntil ?? ""}
								onChange={(value) =>
									edit((target) => {
										target.validUntil = value || null
									})
								}
							/>
						</Grid>

						{demand.items.length > 0 ? (
							<FieldBlock label="Preço unitário por item (R$)" hint="Deixe em branco o item que a cotação não cobre.">
								<div className="divide-y divide-border border border-border">
									{demand.items.map((item, itemIndex) => (
										<div key={item.id} className="flex items-center gap-3 px-3 py-2">
											<span className="min-w-0 flex-1 truncate text-sm">
												{itemIndex + 1}. {item.description || "(sem descrição)"}
											</span>
											<div className="w-40 shrink-0">
												<DecimalInput
													money
													ariaLabel={`Preço do item ${itemIndex + 1}`}
													value={quote.prices[item.id] ?? null}
													onChange={(value) =>
														edit((target) => {
															if (value === null) delete target.prices[item.id]
															else target.prices[item.id] = value
														})
													}
												/>
											</div>
										</div>
									))}
								</div>
							</FieldBlock>
						) : (
							<p className="text-muted-foreground text-sm">Inclua os itens para lançar os preços.</p>
						)}

						<TextInput
							label="Desconsiderar esta cotação por"
							hint="Preencha só para afastar a cotação da estimativa (escopo diverso, vencida, não independente)."
							value={quote.excludedReason}
							onChange={(value) =>
								edit((target) => {
									target.excludedReason = value
								})
							}
						/>
					</ListCard>
				)
			})}

			{demand.items.length > 0 ? (
				<div className="overflow-x-auto border border-border">
					<table className="w-full min-w-[720px] text-left text-sm">
						<thead>
							<tr className="border-border border-b bg-muted/40">
								{["Item", "Preços", "Média", "Mediana", "CV", "Critério", "Unitário", "Total"].map((column) => (
									<th key={column} className="text-label px-3 py-2 font-medium text-muted-foreground">
										{column}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{prices.items.map((summary, index) => (
								<tr key={summary.itemId} className="border-border border-b last:border-b-0">
									<td className="px-3 py-2">{index + 1}</td>
									<td className="px-3 py-2 tabular-nums">{summary.values.length}</td>
									<td className="px-3 py-2 tabular-nums">{summary.mean === null ? "—" : formatBRL(summary.mean)}</td>
									<td className="px-3 py-2 tabular-nums">{summary.median === null ? "—" : formatBRL(summary.median)}</td>
									<td className="px-3 py-2 tabular-nums">{formatCv(summary.cv)}</td>
									<td className="px-3 py-2">{summary.method ?? "—"}</td>
									<td className="px-3 py-2 tabular-nums">{summary.unitPrice === null ? "—" : formatBRL(summary.unitPrice)}</td>
									<td className="px-3 py-2 tabular-nums">{summary.total === null ? "—" : formatBRL(summary.total)}</td>
								</tr>
							))}
						</tbody>
						<tfoot>
							<tr className="border-border border-t bg-muted/40 font-medium">
								<td className="px-3 py-2" colSpan={7}>
									Valor estimado
								</td>
								<td className="px-3 py-2 tabular-nums">{prices.total === null ? "—" : formatBRL(prices.total)}</td>
							</tr>
						</tfoot>
					</table>
				</div>
			) : null}

			<DecimalInput
				label="Já contratado no exercício com objeto da mesma natureza (R$)"
				hint="Soma com esta contratação no limite da dispensa (art. 75, § 1º). Consulte o setor de contratações da UASG."
				money
				value={demand.planning.sameNatureSpent}
				onChange={(value) =>
					update((draft) => {
						draft.planning.sameNatureSpent = value ?? 0
					})
				}
			/>
		</div>
	)
}
