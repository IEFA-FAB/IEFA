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

    return (
      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isSavingBatch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                <span className="text-sm text-orange-700">
                  Salvando {count} {labelAlteracao(count)}...
                </span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4 text-orange-600" />
                <span className="text-sm text-orange-700">
                  {count} {labelAlteracao(count)} {labelPendente(count)} -
                  salvamento automático em andamento
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);

PendingChangesStatus.displayName = "PendingChangesStatus";
