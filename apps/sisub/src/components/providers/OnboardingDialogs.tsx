/**
 * OnboardingDialogs
 *
 * Diálogo de avaliação configurado pela SDAB (`EvaluationDialog`), exibido no layout _protected.
 *
 * O SARAM saiu daqui (change `saram-verified-link`): o diálogo que trancava a tela pedindo o
 * número deu lugar ao aviso não bloqueante `MilitaryRecordNotice` e à tela "Meu cadastro militar",
 * onde cada estado do vínculo tem o seu caminho. Ninguém cai num campo de SARAM solto.
 *
 * Motivo da separação: o layout _protected/route.tsx é responsável apenas por
 * autenticação e fundo visual. A lógica de onboarding tem responsabilidade própria.
 */
import { useCallback, useReducer } from "react"
import { EvaluationDialog } from "@/components/features/messhall/EvaluationDialog"
import { useAuth } from "@/hooks/auth/useAuth"
import { useEvaluation, useSubmitEvaluation } from "@/hooks/data/useEvaluation"

// ─── Reducer ─────────────────────────────────────────────────────────────────

type OnboardingState = {
	evaluationDismissed: boolean
	selectedRating: number | null
	prevVoteSuccess: boolean
}

type OnboardingAction =
	| { type: "SET_EVALUATION_DISMISSED"; value: boolean }
	| { type: "SET_SELECTED_RATING"; value: number | null }
	| { type: "SET_PREV_VOTE_SUCCESS"; value: boolean }

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
	switch (action.type) {
		case "SET_EVALUATION_DISMISSED":
			return { ...state, evaluationDismissed: action.value }
		case "SET_SELECTED_RATING":
			return { ...state, selectedRating: action.value }
		case "SET_PREV_VOTE_SUCCESS":
			return { ...state, prevVoteSuccess: action.value }
		default:
			return state
	}
}

const INITIAL_ONBOARDING_STATE: OnboardingState = {
	evaluationDismissed: false,
	selectedRating: null,
	prevVoteSuccess: false,
}

export function OnboardingDialogs() {
	const { user } = useAuth()
	const userId = user?.id ?? null

	const evaluationQuery = useEvaluation(userId)
	const [state, dispatch] = useReducer(onboardingReducer, INITIAL_ONBOARDING_STATE)
	const { evaluationDismissed, selectedRating, prevVoteSuccess } = state

	/* ------------------------------------------------------------------
	   Evaluation Dialog
	   ------------------------------------------------------------------ */
	const evaluationQuestion = evaluationQuery.data?.question ?? null
	const evaluationShouldAsk = Boolean(evaluationQuery.data?.shouldAsk && evaluationQuestion)

	const shouldShowEvaluationDialog = !!userId && evaluationQuery.isSuccess && evaluationShouldAsk && !evaluationDismissed

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
		<EvaluationDialog
			open={shouldShowEvaluationDialog}
			question={evaluationQuestion}
			selectedRating={selectedRating}
			isSubmitting={submitVoteMutation.isPending}
			onOpenChange={handleEvaluationOpenChange}
			onSelectRating={(rating) => dispatch({ type: "SET_SELECTED_RATING", value: rating })}
			onSubmit={handleSubmitVote}
		/>
	)
}
