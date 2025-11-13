import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@iefa/ui";
import { Trash2 } from "lucide-react";
import { MEAL_LABEL, type MealKey, type PresenceRecord } from "~/utils/FiscalUtils";
import { formatDate } from "~/utils/RanchoUtils";

interface PresenceTableProps {
    selectedDate: string;
    selectedMeal: MealKey;
    presences: PresenceRecord[];
    forecastMap: Record<string, boolean>;
    actions: {
        removePresence: (record: PresenceRecord) => void;
    };
}

// Tipo auxiliar apenas para leitura do campo extra
type PresenceRowUI = PresenceRecord & { display_name?: string | null };

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
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/50">
                    <div>
                        <h3 className="font-semibold">Presenças registradas</h3>
                        <p className="text-sm text-muted-foreground">
                            Dia {formatDate(selectedDate)} · {MEAL_LABEL[selectedMeal]}
                        </p>
                    </div>
                    <Badge variant="secondary">{presences.length}</Badge>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="text-muted-foreground">Pessoa</TableHead>
                                <TableHead className="text-muted-foreground">Data</TableHead>
                                <TableHead className="text-muted-foreground">Refeição</TableHead>
                                <TableHead className="text-muted-foreground">Previsão</TableHead>
                                <TableHead className="text-muted-foreground">Registrado em</TableHead>
                                <TableHead className="text-right text-muted-foreground">Ações</TableHead>
                            </TableRow>
                        </TableHeader>

                        <TableBody>
                            {presences.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        Nenhuma presença registrada ainda.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                presences.map((row) => {
                                    const uiRow = row as PresenceRowUI;
                                    const saidWouldAttend = forecastMap[row.user_id] ?? false;
                                    const name = uiRow.display_name?.trim() || row.user_id;

                                    return (
                                        <TableRow key={row.id} className="hover:bg-accent/50">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{name}</span>
                                                    {/* Mostra sempre o UUID em menor destaque */}
                                                    <span className="font-mono text-xs text-muted-foreground">
                                                        {row.user_id}
                                                    </span>
                                                </div>
                                            </TableCell>

                                            <TableCell>{formatDate(row.date)}</TableCell>
                                            <TableCell>{MEAL_LABEL[row.meal]}</TableCell>
                                            <TableCell>
                                                {saidWouldAttend ? (
                                                    <Badge variant="default">Sim</Badge>
                                                ) : (
                                                    <Badge variant="outline">Não</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>{new Date(row.created_at).toLocaleString("pt-BR")}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:bg-destructive/10"
                                                    onClick={() => actions.removePresence(row)}
                                                    aria-label="Remover presença"
                                                >
                                                    <Trash2 className="h-4 w-4" />
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
