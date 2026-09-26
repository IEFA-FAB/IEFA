/**
 * Os três primeiros passos: a estruturação do problema pelo Value-Focused Thinking.
 *
 * A ordem é o método: primeiro o problema (contexto da decisão), depois o que se quer de fato
 * (objetivos fundamentais, com atributo), depois como se chega lá (objetivos-meio), e só então
 * as alternativas, geradas a partir dos objetivos. Contratar é uma das alternativas, não o
 * ponto de partida.
 */

import { ALTERNATIVE_KINDS, type AlternativeKind, type DemandPayload, newId, type Objective, RATINGS, type Rating } from "@iefa/alpha-client/demand"
import { useId } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { AddButton, Choice, DecimalInput, FieldBlock, Grid, ListCard, StepIntro, TextArea, TextInput } from "./fields"

export type Update = (mutate: (draft: DemandPayload) => void) => void

export interface StepProps {
	demand: DemandPayload
	update: Update
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Problema
// ─────────────────────────────────────────────────────────────────────────────

export function ContextStep({ demand, update, title, onTitle }: StepProps & { title: string; onTitle: (value: string) => void }) {
	const { context } = demand
	const superveningId = useId()
	return (
		<div className="space-y-6">
			<StepIntro title="Qual é o problema?">
				<p>
					Comece pelo problema, não pelo que comprar. Descreva fatos: o que falta ou falha hoje, onde, desde quando e o que acontece se nada for feito. É daqui
					que saem a justificativa do DFD e a descrição da necessidade do ETP.
				</p>
			</StepIntro>

			<Grid>
				<TextInput label="Título da demanda" hint="Como a demanda aparece na lista. Curto." value={title} onChange={onTitle} maxLength={200} />
				<TextInput
					label="Área requisitante"
					hint="Como está cadastrada no Compras.gov.br."
					value={demand.requestingArea}
					onChange={(value) =>
						update((draft) => {
							draft.requestingArea = value
						})
					}
					placeholder="Escritório do IEFA em São José dos Campos"
				/>
			</Grid>

			<TextArea
				label="O que acontece hoje?"
				hint="Fatos verificáveis. Ex.: os 21 vãos de janela do prédio E-102 têm esquadrias que não vedam chuva nem poeira e não permitem fechar o laboratório."
				value={context.problem}
				onChange={(value) =>
					update((draft) => {
						draft.context.problem = value
					})
				}
				rows={5}
			/>
			<Grid>
				<TextArea
					label="Quem é afetado?"
					hint="Setor, efetivo, usuários, bens expostos."
					value={context.affected}
					onChange={(value) =>
						update((draft) => {
							draft.context.affected = value
						})
					}
					rows={3}
				/>
				<TextArea
					label="O que acontece se nada for feito?"
					hint="A consequência, e em quanto tempo. Sustenta a necessidade e a prioridade."
					value={context.consequence}
					onChange={(value) =>
						update((draft) => {
							draft.context.consequence = value
						})
					}
					rows={3}
				/>
			</Grid>
			<TextArea
				label="O que tornou isso necessário agora?"
				hint="O fato que originou a demanda: cessão de área, quebra, norma nova, mudança de uso."
				value={context.trigger}
				onChange={(value) =>
					update((draft) => {
						draft.context.trigger = value
					})
				}
				rows={2}
			/>

			<Grid cols={3}>
				<TextInput
					label="Concluir a contratação até"
					type="date"
					value={context.deadline ?? ""}
					onChange={(value) =>
						update((draft) => {
							draft.context.deadline = value || null
						})
					}
				/>
				<Choice
					label="Prioridade"
					value={context.priority}
					options={[
						{ value: "baixa", label: "Baixa" },
						{ value: "media", label: "Média" },
						{ value: "alta", label: "Alta" },
					]}
					onChange={(value) =>
						update((draft) => {
							draft.context.priority = value
						})
					}
				/>
				<TextInput
					label="Motivo do prazo"
					value={context.deadlineReason}
					onChange={(value) =>
						update((draft) => {
							draft.context.deadlineReason = value
						})
					}
					placeholder="ocupação do laboratório em dezembro"
				/>
			</Grid>
			<TextArea
				label="Justificativa da prioridade"
				hint="Vai ao campo de mesmo nome no DFD. Se ficar vazio, o DFD usa o prazo e o motivo."
				value={context.priorityReason}
				onChange={(value) =>
					update((draft) => {
						draft.context.priorityReason = value
					})
				}
				rows={2}
			/>

			<label htmlFor={superveningId} className="flex items-start gap-3 border border-border p-3 text-sm">
				<Checkbox
					id={superveningId}
					checked={context.supervening}
					onCheckedChange={(checked) =>
						update((draft) => {
							draft.context.supervening = checked === true
						})
					}
				/>
				<span>
					A demanda surgiu depois do prazo do Plano de Contratações Anual (fato superveniente).
					<span className="mt-0.5 block text-muted-foreground text-xs">O DFD registra isso no Acompanhamento, com o fato que originou a demanda.</span>
				</span>
			</label>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Objetivos
// ─────────────────────────────────────────────────────────────────────────────

const ATTRIBUTE_KINDS = [
	{ value: "natural", label: "Medida direta" },
	{ value: "constructed", label: "Escala definida para o caso" },
	{ value: "proxy", label: "Medida indireta" },
] as const

function ObjectiveCard({
	objective,
	fundamentals,
	update,
	index,
}: {
	objective: Objective
	fundamentals: Objective[]
	update: StepProps["update"]
	index: number
}) {
	const edit = (mutate: (target: Objective) => void) =>
		update((draft) => {
			const target = draft.objectives.find((candidate) => candidate.id === objective.id)
			if (target) mutate(target)
		})
	const isFundamental = objective.kind === "fundamental"

	return (
		<ListCard
			title={objective.text.trim() || (isFundamental ? `Objetivo fundamental ${index + 1}` : "Objetivo-meio")}
			badge={<span className="text-label text-muted-foreground">{isFundamental ? "fundamental" : "meio"}</span>}
			onRemove={() =>
				update((draft) => {
					draft.objectives = draft.objectives.filter((candidate) => candidate.id !== objective.id)
					for (const other of draft.objectives) other.supports = other.supports.filter((target) => target !== objective.id)
					for (const requirement of draft.solution.requirements) if (requirement.objectiveId === objective.id) requirement.objectiveId = null
					for (const alternative of draft.alternatives) delete alternative.ratings[objective.id]
				})
			}
		>
			<Grid>
				<TextInput
					label={isFundamental ? "O que se quer de fato" : "Como se chega lá"}
					value={objective.text}
					onChange={(value) =>
						edit((target) => {
							target.text = value
						})
					}
					placeholder={isFundamental ? "Proteger os equipamentos do laboratório" : "Janelas com vedação contra chuva e poeira"}
				/>
				<Choice
					label="Tipo"
					value={objective.kind}
					options={[
						{ value: "fundamental", label: "Fundamental (vale por si)" },
						{ value: "means", label: "Meio (leva a um fundamental)" },
					]}
					onChange={(value) =>
						edit((target) => {
							target.kind = value
							if (value === "fundamental") target.supports = []
						})
					}
				/>
			</Grid>
			<TextInput
				label="Por que isso importa?"
				hint={isFundamental ? "Se a resposta for outro objetivo, este é meio: troque o tipo." : "A resposta aponta o fundamental que este meio sustenta."}
				value={objective.why}
				onChange={(value) =>
					edit((target) => {
						target.why = value
					})
				}
			/>

			{isFundamental ? (
				<div className="space-y-3 border border-border p-3">
					<p className="text-label text-muted-foreground">Como medir o atendimento</p>
					<Grid>
						<TextInput
							label="Atributo"
							hint="O que se mede. Ex.: vãos com vedação e fechamento seguro."
							value={objective.attribute.name}
							onChange={(value) =>
								edit((target) => {
									target.attribute.name = value
								})
							}
						/>
						<Choice
							label="Tipo de medida"
							value={objective.attribute.kind}
							options={ATTRIBUTE_KINDS}
							onChange={(value) =>
								edit((target) => {
									target.attribute.kind = value
								})
							}
						/>
						<TextInput
							label="Hoje"
							value={objective.attribute.baseline}
							onChange={(value) =>
								edit((target) => {
									target.attribute.baseline = value
								})
							}
							placeholder="0 de 21"
						/>
						<TextInput
							label="Meta"
							value={objective.attribute.target}
							onChange={(value) =>
								edit((target) => {
									target.attribute.target = value
								})
							}
							placeholder="21 de 21"
						/>
					</Grid>
				</div>
			) : (
				<FieldBlock label="Sustenta os objetivos fundamentais">
					{fundamentals.length === 0 ? (
						<p className="text-muted-foreground text-sm">Registre primeiro um objetivo fundamental.</p>
					) : (
						<div className="space-y-2">
							{fundamentals.map((fundamental) => (
								<label key={fundamental.id} htmlFor={`${objective.id}-supports-${fundamental.id}`} className="flex items-center gap-2 text-sm">
									<Checkbox
										id={`${objective.id}-supports-${fundamental.id}`}
										checked={objective.supports.includes(fundamental.id)}
										onCheckedChange={(checked) =>
											edit((target) => {
												target.supports = checked ? [...new Set([...target.supports, fundamental.id])] : target.supports.filter((id) => id !== fundamental.id)
											})
										}
									/>
									{fundamental.text || "(sem texto)"}
								</label>
							))}
						</div>
					)}
				</FieldBlock>
			)}
		</ListCard>
	)
}

export function ObjectivesStep({ demand, update }: StepProps) {
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental")
	const means = demand.objectives.filter((objective) => objective.kind === "means")
	const orphanMeans = means.filter((objective) => !objective.supports.some((target) => fundamentals.some((fundamental) => fundamental.id === target)))

	const add = (kind: Objective["kind"]) =>
		update((draft) => {
			draft.objectives.push({
				id: newId("obj"),
				text: "",
				kind,
				why: "",
				supports: kind === "means" && fundamentals.length === 1 ? [fundamentals[0]?.id as string] : [],
				attribute: { name: "", kind: "natural", baseline: "", target: "" },
			})
		})

	return (
		<div className="space-y-6">
			<StepIntro title="O que se quer de fato?">
				<p>
					<strong className="text-foreground">Objetivo fundamental</strong> é o que vale por si: proteger o patrimônio, garantir a continuidade do serviço, a
					segurança das pessoas. <strong className="text-foreground">Objetivo-meio</strong> é o caminho: "janelas com vedação", "portão com fechadura". Para
					separar os dois, pergunte "por que isso importa?". Se a resposta for outro objetivo, o primeiro é meio.
				</p>
				<p>
					Cada fundamental ganha um atributo (como medir) e uma meta. Eles viram os benefícios do ETP. Os meios viram requisitos da contratação. Poucos
					fundamentais bastam: dois ou três costumam cobrir a demanda.
				</p>
			</StepIntro>

			<div className="flex flex-wrap gap-2">
				<AddButton onClick={() => add("fundamental")}>objetivo fundamental</AddButton>
				<AddButton onClick={() => add("means")}>objetivo-meio</AddButton>
			</div>

			{fundamentals.map((fundamental, index) => {
				const children = means.filter((objective) => objective.supports.includes(fundamental.id))
				return (
					<div key={fundamental.id} className="space-y-3">
						<ObjectiveCard objective={fundamental} fundamentals={fundamentals} update={update} index={index} />
						{children.length > 0 ? (
							<div className="ml-6 space-y-3 border-border border-l pl-4">
								{children.map((child, childIndex) => (
									<ObjectiveCard key={child.id} objective={child} fundamentals={fundamentals} update={update} index={childIndex} />
								))}
							</div>
						) : null}
					</div>
				)
			})}

			{orphanMeans.length > 0 ? (
				<div className="space-y-3">
					<p className="text-label text-muted-foreground">Objetivos-meio sem fundamental</p>
					{orphanMeans.map((objective, index) => (
						<ObjectiveCard key={objective.id} objective={objective} fundamentals={fundamentals} update={update} index={index} />
					))}
				</div>
			) : null}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Alternativas
// ─────────────────────────────────────────────────────────────────────────────

export const ALTERNATIVE_KIND_LABEL: Record<AlternativeKind, string> = {
	contratar: "Contratar",
	ata_vigente: "Usar ata de registro de preços vigente",
	meios_proprios: "Resolver com meios próprios",
	nao_fazer: "Não fazer nada",
	outra: "Outra",
}

export const RATING_LABEL: Record<Rating, string> = { atende: "Atende", parcial: "Atende em parte", nao_atende: "Não atende" }

const QUICK_ALTERNATIVES: ReadonlyArray<{ kind: AlternativeKind; name: string }> = [
	{ kind: "contratar", name: "" },
	{ kind: "ata_vigente", name: "Adesão ou uso de ata de registro de preços vigente" },
	{ kind: "meios_proprios", name: "Solução com meios próprios" },
	{ kind: "nao_fazer", name: "Manter a situação atual" },
]

export function AlternativesStep({ demand, update }: StepProps) {
	const fundamentals = demand.objectives.filter((objective) => objective.kind === "fundamental" && objective.text.trim())

	return (
		<div className="space-y-6">
			<StepIntro title="Que caminhos existem?">
				<p>
					Com os objetivos definidos, liste as alternativas e avalie cada uma contra eles. Contratar é uma alternativa; usar uma ata vigente, resolver com meios
					próprios e manter a situação atual também são, e registrar por que foram descartadas é o levantamento de mercado do ETP.
				</p>
			</StepIntro>

			<div className="flex flex-wrap gap-2">
				{QUICK_ALTERNATIVES.map((quick) => (
					<AddButton
						key={quick.kind}
						onClick={() =>
							update((draft) => {
								draft.alternatives.push({ id: newId("alt"), name: quick.name, kind: quick.kind, description: "", ratings: {}, estimatedCost: null, notes: "" })
							})
						}
					>
						{ALTERNATIVE_KIND_LABEL[quick.kind].toLowerCase()}
					</AddButton>
				))}
			</div>

			{demand.alternatives.map((alternative, index) => {
				const chosen = demand.chosenAlternativeId === alternative.id
				const edit = (mutate: (target: (typeof demand.alternatives)[number]) => void) =>
					update((draft) => {
						const target = draft.alternatives.find((candidate) => candidate.id === alternative.id)
						if (target) mutate(target)
					})
				return (
					<ListCard
						key={alternative.id}
						title={alternative.name.trim() || `Alternativa ${index + 1}`}
						badge={chosen ? <span className="text-label">escolhida</span> : null}
						onRemove={() =>
							update((draft) => {
								draft.alternatives = draft.alternatives.filter((candidate) => candidate.id !== alternative.id)
								if (draft.chosenAlternativeId === alternative.id) draft.chosenAlternativeId = null
							})
						}
					>
						<Grid>
							<TextInput
								label="Alternativa"
								value={alternative.name}
								onChange={(value) =>
									edit((target) => {
										target.name = value
									})
								}
							/>
							<Choice
								label="Tipo"
								value={alternative.kind}
								options={ALTERNATIVE_KINDS.map((kind) => ({ value: kind, label: ALTERNATIVE_KIND_LABEL[kind] }))}
								onChange={(value) =>
									edit((target) => {
										target.kind = value
									})
								}
							/>
						</Grid>
						<TextArea
							label="Descrição"
							value={alternative.description}
							onChange={(value) =>
								edit((target) => {
									target.description = value
								})
							}
							rows={2}
						/>

						{fundamentals.length > 0 ? (
							<div className="space-y-2">
								<p className="text-label text-muted-foreground">Atende aos objetivos?</p>
								<Grid>
									{fundamentals.map((objective) => (
										<Choice
											key={objective.id}
											label={objective.text}
											value={alternative.ratings[objective.id] ?? null}
											options={RATINGS.map((rating) => ({ value: rating, label: RATING_LABEL[rating] }))}
											onChange={(value) =>
												edit((target) => {
													target.ratings[objective.id] = value
												})
											}
											placeholder="avaliar"
										/>
									))}
								</Grid>
							</div>
						) : (
							<p className="text-muted-foreground text-sm">Registre os objetivos fundamentais para avaliar a alternativa.</p>
						)}

						<Grid>
							<DecimalInput
								label="Custo aproximado (R$)"
								money
								value={alternative.estimatedCost}
								onChange={(value) =>
									edit((target) => {
										target.estimatedCost = value
									})
								}
							/>
							<TextInput
								label={chosen ? "Observação" : "Por que foi descartada"}
								value={alternative.notes}
								onChange={(value) =>
									edit((target) => {
										target.notes = value
									})
								}
							/>
						</Grid>

						<label htmlFor={`chosen-${alternative.id}`} className="flex items-center gap-2 text-sm">
							<input
								id={`chosen-${alternative.id}`}
								type="radio"
								name="chosen-alternative"
								className="accent-foreground"
								checked={chosen}
								onChange={() =>
									update((draft) => {
										draft.chosenAlternativeId = alternative.id
									})
								}
							/>
							Esta é a alternativa escolhida
						</label>
					</ListCard>
				)
			})}

			{demand.alternatives.length > 0 && fundamentals.length > 0 ? (
				<div className="overflow-x-auto border border-border">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-border border-b bg-muted/40">
								<th className="text-label px-3 py-2 font-medium text-muted-foreground">Alternativa</th>
								{fundamentals.map((objective) => (
									<th key={objective.id} className="text-label px-3 py-2 font-medium text-muted-foreground">
										{objective.text}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{demand.alternatives.map((alternative) => (
								<tr
									key={alternative.id}
									className={`border-border border-b last:border-b-0 ${demand.chosenAlternativeId === alternative.id ? "font-medium" : ""}`}
								>
									<td className="px-3 py-2">{alternative.name || "(sem nome)"}</td>
									{fundamentals.map((objective) => {
										const rating = alternative.ratings[objective.id]
										return (
											<td key={objective.id} className="px-3 py-2 text-muted-foreground">
												{rating ? RATING_LABEL[rating] : "—"}
											</td>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : null}

			<TextArea
				label="Por que a alternativa escolhida?"
				hint="Pelos objetivos: o que ela atende que as outras não atendem. Vai ao levantamento de mercado e à justificativa de viabilidade do ETP."
				value={demand.choiceRationale}
				onChange={(value) =>
					update((draft) => {
						draft.choiceRationale = value
					})
				}
				rows={3}
			/>
		</div>
	)
}
