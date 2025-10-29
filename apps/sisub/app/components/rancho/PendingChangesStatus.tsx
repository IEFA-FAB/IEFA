// components/PendingChangesStatus.tsx
import { memo } from "react";
import { Loader2, Save } from "lucide-react";

interface PendingChange {
  [key: string]: any;
}

interface PendingChangesStatusProps {
  pendingChanges: PendingChange[];
  isSavingBatch: boolean;
}

// Helpers de pluralização
const pluralize = (count: number, singular: string, plural: string) =>
  count === 1 ? singular : plural;

const labelAlteracao = (n: number) => pluralize(n, "alteração", "alterações");
const labelPendente = (n: number) => pluralize(n, "pendente", "pendentes");

export const PendingChangesStatus = memo<PendingChangesStatusProps>(
  ({ pendingChanges, isSavingBatch }) => {
    const count = pendingChanges.length;
    if (count === 0) return null;

    const base = "rounded-lg border p-3 sm:p-4 transition-colors w-full";
    const savingClasses = "bg-primary/10 border-primary/30 text-primary";
    const pendingClasses =
      "bg-accent/10 border-accent/30 text-accent-foreground";

    return (
      <div
        className={`${base} ${isSavingBatch ? savingClasses : pendingClasses}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isSavingBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">
                  Salvando {count} {labelAlteracao(count)}...
                </span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {count} {labelAlteracao(count)} {labelPendente(count)} —
                  salvamento automático em andamento
                </span>
              </>
            )}
          </div>

          {/* Chip com a contagem usando apenas tokens */}
          <span
            className="
              inline-flex items-center rounded-md
              bg-background/70 text-foreground/80
              border border-border px-2 py-0.5 text-xs
            "
            aria-label={`${count} ${labelAlteracao(count)}`}
          >
            {count}
          </span>
        </div>

        {/* Linha auxiliar em tom discreto */}
        {!isSavingBatch && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Você pode continuar usando o sistema enquanto salvamos suas
            alterações.
          </p>
        )}
      </div>
    );
  }
);

PendingChangesStatus.displayName = "PendingChangesStatus";
