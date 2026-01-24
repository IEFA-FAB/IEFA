import { cn, SidebarProvider } from "@iefa/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { EvaluationDialog } from "@/components/common/dialogs/EvaluationDialog";
import { UserQrDialog } from "@/components/common/dialogs/UserQrDialog";
import { AppShell } from "@/components/common/layout/AppShell";
import { SaramDialog } from "@/components/features/presence/SaramDialog";
import { useAuth } from "@/hooks/auth/useAuth";
import {
	useUpdateNrOrdem,
	useUserNrOrdem,
} from "@/hooks/business/useUserNrOrdem";
import { useEvaluation, useSubmitEvaluation } from "@/hooks/data/useEvaluation";
import { useSyncUserEmail } from "@/hooks/ui/useUserSync";

const NR_ORDEM_MIN_LEN = 7;

/**
 * Hook para determinar o estado padrão da sidebar baseado no tamanho da tela
 * Sidebar aberta em telas >= 1280px (xl breakpoint)
 */
function useResponsiveSidebarDefault() {
	const [defaultOpen, setDefaultOpen] = useState(() => {
		if (typeof window === "undefined") return true;
		return window.innerWidth >= 1280;
	});

	useEffect(() => {
		const handleResize = () => {
			const shouldBeOpen = window.innerWidth >= 1280;
			setDefaultOpen(shouldBeOpen);
		};

		// Debounce para performance
		let timeoutId: NodeJS.Timeout;
		const debouncedResize = () => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(handleResize, 150);
		};

		window.addEventListener("resize", debouncedResize);
		return () => {
			window.removeEventListener("resize", debouncedResize);
			clearTimeout(timeoutId);
		};
	}, []);

	return defaultOpen;
}

/**
 * Layout para rotas protegidas (requer autenticação)
 * Dialogs ficam fora do SidebarProvider para evitar problemas de espaçamento
 */
