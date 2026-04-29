// Main submission form container with step navigation
// Manages form state across all 6 steps

import { Check, NavArrowLeft, NavArrowRight, Refresh } from "iconoir-react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
// currentStep lives in the URL (?step=N) — passed down as props from the route
import { Button } from "@/components/ui/button"
import type { ArticleTypeFormData, AuthorsFormData } from "@/lib/journal/validation"
import { validateStep } from "@/lib/journal/validation"
import { saveDraftFn } from "@/server/journal.fn"
import { Step1ArticleType } from "./Step1ArticleType"
import { Step2Metadata } from "./Step2Metadata"
import { Step3Authors } from "./Step3Authors"
import { Step4FileUpload } from "./Step4FileUpload"
import { Step5Declarations } from "./Step5Declarations"
import { Step6Review } from "./Step6Review"

export interface SubmissionFormData {
	// Step 1
	article_type?: ArticleTypeFormData["article_type"]
	subject_area?: string
	// Step 2
	title_pt?: string
	title_en?: string
	abstract_pt?: string
	abstract_en?: string
	keywords_pt?: string[]
	keywords_en?: string[]
	// Step 3
	authors?: AuthorsFormData["authors"]
	// Step 4 — storage paths (files uploaded at step 4, not at submit time)
	pdf_path?: string
	source_path?: string
	supplementary_paths?: string[]
	// Step 5
	conflict_of_interest?: string
	funding_info?: string
	data_availability?: string
	has_ethics_approval?: boolean
	ethics_approval?: string
}

interface SubmissionFormContextValue {
	formData: SubmissionFormData
	updateFormData: (data: Partial<SubmissionFormData>) => void
	currentStep: number
	setCurrentStep: (step: number) => void
	/** Tracks the live article ID — updated when a new draft is first created */
	currentArticleId: string | undefined
	setCurrentArticleId: (id: string) => void
	userId: string
	/** First error message per field path ("abstract_pt", "authors.0.full_name", …) */
	fieldErrors: Record<string, string>
}

const SubmissionFormContext = createContext<SubmissionFormContextValue | null>(null)

export function useSubmissionForm() {
	const context = useContext(SubmissionFormContext)
	if (!context) {
		throw new Error("useSubmissionForm must be used within SubmissionFormProvider")
	}
	return context
}

const STEPS = [
	{ number: 1, title: "Tipo de Artigo", component: Step1ArticleType },
	{ number: 2, title: "Metadados", component: Step2Metadata },
	{ number: 3, title: "Autores", component: Step3Authors },
	{ number: 4, title: "Arquivos", component: Step4FileUpload },
	{ number: 5, title: "Declarações", component: Step5Declarations },
	{ number: 6, title: "Revisão", component: Step6Review },
]

interface SubmissionFormProps {
	userId: string
	initialData?: SubmissionFormData
	articleId?: string
	step: number
	onStepChange: (step: number) => void
	/** Called with formData + the current articleId when the user clicks "Submeter Artigo" */
	onSubmit: (data: SubmissionFormData, articleId: string) => Promise<void>
}

