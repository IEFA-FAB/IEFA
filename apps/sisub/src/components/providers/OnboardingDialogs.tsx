/**
 * OnboardingDialogs
 *
 * Encapsula os dois diálogos de onboarding exibidos no layout _protected:
 *  1. SaramDialog  — coleta o Número de Ordem do usuário (obrigatório no 1º acesso)
 *  2. EvaluationDialog — pergunta de avaliação configurada pela SDAB
 *
 * Motivo da separação: o layout _protected/route.tsx é responsável apenas por
 * autenticação e fundo visual. A lógica de onboarding tem responsabilidade própria.
 */
import { useCallback, useState } from "react"
import { EvaluationDialog } from "@/components/features/messhall/EvaluationDialog"
import { SaramDialog } from "@/components/features/messhall/SaramDialog"
import { useAuth } from "@/hooks/auth/useAuth"
import { useUpdateNrOrdem, useUserNrOrdem } from "@/hooks/business/useUserNrOrdem"
import { useEvaluation, useSubmitEvaluation } from "@/hooks/data/useEvaluation"

const NR_ORDEM_MIN_LEN = 7

export function OnboardingDialogs() {
	const { user } = useAuth()
	const userId = user?.id ?? null

	const nrOrdemQuery = useUserNrOrdem(userId)
	const evaluationQuery = useEvaluation(userId)

	/* ------------------------------------------------------------------
	   NrOrdem Dialog
	   ------------------------------------------------------------------ */
	const serverNrOrdem = !userId ? "" : nrOrdemQuery.data ? String(nrOrdemQuery.data) : ""
	const [nrDialogOpenState, setNrDialogOpenState] = useState(false)
	const [nrOrdem, setNrOrdem] = useState(serverNrOrdem)
	const [nrError, setNrError] = useState<string | null>(null)
	const [prevServerNrOrdem, setPrevServerNrOrdem] = useState(serverNrOrdem)

	if (prevServerNrOrdem !== serverNrOrdem) {
		setPrevServerNrOrdem(serverNrOrdem)
		setNrOrdem(serverNrOrdem)
	}

	const shouldForceNrDialog = !!userId && nrOrdemQuery.isSuccess && !nrOrdemQuery.data
	const nrDialogOpen = !!userId && (shouldForceNrDialog || nrDialogOpenState)

	const saveNrMutation = useUpdateNrOrdem()

	const [prevSaveStatus, setPrevSaveStatus] = useState(saveNrMutation.status)
	if (prevSaveStatus !== saveNrMutation.status) {
		setPrevSaveStatus(saveNrMutation.status)
		if (saveNrMutation.isError) {
			setNrError("Não foi possível salvar. Tente novamente.")
		} else if (saveNrMutation.isSuccess) {
			setNrDialogOpenState(false)
		}
	}

	const handleNrDialogOpenChange = (open: boolean) => {
		if (!open && shouldForceNrDialog) return
		setNrDialogOpenState(open)
	}

	const handleNrOrdemChange = (value: string) => {
		setNrOrdem(value)
		if (nrError) setNrError(null)
	}

	const handleSubmitNrOrdem = () => {
		const digitsOnly = nrOrdem.replace(/\D/g, "").trim()
		if (!digitsOnly) {
			setNrError("Informe seu número de Ordem.")
			return
		}
		if (digitsOnly.length < NR_ORDEM_MIN_LEN) {
			setNrError("Nr. de Ordem parece curto. Confira e tente novamente.")
			return
		}
		if (!user) return
		saveNrMutation.mutate({ user, nrOrdem: digitsOnly })
	}

	/* ------------------------------------------------------------------
	   Evaluation Dialog
	   ------------------------------------------------------------------ */
	const [evaluationDismissed, setEvaluationDismissed] = useState(false)
	const [selectedRating, setSelectedRating] = useState<number | null>(null)

	const evaluationQuestion = evaluationQuery.data?.question ?? null
	const evaluationShouldAsk = Boolean(evaluationQuery.data?.shouldAsk && evaluationQuestion)

	const shouldShowEvaluationDialog = !!userId && evaluationQuery.isSuccess && evaluationShouldAsk && !nrDialogOpen && !evaluationDismissed

	const handleEvaluationOpenChange = useCallback((open: boolean) => {
		if (!open) {
			setEvaluationDismissed(true)
			setSelectedRating(null)
		} else {
			setEvaluationDismissed(false)
		}
	}, [])

	const submitVoteMutation = useSubmitEvaluation(userId)

	const [prevVoteSuccess, setPrevVoteSuccess] = useState(submitVoteMutation.isSuccess)
	if (prevVoteSuccess !== submitVoteMutation.isSuccess) {
		setPrevVoteSuccess(submitVoteMutation.isSuccess)
		if (submitVoteMutation.isSuccess) {
			handleEvaluationOpenChange(false)
		}
	}

	const handleSubmitVote = () => {
		const question = evaluationQuestion
		if (!userId || !question || selectedRating == null) return
		submitVoteMutation.mutate({ value: selectedRating, question })
	}

	return (
		<>
			<SaramDialog
				open={nrDialogOpen}
				nrOrdem={nrOrdem}
				error={nrError}
				isSaving={saveNrMutation.isPending}
				onOpenChange={handleNrDialogOpenChange}
				onChange={handleNrOrdemChange}
				onSubmit={handleSubmitNrOrdem}
			/>

			<EvaluationDialog
				open={shouldShowEvaluationDialog}
				question={evaluationQuestion}
				selectedRating={selectedRating}
				isSubmitting={submitVoteMutation.isPending}
				onOpenChange={handleEvaluationOpenChange}
				onSelectRating={setSelectedRating}
				onSubmit={handleSubmitVote}
			/>
		</>
	)
}
