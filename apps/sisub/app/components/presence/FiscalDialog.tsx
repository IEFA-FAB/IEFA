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
  selectedUnit: string;
}

export default function FiscalDialog({
  setDialog,
  dialog,
  confirmDialog,
  selectedUnit,
}: FiscalDialogProps) {
  return (
    <>
      {/* Dialogo de decisão do fiscal */}
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
            <div className="space-y-2">
              <div className="text-sm font-medium">Está na previsão?</div>
              <div className="flex gap-2">
                <Button
                  disabled
                  variant={!!dialog.systemForecast ? "default" : "outline"}
                  size="sm"
                >
                  Sim
                </Button>
                <Button
                  disabled
                  variant={!dialog.systemForecast ? "default" : "outline"}
                  size="sm"
                >
                  Não
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Vai entrar?</div>
              <div className="flex gap-2">
                <Button
                  variant={dialog.willEnter === "sim" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDialog((d) => ({ ...d, willEnter: "sim" }))}
                >
                  Sim
                </Button>
                <Button
                  variant={dialog.willEnter === "nao" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDialog((d) => ({ ...d, willEnter: "nao" }))}
                >
                  Não
                </Button>
              </div>
            </div>

            {selectedUnit && (
              <div className="text-xs text-gray-500">
                OM selecionada: {selectedUnit}
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
