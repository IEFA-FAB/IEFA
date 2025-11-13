import { useAuth } from "@iefa/auth";
import { SidebarInset, Toaster } from "@iefa/ui";
import type { User } from "@supabase/supabase-js";
import { useIsFetching, useIsMutating, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { EvaluationDialog } from "~/components/layout/EvaluationDialog";
import { SaramDialog } from "~/components/layout/SaramDialog";

import { UserQrDialog } from "~/components/layout/UserQrDialog";
import { buildSidebarData, getNavItemsForLevel, type NavItem } from "~/components/sidebar/NavItems";
import {
    fetchEvaluationForUser,
    fetchUserNrOrdem,
    QUERY_GC_TIME,
    QUERY_STALE_TIME,
    queryKeys,
    syncIdEmail,
    syncIdNrOrdem,
} from "~/routes/layouts/app-layout";

import { useUserLevel } from "~/services/AdminService";
import supabase from "~/utils/supabase";
import { AppSidebar } from "../sidebar/AppSidebar";
import { MainSurface } from "../sidebar/MainSurface";
import { Topbar } from "./TopBar";

const NR_ORDEM_MIN_LEN = 7;

export function AppShell() {
    const location = useLocation();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const userId = user?.id ?? null;

    const { data: userLevel, isLoading: levelLoading, isError: levelError } = useUserLevel(user?.id);

    const userDisplay = useMemo(() => {
        if (!user) {
            return { name: "Usuário", email: "", avatar: "" };
        }
        const name =
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.name as string | undefined) ??
            user.email ??
            "Usuário";
        const avatar = (user.user_metadata?.avatar_url as string | undefined) ?? "";
        return { name, email: user.email ?? "", avatar };
    }, [user]);

    const sidebarData = useMemo(() => {
        if (!userLevel || !user) return null;
        return buildSidebarData({
            level: userLevel,
            activePath: location.pathname,
            user: userDisplay,
        });
    }, [location.pathname, user, userLevel, userDisplay]);

    const navItems: NavItem[] = useMemo(() => {
        if (!userLevel) return [];
        return getNavItemsForLevel(userLevel);
    }, [userLevel]);

    const showSidebar = !!sidebarData && !levelError;

    const [nrOrdemQuery, evaluationQuery] = useQueries({
        queries: [
            {
                queryKey: queryKeys.userNrOrdem(userId),
                queryFn: () => fetchUserNrOrdem(userId as string),
                enabled: !!userId,
                staleTime: QUERY_STALE_TIME,
                gcTime: QUERY_GC_TIME,
            },
            {
                queryKey: queryKeys.evaluation(userId),
                queryFn: () => fetchEvaluationForUser(userId as string),
                enabled: !!userId,
                staleTime: QUERY_STALE_TIME,
                gcTime: QUERY_GC_TIME,
            },
        ],
    });

    // Sincroniza e-mail no Supabase quando usuário fica disponível (ou muda)
    const syncEmailMutation = useMutation({
        mutationFn: syncIdEmail,
        onError: (error) => console.error("Erro ao sincronizar email:", error),
    });

    useEffect(() => {
        if (user) syncEmailMutation.mutate(user);
        // Dispara apenas quando o id muda
    }, [user?.id, syncEmailMutation.mutate, user]);

    // Estado e regras do SARAM (nrOrdem)
    const [nrDialogOpenState, setNrDialogOpenState] = useState(false);
    const [nrOrdem, setNrOrdem] = useState("");
    const [nrError, setNrError] = useState<string | null>(null);

    // Deriva se o diálogo deve ser forçado (sem depender de efeito)
    const shouldForceNrDialog = !!userId && nrOrdemQuery.isSuccess && !nrOrdemQuery.data;

    // Abre efetivo = forçado OU aberto manualmente
    const nrDialogOpen = shouldForceNrDialog || nrDialogOpenState;

    // Sincroniza valor inicial quando query retorna
    useEffect(() => {
        if (!userId) {
            setNrDialogOpenState(false);
            setNrOrdem("");
            return;
        }
        const current = nrOrdemQuery.data;
        setNrOrdem(current ? String(current) : "");
    }, [userId, nrOrdemQuery.data]);

    const saveNrMutation = useMutation({
        mutationFn: (value: string) => syncIdNrOrdem(user as User, value),
        onMutate: async (value) => {
            if (!userId) return undefined;
            setNrError(null);
            const queryKey = queryKeys.userNrOrdem(userId);
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, value);
            return { previous, queryKey };
        },
        onError: (error, _value, context) => {
            console.error("Erro ao salvar nrOrdem:", error);
            if (context?.previous) {
                queryClient.setQueryData(context.queryKey, context.previous);
            }
            setNrError("Não foi possível salvar. Tente novamente.");
        },
        onSuccess: () => setNrDialogOpenState(false),
        onSettled: () => {
            if (userId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.userNrOrdem(userId),
                });
            }
        },
    });

    const handleNrDialogOpenChange = useCallback(
        (open: boolean) => {
            // Impede fechar enquanto for obrigatório
            if (!open && shouldForceNrDialog) return;
            setNrDialogOpenState(open);
        },
        [shouldForceNrDialog],
    );

    const handleNrOrdemChange = useCallback(
        (value: string) => {
            setNrOrdem(value);
            if (nrError) setNrError(null);
        },
        [nrError],
    );

    const handleSubmitNrOrdem = useCallback(() => {
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
        saveNrMutation.mutate(digitsOnly);
    }, [nrOrdem, saveNrMutation, user]);

    // Estado e regras da avaliação
    const [evaluationDismissed, setEvaluationDismissed] = useState(false);
    const [selectedRating, setSelectedRating] = useState<number | null>(null);

    // Reset ao mudar a pergunta
    useEffect(() => {
        setEvaluationDismissed(false);
        setSelectedRating(null);
    }, []);

    const evaluationQuestion = evaluationQuery.data?.question ?? null;
    const evaluationShouldAsk = Boolean(evaluationQuery.data?.shouldAsk && evaluationQuestion);

    // Mostra avaliação somente quando:
    // - há userId
    // - query concluiu e quer perguntar
    // - o diálogo de nrOrdem não está aberto/forçado
    // - não foi dispensado nesta sessão
    const shouldShowEvaluationDialog =
        !!userId && evaluationQuery.isSuccess && evaluationShouldAsk && !nrDialogOpen && !evaluationDismissed;

    const handleEvaluationOpenChange = useCallback((open: boolean) => {
        if (!open) {
            setEvaluationDismissed(true);
            setSelectedRating(null);
        } else {
            setEvaluationDismissed(false);
        }
    }, []);

    const submitVoteMutation = useMutation({
        mutationFn: async (payload: { value: number; question: string }) => {
            const { error } = await supabase.from("opinions").insert([
                {
                    value: payload.value,
                    question: payload.question,
                    userId: user!.id,
                },
            ]);
            if (error) throw error;
        },
        onError: (error) => console.error("Erro ao registrar voto:", error),
        onSuccess: () => handleEvaluationOpenChange(false),
        onSettled: () => {
            if (userId) {
                queryClient.invalidateQueries({
                    queryKey: queryKeys.evaluation(userId),
                });
            }
        },
    });

    const handleSubmitVote = useCallback(() => {
        const question = evaluationQuestion;
        if (!userId || !question || selectedRating == null) return;
        submitVoteMutation.mutate({ value: selectedRating, question });
    }, [evaluationQuestion, selectedRating, submitVoteMutation, userId]);

    // QR dialog + copiar ID
    const [sheetOpen, setSheetOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    const [hasCopiedId, setHasCopiedId] = useState(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCopyUserId = useCallback(async () => {
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
    }, [user]);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    // Progressos globais
    const globalFetching = useIsFetching();
    const globalMutating = useIsMutating();
    const showGlobalProgress =
        globalFetching + globalMutating > 0 || levelLoading || nrOrdemQuery.isFetching || evaluationQuery.isFetching;

    // Estados iniciais
    const isSavingNrReal = saveNrMutation.isPending;
    const isSubmittingVote = submitVoteMutation.isPending;
    const showInitialLoading = levelLoading && !userLevel;
    const showInitialError = !levelLoading && levelError;

    const handleRetry = useCallback(() => {
        if (typeof window !== "undefined") window.location.reload();
    }, []);

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

            {showSidebar && sidebarData ? <AppSidebar data={sidebarData} /> : null}

            <SidebarInset>
                <div className="flex min-h-[100svh] w-full flex-col supports-[height:100dvh]:min-h-[100dvh]">
                    <Topbar
                        showSidebar={showSidebar}
                        navItems={navItems}
                        sheetOpen={sheetOpen}
                        onSheetOpenChange={setSheetOpen}
                        onSidebarNavigate={() => setSheetOpen(false)}
                        showGlobalProgress={showGlobalProgress}
                        onOpenQr={() => setQrOpen(true)}
                        userId={userId}
                        userLevel={userLevel}
                    />

                    <main id="conteudo" className="flex-1">
                        <MainSurface
                            showInitialError={showInitialError}
                            showInitialLoading={showInitialLoading}
                            onRetry={handleRetry}
                        >
                            <Outlet />
                        </MainSurface>
                    </main>
                </div>
            </SidebarInset>
            <Toaster
                position="bottom-center"
                richColors
                expand
                className="z-[2147483647]" // garante ficar acima de tudo
            />
        </>
    );
}