export function SubmissionForm({ userId, initialData = {}, articleId, step: currentStep, onStepChange: setCurrentStep, onSubmit }: SubmissionFormProps) {
	const [formData, setFormData] = useState<SubmissionFormData>(initialData)
	const [currentArticleId, setCurrentArticleId] = useState<string | undefined>(articleId)
	const [validationError, setValidationError] = useState<string | null>(null)
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
	const [isSaving, setIsSaving] = useState(false)
	const [lastSaved, setLastSaved] = useState<Date | null>(null)

	const updateFormData = (data: Partial<SubmissionFormData>) => {
		setFormData((prev) => ({ ...prev, ...data }))
		// Clear errors for any fields being updated
		const changed = Object.keys(data)
		if (changed.length > 0) {
			setFieldErrors((prev) => {
				const next = { ...prev }
				for (const key of changed) {
					for (const errKey of Object.keys(next)) {
						if (errKey === key || errKey.startsWith(`${key}.`)) {
							delete next[errKey]
						}
					}
				}
				return next
			})
		}
		setValidationError(null)
	}

	const handleSaveDraft = useCallback(async () => {
		setIsSaving(true)
		try {
			const result = await saveDraftFn({
				data: {
					userId,
					articleId: currentArticleId,
					article_type: formData.article_type,
					subject_area: formData.subject_area,
					title_pt: formData.title_pt,
					title_en: formData.title_en,
					abstract_pt: formData.abstract_pt,
					abstract_en: formData.abstract_en,
					keywords_pt: formData.keywords_pt,
					keywords_en: formData.keywords_en,
					conflict_of_interest: formData.conflict_of_interest,
					funding_info: formData.funding_info,
					data_availability: formData.data_availability,
					ethics_approval: formData.ethics_approval,
					authors: formData.authors,
				},
			})
			// Update currentArticleId if this was the first draft creation
			if (!currentArticleId) {
				setCurrentArticleId(result.articleId)
			}
			setLastSaved(new Date())
		} catch (_error) {
			// Silent — auto-save failures should not disrupt the user
		} finally {
			setIsSaving(false)
		}
	}, [formData, userId, currentArticleId])

	// Auto-save draft every 2 minutes
	useEffect(() => {
		const interval = setInterval(
			async () => {
				if (currentStep < 6 && Object.keys(formData).length > 0) {
					await handleSaveDraft()
				}
			},
			2 * 60 * 1000
		)

		return () => clearInterval(interval)
	}, [formData, currentStep, handleSaveDraft])

	const handleNext = () => {
		const validation = validateStep(currentStep, formData)
		if (!validation.success) {
			setValidationError(validation.error || "Corrija os erros indicados nos campos abaixo")
			setFieldErrors(validation.fieldErrors ?? {})
			return
		}

		setValidationError(null)
		setFieldErrors({})
		setCurrentStep(Math.min(currentStep + 1, STEPS.length))
	}

	const handleBack = () => {
		setValidationError(null)
		setFieldErrors({})
		setCurrentStep(Math.max(currentStep - 1, 1))
	}

	const handleSubmit = async () => {
		if (!currentArticleId) {
			setValidationError("Salve o rascunho antes de submeter")
			return
		}
		setValidationError(null)
		await onSubmit(formData, currentArticleId)
	}

	const CurrentStepComponent = STEPS[currentStep - 1].component

	return (
		<SubmissionFormContext.Provider
			value={{
				formData,
				updateFormData,
				currentStep,
				setCurrentStep,
				currentArticleId,
				setCurrentArticleId,
				userId,
				fieldErrors,
			}}
		>
			<div className="max-w-4xl mx-auto">
				{/* Progress Indicator */}
				<div className="mb-8">
					<div className="flex items-center justify-between mb-4">
						{STEPS.map((step, index) => (
							<div key={step.number} className="flex items-center flex-1">
								<div className="flex flex-col items-center">
									<div
										className={`size-10 flex items-center justify-center font-medium transition-colors border-2 ${
											currentStep > step.number
												? "bg-primary text-primary-foreground border-primary"
												: currentStep === step.number
													? "bg-primary text-primary-foreground border-primary"
													: "bg-transparent text-muted-foreground border-muted-foreground/30"
										}`}
									>
										{currentStep > step.number ? <Check className="size-5" /> : step.number}
									</div>
									<span className={`mt-2 text-xs font-medium hidden sm:block ${currentStep === step.number ? "text-foreground" : "text-muted-foreground"}`}>
										{step.title}
									</span>
								</div>
								{index < STEPS.length - 1 && (
									<div className={`h-px flex-1 mx-2 transition-colors ${currentStep > step.number ? "bg-primary" : "bg-border"}`} />
								)}
							</div>
						))}
					</div>
				</div>

				{/* Current Step */}
				<div className="bg-card border p-6 min-h-[500px]">
					<h2 className="text-2xl font-bold mb-6">{STEPS[currentStep - 1].title}</h2>

					{validationError && (
						<div className="mb-6 p-4 bg-destructive/10 border border-destructive">
							<p className="text-sm text-destructive font-medium">{validationError}</p>
						</div>
					)}

					<CurrentStepComponent />
				</div>

				{/* Navigation */}
				<div className="mt-6 flex items-center justify-between">
					<Button type="button" variant="outline" onClick={handleBack} disabled={currentStep === 1}>
						<NavArrowLeft className="size-4 mr-2" />
						Voltar
					</Button>

					<div className="flex gap-3 items-end">
						<div className="flex flex-col items-end gap-1.5">
							<Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
								{isSaving && <Refresh className="size-4 mr-2 animate-spin" />}
								{isSaving ? "Salvando..." : "Salvar Rascunho"}
							</Button>
							<span className={`flex items-center gap-1 text-xs text-muted-foreground ${lastSaved ? "" : "invisible"}`}>
								<Check className="size-3" />
								{lastSaved ? `Salvo às ${lastSaved.toLocaleTimeString()}` : "‌"}
							</span>
						</div>

						{currentStep < STEPS.length ? (
							<Button type="button" onClick={handleNext}>
								Próximo
								<NavArrowRight className="size-4 ml-2" />
							</Button>
						) : (
							<Button type="button" onClick={handleSubmit}>
								Submeter Artigo
							</Button>
						)}
					</div>
				</div>
			</div>
		</SubmissionFormContext.Provider>
	)
}
