/**
 * OnboardingDialogs
 *
 * Encapsula os dois diálogos de onboarding exibidos no layout _protected:
 *  1. SaramDialog  — coleta o SARAM do usuário (obrigatório no 1º acesso)
 *  2. EvaluationDialog — pergunta de avaliação configurada pela SDAB
 *
 * Motivo da separação: o layout _protected/route.tsx é responsável apenas por
 * autenticação e fundo visual. A lógica de onboarding tem responsabilidade própria.
 */
import { useCallback, useReducer } from "react"
import { EvaluationDialog } from "@/components/features/messhall/EvaluationDialog"
import { SaramDialog } from "@/components/features/messhall/SaramDialog"
import { useAuth } from "@/hooks/auth/useAuth"
import { saramStatusNeedsAction, useSaramStatus, useUpdateSaram, useUserSaram } from "@/hooks/business/useUserSaram"
import { useEvaluation, useSubmitEvaluation } from "@/hooks/data/useEvaluation"

const SARAM_MIN_LEN = 7

// ─── Reducer ─────────────────────────────────────────────────────────────────

type OnboardingState = {
	saramDialogOpenState: boolean
	saram: string
	saramError: string | null
	prevServerSaram: string
	evaluationDismissed: boolean
	selectedRating: number | null
	prevSaveStatus: string
	prevVoteSuccess: boolean
}

type OnboardingAction =
	| { type: "SET_SARAM_DIALOG_OPEN"; value: boolean }
	| { type: "SET_SARAM"; value: string }
	| { type: "SET_SARAM_ERROR"; value: string | null }
	| { type: "SET_PREV_SERVER_SARAM"; value: string }
	| { type: "SET_EVALUATION_DISMISSED"; value: boolean }
	| { type: "SET_SELECTED_RATING"; value: number | null }
	| { type: "SET_PREV_SAVE_STATUS"; value: string }
	| { type: "SET_PREV_VOTE_SUCCESS"; value: boolean }

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
	switch (action.type) {
		case "SET_SARAM_DIALOG_OPEN":
			return { ...state, saramDialogOpenState: action.value }
		case "SET_SARAM":
			return { ...state, saram: action.value }
		case "SET_SARAM_ERROR":
			return { ...state, saramError: action.value }
		case "SET_PREV_SERVER_SARAM":
			return { ...state, prevServerSaram: action.value }
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

function makeInitialOnboardingState(serverSaram: string): OnboardingState {
	return {
		saramDialogOpenState: false,
		saram: serverSaram,
		saramError: null,
		prevServerSaram: serverSaram,
		evaluationDismissed: false,
		selectedRating: null,
		prevSaveStatus: "idle",
		prevVoteSuccess: false,
	}
}

export function OnboardingDialogs() {
	const { user } = useAuth()
	const userId = user?.id ?? null

	const saramQuery = useUserSaram(userId)
	// Só quem ainda não tem SARAM visível consulta o estado: o comensal verificado não paga a ida.
	const saramStatusQuery = useSaramStatus(userId, { enabled: saramQuery.isSuccess && !saramQuery.data })
	const evaluationQuery = useEvaluation(userId)

	const serverSaram = !userId ? "" : saramQuery.data ? String(saramQuery.data) : ""
	const [state, dispatch] = useReducer(onboardingReducer, serverSaram, makeInitialOnboardingState)
	const { saramDialogOpenState, saram, saramError, prevServerSaram, evaluationDismissed, selectedRating, prevSaveStatus, prevVoteSuccess } = state

	/* ------------------------------------------------------------------
	   Saram Dialog
	   ------------------------------------------------------------------ */
	if (prevServerSaram !== serverSaram) {
		dispatch({ type: "SET_PREV_SERVER_SARAM", value: serverSaram })
		dispatch({ type: "SET_SARAM", value: serverSaram })
	}

	// Sem SARAM visível E com ação possível: conta institucional, pedido em análise e bloqueio de
	// tentativas não reabrem o diálogo a cada sessão (20261003100000).
	const shouldForceSaramDialog = !!userId && saramQuery.isSuccess && !saramQuery.data && saramStatusNeedsAction(saramStatusQuery.data)
	const saramDialogOpen = !!userId && (shouldForceSaramDialog || saramDialogOpenState)

	const saveSaramMutation = useUpdateSaram()

	if (prevSaveStatus !== saveSaramMutation.status) {
		dispatch({ type: "SET_PREV_SAVE_STATUS", value: saveSaramMutation.status })
		if (saveSaramMutation.isError) {
			dispatch({ type: "SET_SARAM_ERROR", value: "Não foi possível salvar. Tente novamente." })
		} else if (saveSaramMutation.isSuccess) {
			dispatch({ type: "SET_SARAM_DIALOG_OPEN", value: false })
		}
	}

	const handleSaramDialogOpenChange = (open: boolean) => {
		if (!open && shouldForceSaramDialog) return
		dispatch({ type: "SET_SARAM_DIALOG_OPEN", value: open })
	}

	const handleSaramChange = (value: string) => {
		dispatch({ type: "SET_SARAM", value })
		if (saramError) dispatch({ type: "SET_SARAM_ERROR", value: null })
	}

	const handleSubmitSaram = () => {
		const digitsOnly = saram.replace(/\D/g, "").trim()
		if (!digitsOnly) {
			dispatch({ type: "SET_SARAM_ERROR", value: "Informe seu SARAM." })
			return
		}
		if (digitsOnly.length < SARAM_MIN_LEN) {
			dispatch({ type: "SET_SARAM_ERROR", value: "SARAM parece curto. Confira e tente novamente." })
			return
		}
		if (!user) return
		saveSaramMutation.mutate({ user, saram: digitsOnly })
	}

	/* ------------------------------------------------------------------
	   Evaluation Dialog
	   ------------------------------------------------------------------ */
	const evaluationQuestion = evaluationQuery.data?.question ?? null
	const evaluationShouldAsk = Boolean(evaluationQuery.data?.shouldAsk && evaluationQuestion)

	const shouldShowEvaluationDialog = !!userId && evaluationQuery.isSuccess && evaluationShouldAsk && !saramDialogOpen && !evaluationDismissed

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
				open={saramDialogOpen}
				saram={saram}
				error={saramError}
				isSaving={saveSaramMutation.isPending}
				onOpenChange={handleSaramDialogOpenChange}
				onChange={handleSaramChange}
				onSubmit={handleSubmitSaram}
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
