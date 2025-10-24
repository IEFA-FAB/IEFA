import { Badge } from "@iefa/ui";
import { Button } from "@iefa/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@iefa/ui";
import { Trash2 } from "lucide-react";
import { formatDate } from "~/utils/RanchoUtils";
import { MEAL_LABEL, MealKey, PresenceRecord } from "~/utils/FiscalUtils";

interface PresenceTableProps {
  selectedDate: string;
  selectedMeal: MealKey;
  presences: PresenceRecord[];
  forecastMap: Record<string, boolean>;
  actions: {
    removePresence: (record: PresenceRecord) => void;
  };
}

export default function PresenceTable({
  selectedDate,
  selectedMeal,
  presences,
  forecastMap,
  actions,
}: PresenceTableProps) {
  return (
    <>
      {/* Lista de presenças */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Presenças registradas</h3>
            <p className="text-sm text-gray-500">
              Dia {formatDate(selectedDate)} · {MEAL_LABEL[selectedMeal]}
            </p>
          </div>
          <Badge variant="secondary">{presences.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>UUID</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Refeição</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead>Registrado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {presences.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500">
                    Nenhuma presença registrada ainda.
                  </TableCell>
                </TableRow>
              ) : (
                presences.map((row) => {
                  const saidWouldAttend = forecastMap[row.user_id] ?? false;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.user_id}
                      </TableCell>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{MEAL_LABEL[row.meal]}</TableCell>
                      <TableCell>
                        {saidWouldAttend ? (
                          <Badge className="bg-green-100 text-green-700 border border-green-200">
                            Sim
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-600">
                            Não
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {" "}
                        {new Date(row.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => actions.removePresence(row)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
