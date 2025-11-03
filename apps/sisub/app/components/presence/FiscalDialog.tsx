import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@iefa/ui";
import { Button } from "@iefa/ui";
import type { Dispatch, SetStateAction } from "react";
import type { DialogState } from "~/utils/FiscalUtils";

interface FiscalDialogProps {
  setDialog: Dispatch<SetStateAction<DialogState>>;
  dialog: DialogState;
  confirmDialog: () => void;
  selectedUnit: string; // mess hall code
}

export default function FiscalDialog({
  setDialog,
  dialog,
  confirmDialog,
  selectedUnit,
}: FiscalDialogProps) {
  const forecastIsYes = !!dialog.systemForecast;
  const forecastIsNo = !dialog.systemForecast;

  return (
    <>
      {/* Diálogo de decisão do fiscal */}
      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar entrada do militar</AlertDialogTitle>
            <AlertDialogDescription>
              UUID: {dialog.uuid}
              <br />
              Previsão do sistema:{" "}
              {dialog.systemForecast === null
                ? "Não encontrado"
                : dialog.systemForecast
                  ? "Previsto"
                  : "Não previsto"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {/* Está na previsão? (somente leitura) */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Está na previsão?</div>
              <div
                className="flex gap-2"
                role="group"
                aria-label="Está na previsão"
              >
                <Button
                  disabled
                  variant={forecastIsYes ? "default" : "outline"}
                  size="sm"
                  aria-pressed={forecastIsYes}
                >
                  Sim
                </Button>
                <Button
                  disabled
                  variant={forecastIsNo ? "default" : "outline"}
                  size="sm"
                  aria-pressed={forecastIsNo}
                >
                  Não
                </Button>
              </div>
            </div>

            {/* Vai entrar? (decisão do fiscal) */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Vai entrar?</div>
              <div className="flex gap-2" role="group" aria-label="Vai entrar">
                <Button
                  variant={dialog.willEnter === "sim" ? "default" : "outline"}
                  size="sm"
                  aria-pressed={dialog.willEnter === "sim"}
                  onClick={() => setDialog((d) => ({ ...d, willEnter: "sim" }))}
                >
                  Sim
                </Button>
                <Button
                  variant={
                    dialog.willEnter === "nao" ? "destructive" : "outline"
                  }
                  size="sm"
                  aria-pressed={dialog.willEnter === "nao"}
                  onClick={() => setDialog((d) => ({ ...d, willEnter: "nao" }))}
                >
                  Não
                </Button>
              </div>
            </div>

            {selectedUnit && (
              <div className="text-xs text-muted-foreground">
                Rancho selecionado: {selectedUnit}
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDialog((d) => ({ ...d, open: false }))}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDialog}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
