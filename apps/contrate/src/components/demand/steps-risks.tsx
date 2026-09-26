/**
 * Riscos e planejamento: o mapa curto e específico, e os dados do processo e da equipe que as
 * peças citam.
 */

import { newId, RISK_PHASES, type RiskPhase, TEAM_ROLES, type TeamRole } from "@iefa/alpha-client/demand"
import { AddButton, Choice, Grid, ListCard, StepIntro, TextArea, TextInput } from "./fields"
import type { StepProps } from "./steps-structure"

const PHASE_LABEL: Record<RiskPhase, string> = {
	planejamento: "Planejamento da Contratação",
	selecao: "Seleção do Fornecedor",
	gestao: "Gestão do Contrato",
}

const PROBABILITY_OPTIONS = [
	{ value: "1", label: "1 · Rara: conjunção improvável de fatores" },
	{ value: "2", label: "2 · Improvável: já há controle previsto no TR" },
	{ value: "3", label: "3 · Possível: depende de providência pendente ou de terceiro" },
	{ value: "4", label: "4 · Provável: já ocorreu em contratação semelhante" },
	{ value: "5", label: "5 · Quase certa: não é risco, é premissa" },
] as const

const IMPACT_OPTIONS = [
	{ value: "1", label: "1 · Insignificante: ajuste sem custo nem atraso" },
	{ value: "2", label: "2 · Menor: atraso curto ou custo absorvível" },
	{ value: "3", label: "3 · Moderado: refazimento parcial ou atraso relevante" },
	{ value: "4", label: "4 · Maior: compromete o objetivo da contratação" },
	{ value: "5", label: "5 · Crítico: dano irreversível a pessoa ou a bem de valor" },
] as const

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
	requisitante: "Área requisitante",
	tecnica: "Área técnica",
	planejamento: "Equipe de planejamento",
	fiscal: "Fiscal do contrato",
	gestor: "Gestor do contrato",
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Riscos
// ─────────────────────────────────────────────────────────────────────────────

