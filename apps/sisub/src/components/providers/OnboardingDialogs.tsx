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
import { useCallback, useReducer } from "react"
import { EvaluationDialog } from "@/components/features/messhall/EvaluationDialog"
import { SaramDialog } from "@/components/features/messhall/SaramDialog"
import { useAuth } from "@/hooks/auth/useAuth"
import { useUpdateNrOrdem, useUserNrOrdem } from "@/hooks/business/useUserNrOrdem"
import { useEvaluation, useSubmitEvaluation } from "@/hooks/data/useEvaluation"

const NR_ORDEM_MIN_LEN = 7

// ─── Reducer ─────────────────────────────────────────────────────────────────

type OnboardingState = {
	nrDialogOpenState: boolean
	nrOrdem: string
	nrError: string | null
	prevServerNrOrdem: string
	evaluationDismissed: boolean
	selectedRating: number | null
	prevSaveStatus: string
	prevVoteSuccess: boolean
}

type OnboardingAction =
	| { type: "SET_NR_DIALOG_OPEN"; value: boolean }
	| { type: "SET_NR_ORDEM"; value: string }
	| { type: "SET_NR_ERROR"; value: string | null }
	| { type: "SET_PREV_SERVER_NR_ORDEM"; value: string }
	| { type: "SET_EVALUATION_DISMISSED"; value: boolean }
	| { type: "SET_SELECTED_RATING"; value: number | null }
	| { type: "SET_PREV_SAVE_STATUS"; value: string }
	| { type: "SET_PREV_VOTE_SUCCESS"; value: boolean }

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
	switch (action.type) {
		case "SET_NR_DIALOG_OPEN":
			return { ...state, nrDialogOpenState: action.value }
		case "SET_NR_ORDEM":
			return { ...state, nrOrdem: action.value }
		case "SET_NR_ERROR":
			return { ...state, nrError: action.value }
		case "SET_PREV_SERVER_NR_ORDEM":
			return { ...state, prevServerNrOrdem: action.value }
		case "SET_EVALUATION_DISMISSED":
			return { ...state, evaluationDismissed: action.value }
		case "SET_SELECTED_RATING":
			return { ...state, selectedRating: action.value }
		case "SET_PREV_SAVE_STATUS":
			return { ...state, prevSaveStatus: action.value }
		case "SET_PREV_VOTE_SUCCESS":
			return { ...state, prevVoteSuccess: action.value }
		default:
			return state
	}
}

function makeInitialOnboardingState(serverNrOrdem: string): OnboardingState {
	return {
		nrDialogOpenState: false,
		nrOrdem: serverNrOrdem,
		nrError: null,
		prevServerNrOrdem: serverNrOrdem,
		evaluationDismissed: false,
		selectedRating: null,
		prevSaveStatus: "idle",
		prevVoteSuccess: false,
	}
}

export function OnboardingDialogs() {
	const { user } = useAuth()
	const userId = user?.id ?? null

	const nrOrdemQuery = useUserNrOrdem(userId)
	const evaluationQuery = useEvaluation(userId)

	const serverNrOrdem = !userId ? "" : nrOrdemQuery.data ? String(nrOrdemQuery.data) : ""
	const [state, dispatch] = useReducer(onboardingReducer, serverNrOrdem, makeInitialOnboardingState)
	const { nrDialogOpenState, nrOrdem, nrError, prevServerNrOrdem, evaluationDismissed, selectedRating, prevSaveStatus, prevVoteSuccess } = state

	/* ------------------------------------------------------------------
	   NrOrdem Dialog
	   ------------------------------------------------------------------ */
	if (prevServerNrOrdem !== serverNrOrdem) {
		dispatch({ type: "SET_PREV_SERVER_NR_ORDEM", value: serverNrOrdem })
		dispatch({ type: "SET_NR_ORDEM", value: serverNrOrdem })
	}

	const shouldForceNrDialog = !!userId && nrOrdemQuery.isSuccess && !nrOrdemQuery.data
	const nrDialogOpen = !!userId && (shouldForceNrDialog || nrDialogOpenState)

	const saveNrMutation = useUpdateNrOrdem()

	if (prevSaveStatus !== saveNrMutation.status) {
		dispatch({ type: "SET_PREV_SAVE_STATUS", value: saveNrMutation.status })
		if (saveNrMutation.isError) {
			dispatch({ type: "SET_NR_ERROR", value: "Não foi possível salvar. Tente novamente." })
		} else if (saveNrMutation.isSuccess) {
			dispatch({ type: "SET_NR_DIALOG_OPEN", value: false })
		}
	}

	const handleNrDialogOpenChange = (open: boolean) => {
		if (!open && shouldForceNrDialog) return
		dispatch({ type: "SET_NR_DIALOG_OPEN", value: open })
	}

	const handleNrOrdemChange = (value: string) => {
		dispatch({ type: "SET_NR_ORDEM", value })
		if (nrError) dispatch({ type: "SET_NR_ERROR", value: null })
	}

	const handleSubmitNrOrdem = () => {
		const digitsOnly = nrOrdem.replace(/\D/g, "").trim()
		if (!digitsOnly) {
			dispatch({ type: "SET_NR_ERROR", value: "Informe seu número de Ordem." })
			return
		}
		if (digitsOnly.length < NR_ORDEM_MIN_LEN) {
			dispatch({ type: "SET_NR_ERROR", value: "Nr. de Ordem parece curto. Confira e tente novamente." })
			return
		}
		if (!user) return
		saveNrMutation.mutate({ user, nrOrdem: digitsOnly })
	}

	/* ------------------------------------------------------------------
	   Evaluation Dialog
	   ------------------------------------------------------------------ */
	const evaluationQuestion = evaluationQuery.data?.question ?? null
	const evaluationShouldAsk = Boolean(evaluationQuery.data?.shouldAsk && evaluationQuestion)

	const shouldShowEvaluationDialog = !!userId && evaluationQuery.isSuccess && evaluationShouldAsk && !nrDialogOpen && !evaluationDismissed

	const handleEvaluationOpenChange = useCallback((open: boolean) => {
		if (!open) {
			dispatch({ type: "SET_EVALUATION_DISMISSED", value: true })
			dispatch({ type: "SET_SELECTED_RATING", value: null })
		} else {
			dispatch({ type: "SET_EVALUATION_DISMISSED", value: false })
		}
	}, [])

	const submitVoteMutation = useSubmitEvaluation(userId)

	if (prevVoteSuccess !== submitVoteMutation.isSuccess) {
		dispatch({ type: "SET_PREV_VOTE_SUCCESS", value: submitVoteMutation.isSuccess })
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
				onSelectRating={(rating) => dispatch({ type: "SET_SELECTED_RATING", value: rating })}
				onSubmit={handleSubmitVote}
			/>
		</>
	)
}
