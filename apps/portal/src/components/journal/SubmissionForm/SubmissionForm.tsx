// Main submission form container with step navigation
// Manages form state across all 6 steps

import { Button } from "@iefa/ui"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { saveDraft } from "@/lib/journal/submission"
import type { ArticleTypeFormData, AuthorsFormData } from "@/lib/journal/validation"
import { validateStep } from "@/lib/journal/validation"

// Import step components (will create these next)
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
	// Step 4
	pdf_file?: File
	source_file?: File
	supplementary_files?: File[]
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
	articleId?: string
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
	onSubmit: (data: SubmissionFormData) => Promise<void>
}

export function SubmissionForm({
	userId,
	initialData = {},
	articleId,
	onSubmit,
}: SubmissionFormProps) {
	const [currentStep, setCurrentStep] = useState(1)
	const [formData, setFormData] = useState<SubmissionFormData>(initialData)
	const [validationError, setValidationError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [lastSaved, setLastSaved] = useState<Date | null>(null)

	const updateFormData = (data: Partial<SubmissionFormData>) => {
		setFormData((prev) => ({ ...prev, ...data }))
		setValidationError(null)
	}

	const handleSaveDraft = useCallback(async () => {
		setIsSaving(true)
		try {
			await saveDraft(formData, userId, articleId)
			setLastSaved(new Date())
		} catch (error) {
			console.error("Failed to save draft:", error)
		} finally {
			setIsSaving(false)
		}
	}, [formData, userId, articleId])

	// Auto-save draft every 2 minutes
	useEffect(() => {
		const interval = setInterval(
			async () => {
				if (currentStep < 6 && Object.keys(formData).length > 0) {
					await handleSaveDraft()
				}
			},
			2 * 60 * 1000
		) // 2 minutes

		return () => clearInterval(interval)
	}, [formData, currentStep, handleSaveDraft])

	const handleNext = () => {
		// Validate current step before proceeding
		const validation = validateStep(currentStep, formData)
		if (!validation.success) {
			setValidationError(validation.error || "Validação falhou")
			return
		}

		setValidationError(null)
		setCurrentStep((prev) => Math.min(prev + 1, STEPS.length))
	}

	const handleBack = () => {
		setValidationError(null)
		setCurrentStep((prev) => Math.max(prev - 1, 1))
	}

	const handleSubmit = async () => {
		setValidationError(null)
		await onSubmit(formData)
	}

	const CurrentStepComponent = STEPS[currentStep - 1].component

	return (
		<SubmissionFormContext.Provider
			value={{
				formData,
				updateFormData,
				currentStep,
				setCurrentStep,
				articleId,
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
										className={`size-10 rounded-full flex items-center justify-center font-medium transition-colors ${
											currentStep > step.number
												? "bg-primary text-primary-foreground"
												: currentStep === step.number
													? "bg-primary text-primary-foreground ring-4 ring-primary/20"
													: "bg-muted text-muted-foreground"
										}`}
									>
										{currentStep > step.number ? <Check className="size-5" /> : step.number}
									</div>
									<span
										className={`mt-2 text-xs font-medium hidden sm:block ${
											currentStep === step.number ? "text-foreground" : "text-muted-foreground"
										}`}
									>
										{step.title}
									</span>
								</div>
								{index < STEPS.length - 1 && (
									<div
										className={`h-1 flex-1 mx-2 rounded transition-colors ${
											currentStep > step.number ? "bg-primary" : "bg-muted"
										}`}
									/>
								)}
							</div>
						))}
					</div>

					{lastSaved && (
						<p className="text-xs text-muted-foreground text-center">
							{isSaving
								? "Salvando rascunho..."
								: `Último salvamento: ${lastSaved.toLocaleTimeString()}`}
						</p>
					)}
				</div>

				{/* Current Step */}
				<div className="bg-card border rounded-lg p-6 min-h-[500px]">
					<h2 className="text-2xl font-bold mb-6">{STEPS[currentStep - 1].title}</h2>

					{validationError && (
						<div className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-lg">
							<p className="text-sm text-destructive font-medium">{validationError}</p>
						</div>
					)}

					<CurrentStepComponent />
				</div>

				{/* Navigation */}
				<div className="mt-6 flex items-center justify-between">
					<Button type="button" variant="outline" onClick={handleBack} disabled={currentStep === 1}>
						<ChevronLeft className="size-4 mr-2" />
						Voltar
					</Button>

					<div className="flex gap-3">
						<Button type="button" variant="outline" onClick={handleSaveDraft}>
							Salvar Rascunho
						</Button>

						{currentStep < STEPS.length ? (
							<Button type="button" onClick={handleNext}>
								Próximo
								<ChevronRight className="size-4 ml-2" />
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