export function RisksStep({ demand, update }: StepProps) {
	return (
		<div className="space-y-6">
			<StepIntro title="O que pode dar errado?">
				<p>
					Poucos riscos, cada um nascido do objeto, do local ou de uma decisão desta contratação: normalmente de 3 a 6. Antes de registrar, faça as perguntas: o
					evento pode ou não ocorrer? Trocando o objeto, o texto continuaria servindo? Há quem possa agir sobre a causa? Risco genérico (atraso, habilitação,
					dispensa deserta) já é tratado por cláusula do TR e sai do mapa.
				</p>
				<p>
					Aloque a quem controla a causa (art. 103, § 1º). A ação preventiva tem verbo, momento e evidência; a de contingência tem gatilho, ação, prazo e
					consequência. O responsável vai no campo próprio, como papel.
				</p>
			</StepIntro>

			<AddButton
				onClick={() =>
					update((draft) => {
						draft.risks.push({
							id: newId("risco"),
							risk: "",
							cause: "",
							phase: "gestao",
							probability: null,
							impact: null,
							allocatedTo: "contratada",
							allocationDetail: "",
							damage: "",
							preventiveAction: "",
							preventiveOwner: "",
							contingencyAction: "",
							contingencyOwner: "",
						})
					})
				}
			>
				risco
			</AddButton>

			{demand.risks.map((risk, index) => {
				const edit = (mutate: (target: typeof risk) => void) =>
					update((draft) => {
						const target = draft.risks.find((candidate) => candidate.id === risk.id)
						if (target) mutate(target)
					})
				const level = risk.probability && risk.impact ? risk.probability * risk.impact : null
				return (
					<ListCard
						key={risk.id}
						title={risk.risk.trim() || `Risco ${index + 1}`}
						badge={level !== null ? <span className="text-label tabular-nums">nível {level}</span> : null}
						onRemove={() =>
							update((draft) => {
								draft.risks = draft.risks.filter((candidate) => candidate.id !== risk.id)
							})
						}
					>
						<TextArea
							label="Risco"
							hint="Evento + onde ou em quê + consequência. Evite “falta de” e “problemas com”."
							value={risk.risk}
							onChange={(value) =>
								edit((target) => {
									target.risk = value
								})
							}
							rows={2}
						/>
						<TextArea
							label="Causa"
							hint="De 2 a 4 mecanismos concretos, nomeando componente, local ou etapa."
							value={risk.cause}
							onChange={(value) =>
								edit((target) => {
									target.cause = value
								})
							}
							rows={2}
						/>
						<Grid cols={3}>
							<Choice
								label="Fase"
								value={risk.phase}
								options={RISK_PHASES.map((phase) => ({ value: phase, label: PHASE_LABEL[phase] }))}
								onChange={(value) =>
									edit((target) => {
										target.phase = value
									})
								}
							/>
							<Choice
								label="Probabilidade"
								value={risk.probability === null ? null : (String(risk.probability) as (typeof PROBABILITY_OPTIONS)[number]["value"])}
								options={PROBABILITY_OPTIONS}
								onChange={(value) =>
									edit((target) => {
										target.probability = Number(value)
									})
								}
							/>
							<Choice
								label="Impacto"
								value={risk.impact === null ? null : (String(risk.impact) as (typeof IMPACT_OPTIONS)[number]["value"])}
								options={IMPACT_OPTIONS}
								onChange={(value) =>
									edit((target) => {
										target.impact = Number(value)
									})
								}
							/>
						</Grid>
						<Grid>
							<Choice
								label="Alocado para"
								value={risk.allocatedTo}
								options={[
									{ value: "contratada", label: "Contratada" },
									{ value: "administracao", label: "Administração" },
								]}
								onChange={(value) =>
									edit((target) => {
										target.allocatedTo = value
									})
								}
							/>
							<TextArea
								label="Impactos (dano)"
								value={risk.damage}
								onChange={(value) =>
									edit((target) => {
										target.damage = value
									})
								}
								rows={2}
							/>
						</Grid>
						<TextArea
							label="Detalhamento da alocação"
							hint="Por que cabe a essa parte, a consequência contratual e a fronteira com o risco vizinho."
							value={risk.allocationDetail}
							onChange={(value) =>
								edit((target) => {
									target.allocationDetail = value
								})
							}
							rows={2}
						/>
						<Grid>
							<TextArea
								label="Ação preventiva"
								value={risk.preventiveAction}
								onChange={(value) =>
									edit((target) => {
										target.preventiveAction = value
									})
								}
								rows={2}
							/>
							<TextInput
								label="Responsável pela preventiva"
								value={risk.preventiveOwner}
								onChange={(value) =>
									edit((target) => {
										target.preventiveOwner = value
									})
								}
								placeholder="Fiscal do contrato"
							/>
							<TextArea
								label="Ação de contingência"
								value={risk.contingencyAction}
								onChange={(value) =>
									edit((target) => {
										target.contingencyAction = value
									})
								}
								rows={2}
							/>
							<TextInput
								label="Responsável pela contingência"
								value={risk.contingencyOwner}
								onChange={(value) =>
									edit((target) => {
										target.contingencyOwner = value
									})
								}
								placeholder="Gestor do contrato"
							/>
						</Grid>
					</ListCard>
				)
			})}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Planejamento e equipe
// ─────────────────────────────────────────────────────────────────────────────

export function PlanningStep({ demand, update }: StepProps) {
	const { planning } = demand
	return (
		<div className="space-y-6">
			<StepIntro title="Dados do processo e equipe">
				<p>
					O que as peças citam e ainda não existe (NUP, número do DFD, identificador no PCA) pode ficar para depois: sai como [PREENCHER] e o guia aponta. A
					equipe precisa ter ao menos a área requisitante e a área técnica (IN SEGES nº 58/2022, art. 8º).
				</p>
				<p>O CPF dos responsáveis não é guardado aqui. O Compras.gov.br o pede no cadastro: tenha-o em mãos.</p>
			</StepIntro>

			<Grid cols={4}>
				<TextInput
					label="NUP"
					value={planning.nup}
					onChange={(value) =>
						update((draft) => {
							draft.planning.nup = value
						})
					}
				/>
				<TextInput
					label="UASG"
					value={planning.uasg}
					onChange={(value) =>
						update((draft) => {
							draft.planning.uasg = value.replace(/\D/g, "").slice(0, 6)
						})
					}
					placeholder="120016"
				/>
				<TextInput
					label="Nº do DFD"
					value={planning.dfdNumber}
					onChange={(value) =>
						update((draft) => {
							draft.planning.dfdNumber = value
						})
					}
					placeholder="1076/2026"
				/>
				<TextInput
					label="Identificador no PCA"
					value={planning.pcaId}
					onChange={(value) =>
						update((draft) => {
							draft.planning.pcaId = value
						})
					}
				/>
			</Grid>

			<section className="space-y-3">
				<h3 className="font-semibold text-lg tracking-tight">Dotação</h3>
				<Grid cols={4}>
					<TextInput
						label="Fonte"
						value={planning.budget.source}
						onChange={(value) =>
							update((draft) => {
								draft.planning.budget.source = value
							})
						}
					/>
					<TextInput
						label="PTRES"
						value={planning.budget.ptres}
						onChange={(value) =>
							update((draft) => {
								draft.planning.budget.ptres = value
							})
						}
					/>
					<TextInput
						label="PI"
						value={planning.budget.pi}
						onChange={(value) =>
							update((draft) => {
								draft.planning.budget.pi = value
							})
						}
					/>
					<TextInput
						label="Ação"
						value={planning.budget.action}
						onChange={(value) =>
							update((draft) => {
								draft.planning.budget.action = value
							})
						}
					/>
				</Grid>
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-lg tracking-tight">Equipe</h3>
					<AddButton onClick={() => update((draft) => void draft.planning.team.push({ id: newId("pessoa"), name: "", position: "", role: "requisitante" }))}>
						integrante
					</AddButton>
				</div>
				{planning.team.map((member, index) => {
					const edit = (mutate: (target: typeof member) => void) =>
						update((draft) => {
							const target = draft.planning.team.find((candidate) => candidate.id === member.id)
							if (target) mutate(target)
						})
					return (
						<ListCard
							key={member.id}
							title={member.name.trim() || `Integrante ${index + 1}`}
							onRemove={() =>
								update((draft) => {
									draft.planning.team = draft.planning.team.filter((candidate) => candidate.id !== member.id)
								})
							}
						>
							<Grid cols={3}>
								<TextInput
									label="Nome"
									value={member.name}
									onChange={(value) =>
										edit((target) => {
											target.name = value
										})
									}
								/>
								<TextInput
									label="Cargo ou posto"
									value={member.position}
									onChange={(value) =>
										edit((target) => {
											target.position = value
										})
									}
								/>
								<Choice
									label="Papel"
									value={member.role}
									options={TEAM_ROLES.map((role) => ({ value: role, label: TEAM_ROLE_LABEL[role] }))}
									onChange={(value) =>
										edit((target) => {
											target.role = value
										})
									}
								/>
							</Grid>
						</ListCard>
					)
				})}
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-lg tracking-tight">Contratações correlatas ou interdependentes</h3>
					<AddButton onClick={() => update((draft) => void draft.planning.related.push({ id: newId("rel"), description: "", relation: "interdependente" }))}>
						contratação
					</AddButton>
				</div>
				<p className="text-muted-foreground text-xs">
					Só contratação de fato (existente ou prevista). Operação do usuário e infraestrutura que já existe não entram.
				</p>
				{planning.related.map((entry, index) => {
					const edit = (mutate: (target: typeof entry) => void) =>
						update((draft) => {
							const target = draft.planning.related.find((candidate) => candidate.id === entry.id)
							if (target) mutate(target)
						})
					return (
						<ListCard
							key={entry.id}
							title={entry.description.trim() || `Contratação ${index + 1}`}
							onRemove={() =>
								update((draft) => {
									draft.planning.related = draft.planning.related.filter((candidate) => candidate.id !== entry.id)
								})
							}
						>
							<Grid>
								<TextInput
									label="Contratação"
									value={entry.description}
									onChange={(value) =>
										edit((target) => {
											target.description = value
										})
									}
								/>
								<Choice
									label="Relação"
									value={entry.relation}
									options={[
										{ value: "correlata", label: "Correlata" },
										{ value: "interdependente", label: "Interdependente" },
									]}
									onChange={(value) =>
										edit((target) => {
											target.relation = value
										})
									}
								/>
							</Grid>
						</ListCard>
					)
				})}
			</section>

			<section className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<h3 className="font-semibold text-lg tracking-tight">Providências antes da contratação</h3>
					<AddButton onClick={() => update((draft) => void draft.planning.priorActions.push({ id: newId("prov"), action: "", owner: "", precedes: "" }))}>
						providência
					</AddButton>
				</div>
				{planning.priorActions.map((entry, index) => {
					const edit = (mutate: (target: typeof entry) => void) =>
						update((draft) => {
							const target = draft.planning.priorActions.find((candidate) => candidate.id === entry.id)
							if (target) mutate(target)
						})
					return (
						<ListCard
							key={entry.id}
							title={entry.action.trim() || `Providência ${index + 1}`}
							onRemove={() =>
								update((draft) => {
									draft.planning.priorActions = draft.planning.priorActions.filter((candidate) => candidate.id !== entry.id)
								})
							}
						>
							<Grid cols={3}>
								<TextInput
									label="Providência"
									value={entry.action}
									onChange={(value) =>
										edit((target) => {
											target.action = value
										})
									}
								/>
								<TextInput
									label="Responsável"
									value={entry.owner}
									onChange={(value) =>
										edit((target) => {
											target.owner = value
										})
									}
								/>
								<TextInput
									label="Precede"
									value={entry.precedes}
									onChange={(value) =>
										edit((target) => {
											target.precedes = value
										})
									}
									placeholder="a ordem de fornecimento"
								/>
							</Grid>
						</ListCard>
					)
				})}
			</section>

			<TextArea
				label="Impactos ambientais"
				hint="Só os do objeto, com as medidas de mitigação (descarte, embalagens, eficiência)."
				value={planning.environmentalImpacts}
				onChange={(value) =>
					update((draft) => {
						draft.planning.environmentalImpacts = value
					})
				}
				rows={3}
			/>
		</div>
	)
}
