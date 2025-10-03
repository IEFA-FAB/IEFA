"use client";

import {
  FacilidadesTable,
  type FacilidadesTableProps,
} from "@/components/table";
import { Input } from "@iefa/ui";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@iefa/ui";
import { Label } from "@iefa/ui";
import { ChevronsUpDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@iefa/ui";
import { Button } from "@iefa/ui";
import OrientationWarning from "@/components/orientation-warning";
import { useWindowSize } from "@uidotdev/usehooks";
export default function Facilidades() {
  const size = useWindowSize();

  const [env, setEnv] = useState<FacilidadesTableProps>({
    OM: "o IEFA",
    Hour: "09:00h",
    Date: "15/04 (terça-feira)",
    Hour_limit: "2 (duas)",
  });
  const [isOpen, setIsOpen] = useState(false);

  const handleChange =
    (key: keyof FacilidadesTableProps) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setEnv((prev) => ({ ...prev, [key]: e.target.value }));

  if (size.width != null && size.width < 500) {
    return <OrientationWarning />;
  }

  return (
    <div className="flex flex-col items-center justify-center w-full p-6 gap-8 pt-20">
      <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-200">
        Facilidades
      </h1>
      <Card className="w-full max-w-2xl p-4">
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          className="flex flex-col gap-4"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full items-center place-content-between"
            >
              <CardHeader className="flex items-center justify-between w-full">
                <CardTitle>Atributos</CardTitle>
                <ChevronsUpDown />
              </CardHeader>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-4">
            <CardContent className="flex flex-col items-start gap-2">
              <Label className="px-2 bold">OM</Label>
              <Input
                placeholder="Insira a OM"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                value={env.OM}
                onChange={handleChange("OM")}
                className="w-full"
              />
            </CardContent>
            <CardContent className="flex flex-col items-start gap-2">
              <Label className="px-2 bold">Data</Label>
              <Input
                placeholder="Insira a Data"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                value={env.Date}
                onChange={handleChange("Date")}
                className="w-full"
              />
            </CardContent>
            <CardContent className="flex flex-col items-start gap-2">
              <Label className="px-2 bold">Hora</Label>
              <Input
                placeholder="Insira a Hora"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                value={env.Hour}
                onChange={handleChange("Hour")}
                className="w-full"
              />
            </CardContent>
            <CardContent className="flex flex-col items-start gap-2">
              <Label className="px-2 bold">Tempo limite</Label>
              <Input
                placeholder="Insira o tempo limite"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                value={env.Hour_limit}
                onChange={handleChange("Hour_limit")}
                className="w-full"
              />
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <FacilidadesTable
        OM={env.OM}
        Date={env.Date}
        Hour={env.Hour}
        Hour_limit={env.Hour_limit}
      />
    </div>
  );
}
