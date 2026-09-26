/**
 * Editor da demanda: os passos da estruturação à esquerda, o passo aberto no centro e a
 * gravação automática.
 *
 * A demanda não tem versão (o histórico que importa é o das peças enviadas à ACI), então grava
 * sozinha a cada pausa na digitação, com o estado à vista no lugar de um botão Salvar. Dois
 * colegas da OM podem editar a mesma demanda: a gravação leva o `updated_at` lido, e o α
 * recusa com 409 se alguém gravou no meio. A tela para de gravar e oferece recarregar, em vez
 * de sobrescrever o trabalho do outro.
 */

import { checkDemand, DEMAND_STEP_LABEL, DEMAND_STEPS, type DemandPayload, type DemandStep } from "@iefa/alpha-client/demand"
import { ArrowLeft, ArrowRight, WarningTriangle } from "iconoir-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlphaRequestError } from "@/lib/alpha/client"
import { type DemandDetail, useSaveDemand } from "@/lib/alpha/demands"
import { CheckList } from "./fields"
import { ReviewStep } from "./review"
import { PlanningStep, RisksStep } from "./steps-risks"
import { ItemsStep, PricesStep, SolutionStep } from "./steps-solution"
import { AlternativesStep, ContextStep, ObjectivesStep } from "./steps-structure"

export const EDITOR_STEPS = [...DEMAND_STEPS, "documentos"] as const
export type EditorStep = (typeof EDITOR_STEPS)[number]

const STEP_LABEL: Record<EditorStep, string> = { ...DEMAND_STEP_LABEL, documentos: "Documentos e envio" }

type SaveState = "salvo" | "pendente" | "salvando" | "erro" | "conflito"

const SAVE_LABEL: Record<SaveState, string> = {
	salvo: "tudo gravado",
	pendente: "alterações a gravar",
	salvando: "gravando…",
	erro: "não gravou",
	conflito: "outra pessoa gravou",
}

/** Pausa na digitação antes de gravar. */
const SAVE_DELAY_MS = 1200

function useAutosave(detail: DemandDetail, draft: DemandPayload, title: string, version: number) {
	const save = useSaveDemand(detail.id)
	const [state, setState] = useState<SaveState>("salvo")
	const [error, setError] = useState<string | null>(null)
	const updatedAt = useRef(detail.updated_at)
	const savedVersion = useRef(0)
	const inFlight = useRef(false)
	// Depois de um 409 a tela para de gravar até recarregar: gravar de novo sobrescreveria o colega.
	const conflicted = useRef(false)
	const latest = useRef({ draft, title, version })
	latest.current = { draft, title, version }

	const flush = useCallback(async () => {
		if (inFlight.current || conflicted.current) return
		const { draft: payload, title: currentTitle, version: target } = latest.current
		if (target === savedVersion.current) return
		inFlight.current = true
		setState("salvando")
		try {
			const saved = await save.mutateAsync({ payload, title: currentTitle.trim() || undefined, expected_updated_at: updatedAt.current })
			updatedAt.current = saved.updated_at
			savedVersion.current = target
			setError(null)
			setState(latest.current.version === target ? "salvo" : "pendente")
		} catch (failure) {
			if (failure instanceof AlphaRequestError && failure.code === "DEMAND_CHANGED") {
				conflicted.current = true
				setState("conflito")
			} else {
				setState("erro")
				setError((failure as Error).message)
			}
		} finally {
			inFlight.current = false
		}
	}, [save])

	useEffect(() => {
		if (version === 0 || !detail.can_edit || detail.payload_invalid || conflicted.current) return
		setState((current) => (current === "salvando" ? current : "pendente"))
		const timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
		return () => clearTimeout(timer)
	}, [version, detail.can_edit, detail.payload_invalid, flush])

	// Terminou uma gravação e houve edição no meio: grava de novo.
	useEffect(() => {
		if (state === "pendente" && !inFlight.current && latest.current.version !== savedVersion.current) {
			const timer = setTimeout(() => void flush(), SAVE_DELAY_MS)
			return () => clearTimeout(timer)
		}
	}, [state, flush])

	useEffect(() => {
		const dirty = state === "pendente" || state === "salvando" || state === "erro"
		if (!dirty) return
		const warn = (event: BeforeUnloadEvent) => event.preventDefault()
		window.addEventListener("beforeunload", warn)
		return () => window.removeEventListener("beforeunload", warn)
	}, [state])

	return { state, error, retry: flush }
}

