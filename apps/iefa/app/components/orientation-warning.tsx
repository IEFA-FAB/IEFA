import { Alert, AlertDescription, AlertTitle } from "@iefa/ui";
import { AlertCircleIcon } from "lucide-react";

export default function OrientationWarning() {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 justify-center">
      <Alert
        variant="destructive"
        className="flex flex-col justify-center items-center"
      >
        <AlertCircleIcon />
        <AlertTitle className="text-left">
          Impossível visualizar a tabela
        </AlertTitle>
        <AlertDescription>
          <p>Vire a tela na horizontal</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
