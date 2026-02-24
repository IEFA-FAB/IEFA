import { cn } from "@iefa/ui"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { EvaluationDialog } from "@/components/common/dialogs/EvaluationDialog"
import { SaramDialog } from "@/components/features/presence/SaramDialog"
import { useAuth } from "@/hooks/auth/useAuth"
import { useUpdateNrOrdem, useUserNrOrdem } from "@/hooks/business/useUserNrOrdem"
import { useEvaluation, useSubmitEvaluation } from "@/hooks/data/useEvaluation"
import { useSyncUserEmail } from "@/hooks/ui/useUserSync"

const NR_ORDEM_MIN_LEN = 7

export const Route = createFileRoute("/_protected")({
	beforeLoad: ({ context, location }) => {
		if (!context.auth.isAuthenticated) {
			throw redirect({
				to: "/auth",
				search: {
					redirect: location.href,
				},
			})
		}
	},
	component: ProtectedLayout,
})

function ProtectedLayout() {
	const { user } = useAuth()
	const userId = user?.id ?? null

	const nrOrdemQuery = useUserNrOrdem(userId)
	const evaluationQuery = useEvaluation(userId)
	const syncEmailMutation = useSyncUserEmail()

	useEffect(() => {
		if (user) syncEmailMutation.mutate(user)
	}, [user?.id, syncEmailMutation.mutate, user])

	// NR Dialog State
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
			setNrError("Informe seu número da Ordem.")
			return
		}
		if (digitsOnly.length < NR_ORDEM_MIN_LEN) {
			setNrError("Nr. da Ordem parece curto. Confira e tente novamente.")
			return
		}
		if (!user) return
		saveNrMutation.mutate({ user, nrOrdem: digitsOnly })
	}

	// Evaluation Dialog State
	const [evaluationDismissed, setEvaluationDismissed] = useState(false)
	const [selectedRating, setSelectedRating] = useState<number | null>(null)

	const evaluationQuestion = evaluationQuery.data?.question ?? null
	const evaluationShouldAsk = Boolean(evaluationQuery.data?.shouldAsk && evaluationQuestion)

	const shouldShowEvaluationDialog =
		!!userId &&
		evaluationQuery.isSuccess &&
		evaluationShouldAsk &&
		!nrDialogOpen &&
		!evaluationDismissed

	const handleEvaluationOpenChange = useCallback((open: boolean) => {
		if (!open) {
			setEvaluationDismissed(true)
			setSelectedRating(null)
		} else {
			setEvaluationDismissed(false)
		}
	}, [])

	const submitVoteMutation = useSubmitEvaluation()

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
		submitVoteMutation.mutate({ value: selectedRating, question, userId })
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

			<div
				className={cn(
					"relative h-screen w-full bg-background overflow-hidden isolate",
					"before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none",
					"before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]",
					"dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]",
					"before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]",
					"after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10",
					"after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]",
					"after:bg-[length:12px_12px] after:opacity-[0.02]",
					"dark:after:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.4)_1px,transparent_1px)]",
					"dark:after:opacity-[0.04]"
				)}
			>
				<Outlet />
			</div>
		</>
	)
}
