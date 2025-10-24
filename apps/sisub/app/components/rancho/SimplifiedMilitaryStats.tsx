// components/SimplifiedMilitaryStats.tsx
import { memo, useMemo } from "react";
import { CalendarDays, Utensils, Clock } from "lucide-react";
import { Card, CardContent } from "@iefa/ui";
import { Badge } from "@iefa/ui";
import type { DayMeals } from "~/utils/RanchoUtils";

interface Selections {
  [date: string]: DayMeals;
}

interface SimplifiedStatsProps {
  selections: Selections;
  dates: string[];
}

const SimplifiedMilitaryStats = memo<SimplifiedStatsProps>(
  ({ selections, dates }) => {
    const stats = useMemo(() => {
      // A variável 'today' foi removida pois não era utilizada.
      const next7Days = dates.slice(0, 7);

      let totalMealsNext7Days = 0;
      let daysWithMealsNext7Days = 0;

      next7Days.forEach((date) => {
        const daySelections = selections[date];
        if (daySelections) {
          const mealsCount =
            Object.values(daySelections).filter(Boolean).length;
          if (mealsCount > 0) {
            daysWithMealsNext7Days++;
            totalMealsNext7Days += mealsCount;
          }
        }
      });

      // Próxima refeição
      let nextMeal = null;
      const mealOrder = ["cafe", "almoco", "janta", "ceia"];

      // O array 'dates' já vem na ordem correta, começando de hoje (local)
      for (const date of dates) {
        const daySelections = selections[date];
        if (daySelections) {
          for (const meal of mealOrder) {
            if (daySelections[meal as keyof DayMeals]) {
              nextMeal = { date, meal };
              break;
            }
          }
          if (nextMeal) break;
        }
      }

      return {
        totalMealsNext7Days,
        daysWithMealsNext7Days,
        nextMeal,
      };
    }, [selections, dates]);

    const formatDate = (dateStr: string) => {
      // CORRIGIDO: Evita que o fuso horário mude a data para o dia anterior.
      // new Date('2025-08-16') cria a data em UTC (meia-noite).
      // Em fusos negativos (como -03:00), isso vira 21:00 do dia anterior.
      // A solução é construir a data manualmente para forçar o fuso local.
      const [year, month, day] = dateStr.split("-").map(Number);
      // O mês no construtor do Date é 0-indexado (0-11), por isso month - 1.
      const date = new Date(year, month - 1, day);

      return date.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      });
    };

    const formatMeal = (meal: string) => {
      const mealNames = {
        cafe: "Café",
        almoco: "Almoço",
        janta: "Janta",
        ceia: "Ceia",
      };
      return mealNames[meal as keyof typeof mealNames] || meal;
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Próxima Refeição */}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Utensils className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Próxima Refeição
                  </p>
                  {stats.nextMeal ? (
                    <div>
                      <p className="text-lg font-bold text-gray-900">
                        {formatMeal(stats.nextMeal.meal)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(stats.nextMeal.date)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-lg font-bold text-gray-400">Nenhuma</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Próximos 7 Dias */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    Próximos 7 Dias
                  </p>
                  <p className="text-lg font-bold text-gray-900">
                    {stats.totalMealsNext7Days} refeições
                  </p>
                  <p className="text-sm text-gray-500">
                    em {stats.daysWithMealsNext7Days} dias
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Geral */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <CalendarDays className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium text-gray-600">Status</p>
                  <Badge
                    variant={
                      stats.totalMealsNext7Days > 0 ? "default" : "secondary"
                    }
                    className="mt-1"
                  >
                    {stats.totalMealsNext7Days > 0
                      ? "Refeições Agendadas"
                      : "Sem Refeições"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

SimplifiedMilitaryStats.displayName = "SimplifiedMilitaryStats";

export default SimplifiedMilitaryStats;