export function DemandEditor({
	detail,
	step,
	onStep,
	unitLabel,
	scopeId,
	onReload,
}: {
	detail: DemandDetail
	step: EditorStep
	onStep: (step: EditorStep) => void
	unitLabel: string
	scopeId: string
	onReload: () => void
}) {
	const [draft, setDraft] = useState<DemandPayload>(detail.payload)
	const [title, setTitle] = useState(detail.title)
	const [version, setVersion] = useState(0)
	const autosave = useAutosave(detail, draft, title, version)

	const update = useCallback((mutate: (draft: DemandPayload) => void) => {
		setDraft((current) => {
			const next = structuredClone(current)
			mutate(next)
			return next
		})
		setVersion((current) => current + 1)
	}, [])

	const checks = useMemo(() => checkDemand(draft), [draft])
	const counts = useMemo(() => {
		const map = new Map<EditorStep, { blocking: number; warning: number }>()
		for (const check of checks) {
			const entry = map.get(check.step) ?? { blocking: 0, warning: 0 }
			if (check.severity === "bloqueia") entry.blocking += 1
			else if (check.severity === "atencao") entry.warning += 1
			map.set(check.step, entry)
		}
		return map
	}, [checks])

	const index = EDITOR_STEPS.indexOf(step)
	const stepChecks = step === "documentos" ? [] : checks.filter((check) => check.step === step)
	const props = { demand: draft, update }
	const readOnly = !detail.can_edit

	return (
		<div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
			<aside className="lg:sticky lg:top-4 lg:self-start">
				<nav aria-label="Passos da demanda" className="border border-border">
					<ol>
						{EDITOR_STEPS.map((candidate, candidateIndex) => {
							const count = counts.get(candidate)
							const active = candidate === step
							return (
								<li key={candidate} className="border-border border-b last:border-b-0">
									<button
										type="button"
										onClick={() => onStep(candidate)}
										aria-current={active ? "step" : undefined}
										className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}
									>
										<span className="w-5 shrink-0 text-xs tabular-nums opacity-70">{candidateIndex + 1}</span>
										<span className="min-w-0 flex-1">{STEP_LABEL[candidate]}</span>
										{count?.blocking ? (
											<span className="text-xs tabular-nums" title={`${count.blocking} bloqueiam o envio`}>
												● {count.blocking}
											</span>
										) : count?.warning ? (
											<span className="text-xs tabular-nums opacity-70" title={`${count.warning} pedem atenção`}>
												○ {count.warning}
											</span>
										) : null}
									</button>
								</li>
							)
						})}
					</ol>
				</nav>

				<div className="mt-3 space-y-2 text-xs" aria-live="polite">
					{readOnly ? (
						<p className="text-muted-foreground">Só leitura: quem edita é o autor e o requisitante da OM.</p>
					) : (
						<p className={autosave.state === "erro" || autosave.state === "conflito" ? "font-medium" : "text-muted-foreground"}>{SAVE_LABEL[autosave.state]}</p>
					)}
					{autosave.state === "erro" ? (
						<div className="space-y-1">
							<p className="text-muted-foreground">{autosave.error}</p>
							<Button size="xs" variant="outline" onClick={() => void autosave.retry()}>
								tentar de novo
							</Button>
						</div>
					) : null}
					{autosave.state === "conflito" ? (
						<div className="space-y-1">
							<p className="text-muted-foreground">
								Um colega gravou esta demanda enquanto você editava. Recarregue para ver a versão dele; o que você mudou desde então se perde.
							</p>
							<Button size="xs" variant="outline" onClick={onReload}>
								recarregar
							</Button>
						</div>
					) : null}
					<p className="text-muted-foreground">● bloqueia o envio · ○ pede atenção</p>
				</div>
			</aside>

			<div className="min-w-0">
				{detail.payload_invalid ? (
					<p className="mb-6 flex items-start gap-2 border border-border p-3 text-sm">
						<WarningTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />O rascunho gravado não pôde ser lido nesta versão do contrate e abriu
						vazio. Não edite antes de falar com o suporte: gravar agora substituiria o rascunho.
					</p>
				) : null}

				{stepChecks.length > 0 ? (
					<div className="mb-6">
						<CheckList checks={stepChecks} />
					</div>
				) : null}

				<fieldset disabled={readOnly} className="min-w-0">
					{step === "contexto" ? (
						<ContextStep
							{...props}
							title={title}
							onTitle={(value) => {
								setTitle(value)
								setVersion((current) => current + 1)
							}}
						/>
					) : null}
					{step === "objetivos" ? <ObjectivesStep {...props} /> : null}
					{step === "alternativas" ? <AlternativesStep {...props} /> : null}
					{step === "solucao" ? <SolutionStep {...props} /> : null}
					{step === "itens" ? <ItemsStep {...props} /> : null}
					{step === "precos" ? <PricesStep {...props} /> : null}
					{step === "riscos" ? <RisksStep {...props} /> : null}
					{step === "planejamento" ? <PlanningStep {...props} /> : null}
				</fieldset>
				{step === "documentos" ? (
					<ReviewStep
						demand={draft}
						detail={detail}
						title={title}
						unitLabel={unitLabel}
						scopeId={scopeId}
						isSaved={autosave.state === "salvo" && !detail.payload_invalid}
						onGoto={(target: DemandStep) => onStep(target)}
					/>
				) : null}

				<div className="mt-10 flex items-center justify-between border-border border-t pt-4">
					{index > 0 ? (
						<Button variant="outline" onClick={() => onStep(EDITOR_STEPS[index - 1] as EditorStep)}>
							<ArrowLeft />
							{STEP_LABEL[EDITOR_STEPS[index - 1] as EditorStep]}
						</Button>
					) : (
						<span />
					)}
					{index < EDITOR_STEPS.length - 1 ? (
						<Button onClick={() => onStep(EDITOR_STEPS[index + 1] as EditorStep)}>
							{STEP_LABEL[EDITOR_STEPS[index + 1] as EditorStep]}
							<ArrowRight />
						</Button>
					) : null}
				</div>
			</div>
		</div>
	)
}
