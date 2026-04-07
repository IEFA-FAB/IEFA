import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type AtaStep = 1 | 2 | 3

interface StepDef {
	number: AtaStep
	label: string
}

const STEPS: StepDef[] = [
	{ number: 1, label: "Cardápios Semanais" },
	{ number: 2, label: "Eventos" },
	{ number: 3, label: "Resumo" },
]

interface AtaStepIndicatorProps {
	currentStep: AtaStep
}

export function AtaStepIndicator({ currentStep }: AtaStepIndicatorProps) {
	return (
		<nav aria-label="Etapas da ATA" className="flex items-center gap-0">
			{STEPS.map((step, index) => {
				const isCompleted = step.number < currentStep
				const isActive = step.number === currentStep

				return (
					<div key={step.number} className="flex items-center">
						<div className="flex items-center gap-2">
							<div
								className={cn(
									"flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
									isCompleted && "border-primary bg-primary text-primary-foreground",
									isActive && "border-primary bg-background text-primary",
									!isCompleted && !isActive && "border-muted-foreground/30 text-muted-foreground"
								)}
								aria-current={isActive ? "step" : undefined}
							>
								{isCompleted ? <Check className="h-4 w-4" aria-hidden="true" /> : <span>{step.number}</span>}
							</div>
							<span
								className={cn(
									"text-sm font-medium hidden sm:inline",
									isActive && "text-primary",
									isCompleted && "text-foreground",
									!isCompleted && !isActive && "text-muted-foreground"
								)}
							>
								{step.label}
							</span>
						</div>
						{index < STEPS.length - 1 && (
							<div className={cn("mx-3 h-px w-8 sm:w-12", currentStep > step.number ? "bg-primary" : "bg-muted-foreground/30")} aria-hidden="true" />
						)}
					</div>
				)
			})}
		</nav>
	)
}
