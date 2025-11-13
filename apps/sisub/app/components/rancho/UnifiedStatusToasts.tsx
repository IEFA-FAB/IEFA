import { AlertTriangle, CheckCircle, Loader2, Save } from "lucide-react";
import { memo, useEffect } from "react";
import { toast } from "sonner";

interface PendingChange {
    [key: string]: any;
}

interface UnifiedStatusToastsProps {
    // Mensagens
    success?: string | null;
    error?: string | null;
    onClearMessages: () => void;

    // Status pendências
    pendingChanges: PendingChange[];
    isSavingBatch: boolean;

    // Opções
    autoHideSuccessMs?: number; // padrão: 6000ms
}

const pluralize = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelPendente = (n: number) => pluralize(n, "pendente", "pendentes");

// IDs fixos para permitir atualizar/dispensar toasts
const PENDING_ID = "sisub-pending";

export const UnifiedStatusToasts = memo<UnifiedStatusToastsProps>(
    ({ success, error, onClearMessages, pendingChanges, isSavingBatch, autoHideSuccessMs = 6000 }) => {
        const count = pendingChanges.length;

        // Sucesso: mostra toast e limpa mensagem após autoHideSuccessMs
        useEffect(() => {
            if (!success) return;
            const id = `sisub-success-${Date.now()}`; // deixa empilhar sucessos diferentes
            toast.success(success, {
                id,
                duration: autoHideSuccessMs,
                icon: <CheckCircle className="h-4 w-4" />,
            });
            const t = setTimeout(() => onClearMessages(), autoHideSuccessMs);
            return () => clearTimeout(t);
        }, [success, autoHideSuccessMs, onClearMessages]);

        // Erro: toast destrutivo com botão de fechar manual
        useEffect(() => {
            if (!error) return;
            // Reusa o mesmo id para atualizar o erro atual (ou troque por Date.now() se quiser empilhar vários erros)
            const id = "sisub-error";
            toast.error(error, {
                id,
                duration: 10000,
                closeButton: true,
                icon: <AlertTriangle className="h-4 w-4" />,
                action: {
                    label: "Fechar",
                    onClick: () => {
                        onClearMessages();
                        toast.dismiss(id);
                    },
                },
            });
        }, [error, onClearMessages]);

        // Pendências: toast persistente que muda entre "salvando" e "pendente"
        useEffect(() => {
            if (count > 0) {
                const baseMsg = `${count} ${labelAlteracao(count)}`;
                if (isSavingBatch) {
                    // Atualiza/cria um toast "carregando"
                    toast(`Salvando ${baseMsg}...`, {
                        id: PENDING_ID,
                        duration: Infinity,
                        icon: <Loader2 className="h-4 w-4 animate-spin" />,
                    });
                } else {
                    toast(`${baseMsg} ${labelPendente(count)} — salvamento automático em andamento`, {
                        id: PENDING_ID,
                        duration: Infinity,
                        icon: <Save className="h-4 w-4" />,
                    });
                }
            } else {
                // Zero pendências: remove o toast persistente
                toast.dismiss(PENDING_ID);
            }
        }, [count, isSavingBatch]);

        // Não renderiza nada; Sonner exibe os toasts
        return null;
    },
);

UnifiedStatusToasts.displayName = "UnifiedStatusToasts";