export const Route = createFileRoute("/_protected")({
	beforeLoad: ({ context, location }) => {
		if (!context.auth.isAuthenticated) {
			throw redirect({
				to: "/auth",
				search: {
					redirect: location.href,
				},
			});
		}
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	const { user } = useAuth();
	const userId = user?.id ?? null;
	const responsiveSidebarDefault = useResponsiveSidebarDefault();

	const nrOrdemQuery = useUserNrOrdem(userId);
	const evaluationQuery = useEvaluation(userId);
	const syncEmailMutation = useSyncUserEmail();

	useEffect(() => {
		if (user) syncEmailMutation.mutate(user);
	}, [user?.id, syncEmailMutation.mutate, user]);

	// NR Dialog State
	const [nrDialogOpenState, setNrDialogOpenState] = useState(false);
	const [nrOrdem, setNrOrdem] = useState("");
	const [nrError, setNrError] = useState<string | null>(null);

	const shouldForceNrDialog =
		!!userId && nrOrdemQuery.isSuccess && !nrOrdemQuery.data;
	const nrDialogOpen = shouldForceNrDialog || nrDialogOpenState;

	useEffect(() => {
		if (!userId) {
			setNrDialogOpenState(false);
			setNrOrdem("");
			return;
		}
		const current = nrOrdemQuery.data;
		setNrOrdem(current ? String(current) : "");
	}, [userId, nrOrdemQuery.data]);

	const saveNrMutation = useUpdateNrOrdem();

	useEffect(() => {
		if (saveNrMutation.isError) {
			setNrError("Não foi possível salvar. Tente novamente.");
		}
	}, [saveNrMutation.isError]);

	useEffect(() => {
		if (saveNrMutation.isSuccess) {
			setNrDialogOpenState(false);
		}
	}, [saveNrMutation.isSuccess]);

	const handleNrDialogOpenChange = (open: boolean) => {
		if (!open && shouldForceNrDialog) return;
		setNrDialogOpenState(open);
	};

	const handleNrOrdemChange = (value: string) => {
		setNrOrdem(value);
		if (nrError) setNrError(null);
	};

	const handleSubmitNrOrdem = () => {
		const digitsOnly = nrOrdem.replace(/\D/g, "").trim();
		if (!digitsOnly) {
			setNrError("Informe seu número da Ordem.");
			return;
		}
		if (digitsOnly.length < NR_ORDEM_MIN_LEN) {
			setNrError("Nr. da Ordem parece curto. Confira e tente novamente.");
			return;
		}
		if (!user) return;
		saveNrMutation.mutate({ user, nrOrdem: digitsOnly });
	};

	// Evaluation Dialog State
	const [evaluationDismissed, setEvaluationDismissed] = useState(false);
	const [selectedRating, setSelectedRating] = useState<number | null>(null);

	useEffect(() => {
		setEvaluationDismissed(false);
		setSelectedRating(null);
	}, []);

	const evaluationQuestion = evaluationQuery.data?.question ?? null;
	const evaluationShouldAsk = Boolean(
		evaluationQuery.data?.shouldAsk && evaluationQuestion,
	);

	const shouldShowEvaluationDialog =
		!!userId &&
		evaluationQuery.isSuccess &&
		evaluationShouldAsk &&
		!nrDialogOpen &&
		!evaluationDismissed;

	const handleEvaluationOpenChange = useCallback((open: boolean) => {
		if (!open) {
			setEvaluationDismissed(true);
			setSelectedRating(null);
		} else {
			setEvaluationDismissed(false);
		}
	}, []);

	const submitVoteMutation = useSubmitEvaluation();

	useEffect(() => {
		if (submitVoteMutation.isSuccess) {
			handleEvaluationOpenChange(false);
		}
	}, [submitVoteMutation.isSuccess, handleEvaluationOpenChange]);

	const handleSubmitVote = () => {
		const question = evaluationQuestion;
		if (!userId || !question || selectedRating == null) return;
		submitVoteMutation.mutate({ value: selectedRating, question, userId });
	};

	// QR Dialog State
	const [qrOpen, setQrOpen] = useState(false);
	const [hasCopiedId, setHasCopiedId] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopyUserId = async () => {
		if (!user?.id) return;
		if (typeof navigator === "undefined" || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(user.id);
			setHasCopiedId(true);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setHasCopiedId(false), 1600);
		} catch (error) {
			console.error("Erro ao copiar ID:", error);
		}
	};

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
		};
	}, []);

	const isSavingNrReal = saveNrMutation.isPending;
	const isSubmittingVote = submitVoteMutation.isPending;

	return (
		<>
			<SaramDialog
				open={nrDialogOpen}
				nrOrdem={nrOrdem}
				error={nrError}
				isSaving={isSavingNrReal}
				onOpenChange={handleNrDialogOpenChange}
				onChange={handleNrOrdemChange}
				onSubmit={handleSubmitNrOrdem}
			/>

			<EvaluationDialog
				open={shouldShowEvaluationDialog}
				question={evaluationQuestion}
				selectedRating={selectedRating}
				isSubmitting={isSubmittingVote}
				onOpenChange={handleEvaluationOpenChange}
				onSelectRating={setSelectedRating}
				onSubmit={handleSubmitVote}
			/>

			<UserQrDialog
				open={qrOpen}
				onOpenChange={setQrOpen}
				userId={userId}
				onCopy={handleCopyUserId}
				hasCopied={hasCopiedId}
			/>

			<div
				className={cn(
					"relative h-screen w-full bg-background overflow-hidden isolate",
					// Modern Background Gradients (before)
					"before:content-[''] before:absolute before:inset-0 before:-z-10 before:pointer-events-none",
					"before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(52_211_153/0.14),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(6_182_212/0.12),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(139_92_246/0.10),transparent_60%)]",
					"dark:before:bg-[radial-gradient(1200px_800px_at_10%_-10%,rgb(110_231_183/0.18),transparent_60%),radial-gradient(900px_600px_at_90%_0%,rgb(34_211_238/0.16),transparent_60%),radial-gradient(800px_800px_at_50%_100%,rgb(167_139_250/0.14),transparent_60%)]",
					"before:transform-gpu motion-safe:before:animate-[slow-pan_32s_ease-in-out_infinite]",
					// Dot Pattern (after)
					"after:content-[''] after:pointer-events-none after:absolute after:inset-0 after:-z-10",
					"after:bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.8)_1px,transparent_1px)]",
					"after:bg-[length:12px_12px] after:opacity-[0.02]",
					"dark:after:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.4)_1px,transparent_1px)]",
					"dark:after:opacity-[0.04]",
				)}
			>
				<SidebarProvider
					defaultOpen={responsiveSidebarDefault}
					className="bg-transparent text-foreground h-full"
				>
					<AppShell onOpenQr={() => setQrOpen(true)} />
				</SidebarProvider>
			</div>
		</>
	);
}
